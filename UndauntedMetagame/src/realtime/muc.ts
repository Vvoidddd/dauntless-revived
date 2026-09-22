import { Element } from "ltx";
import { logger } from "../logger";
import { CheckNickname, NamePartOf } from "./chatnick";
import { Bucket, ChildNamed, EscapeXml, Jid, NS, TakeToken, TextOf } from "./xmpp";

// Chat rooms (multi-user chat) the way the 1.4.4 client needs them (docs/findings/chat.md, "Rooms").
// Read from the game's executable (image base 0x140000000):
//
// - A room presence is the client's only if it comes from exactly "muc." + its domain (0x143a379d2).
// - Each occupant is known by the nickname it joined with: the client splits it at ":" into the name
//   (part 1, URL-decoded) and the account id (part 2), and takes the member id from <item jid> when it is
//   there (0x1408fe300, 0x1408c3500). A message is matched to its sender through that occupant's
//   presence (0x1408a83c0); without one the sender shows as "[unknown]".
// - The joiner's own presence (its account id is in the nickname, 0x143a34acd) completes the join
//   (0x143a296b0); an error presence for a pending join drops the room cleanly and reports a failed
//   join (0x143a34d80). Its own unavailable presence completes a leave (0x143a28180).
//
// So: every nickname is kept byte for byte and echoed in every "from"; every occupant presence carries
// <item jid>; occupants learn about each other in both directions; every message goes back to its sender
// too; and a refused join is an error presence, never a rewritten nickname. Two sessions of one account
// never see each other in a room: the client's self test would take the other one's presence for its own.

export const MAX_ROOMS_PER_SESSION = 8;
export const MAX_OCCUPANTS = 128;
export const MAX_ROOMS = 1000;
export const MAX_NICK_BYTES = 1023;
const JOIN_BURST = 10;
const JOIN_REFILL_MS = 6 * 1000;
const MESSAGE_BURST = 8;
const MESSAGE_REFILL_MS = 1000;
const BODY_LIMIT = 2048;
const MAX_ID = 128;

export type NickCheckMode = "enforce" | "log";
export type LeaveReason = "left" | "disconnect" | "evicted" | "replaced";
export type JoinRefusal = "nick-account" | "nick-resource" | "nick-format" | "nick-name" | "not-member" | "not-allowed" | "conflict" | "limit";

// What a room needs from a chat session (chat.ts owns the sessions)
export type MucSession = {
    readonly Id: number,
    Uid?: string,
    Resource?: string,
    Domain: string,
    NameAtLogin?: string,
    Ended: boolean,
    // Bare room JID -> the nickname this session holds there
    Rooms: Map<string, string>,
    Joins: Bucket,
    Messages: Bucket
};

export type MucHost = {
    Send(Session: MucSession, Stanza: string): void,
    Clock(): number,
    LogOnce(Key: string, WindowMs?: number): boolean,
    UsernameOf(Uid: string): string | undefined,
    NickCheck: NickCheckMode
};

type Room = {
    Jid: string,     // <local>@muc.<domain>, the local part as the client sent it
    Local: string,
    // Join order
    Occupants: Map<MucSession, string>
};

const ERRORS: Record<JoinRefusal, { Type: string, Condition: string }> = {
    "nick-account": { Type: "auth", Condition: "forbidden" },
    "nick-resource": { Type: "auth", Condition: "forbidden" },
    "nick-format": { Type: "auth", Condition: "forbidden" },
    "nick-name": { Type: "auth", Condition: "forbidden" },
    "not-member": { Type: "auth", Condition: "forbidden" },
    "not-allowed": { Type: "cancel", Condition: "not-allowed" },
    "conflict": { Type: "cancel", Condition: "conflict" },
    "limit": { Type: "wait", Condition: "service-unavailable" }
};

export function FullJid(Session: MucSession): string {
    return `${Session.Uid}@${Session.Domain}/${Session.Resource}`;
}

export function BodyLength(Body: string): number {
    return [...Body].length;
}

export function TakeMessageToken(Session: MucSession, Now: number): boolean {
    return TakeToken(Session.Messages, MESSAGE_BURST, MESSAGE_REFILL_MS, Now);
}

export { JOIN_BURST, MESSAGE_BURST };

export class MucService {
    private readonly rooms = new Map<string, Room>();
    private readonly host: MucHost;

    constructor(Host: MucHost) {
        this.host = Host;
    }

    get RoomCount(): number {
        return this.rooms.size;
    }

    // ---- Stanzas ----

    private occupantPresence(Room: Room, Nick: string, Occupant: MucSession, To: MucSession, Options: { Self?: boolean, Unavailable?: boolean, Evicted?: boolean } = {}): string {
        const Statuses = `${Options.Self ? `<status code="110"/>` : ""}${Options.Evicted ? `<status code="307"/>` : ""}`;

        return `<presence xmlns="${NS.CLIENT}"${Options.Unavailable ? ` type="unavailable"` : ""} from="${EscapeXml(`${Room.Jid}/${Nick}`)}" to="${EscapeXml(FullJid(To))}">`
            + `<x xmlns="${NS.MUC_USER}"><item affiliation="none" role="${Options.Unavailable ? "none" : "participant"}" jid="${EscapeXml(FullJid(Occupant))}"/>${Statuses}</x></presence>`;
    }

    private refuse(Session: MucSession, RoomJid: string, Local: string, Nick: string, Reason: JoinRefusal): void {
        const Error_ = ERRORS[Reason];

        if(this.host.LogOnce(`join-refused|${Session.Uid}|${RoomJid}|${Reason}`)){
            logger.info(`chat: join refused room=${Local} uid=${Session.Uid} reason=${Reason}`);
        }

        this.host.Send(Session, `<presence xmlns="${NS.CLIENT}" type="error" from="${EscapeXml(`${RoomJid}/${Nick}`)}" to="${EscapeXml(FullJid(Session))}">`
            + `<x xmlns="${NS.MUC}"/><error type="${Error_.Type}"><${Error_.Condition} xmlns="${NS.STANZAS}"/></error></presence>`);
    }

    private messageError(Session: MucSession, RoomJid: string, Id: string | undefined): void {
        this.host.Send(Session, `<message xmlns="${NS.CLIENT}" type="error"${Id !== undefined ? ` id="${EscapeXml(Id)}"` : ""} from="${EscapeXml(RoomJid)}" to="${EscapeXml(FullJid(Session))}">`
            + `<error type="modify"><not-acceptable xmlns="${NS.STANZAS}"/></error></message>`);
    }

    // ---- Joins and leaves ----

    IsMucDomain(Session: MucSession, Domain: string): boolean {
        return Domain === `muc.${Session.Domain}`;
    }

    Join(Session: MucSession, To: Jid): void {
        const Uid = Session.Uid!;
        const Nick = To.Resource ?? "";
        const RoomJid = `${To.Local}@${To.Domain}`;
        const Now = this.host.Clock();

        if(!this.IsMucDomain(Session, To.Domain)){
            this.refuse(Session, RoomJid, To.Local, Nick, "not-allowed");
            return;
        }

        const Existing = this.rooms.get(RoomJid);
        const Held = Session.Rooms.get(RoomJid);

        if(!TakeToken(Session.Joins, JOIN_BURST, JOIN_REFILL_MS, Now)){
            this.refuse(Session, RoomJid, To.Local, Nick, "limit");
            return;
        }

        // Rejoin with the same nickname: this session alone gets the room again, nobody else hears of it
        if(Existing !== undefined && Held === Nick){
            this.welcome(Session, Existing, Nick);
            logger.info(`chat: join room=${To.Local} uid=${Uid} name=${NamePartOf(Nick) ?? "?"} occupants=${this.others(Existing, Session).length} rejoin`);
            return;
        }

        if(Nick.length === 0 || Buffer.byteLength(Nick, "utf8") > MAX_NICK_BYTES){
            this.refuse(Session, RoomJid, To.Local, Nick, "nick-format");
            return;
        }

        const Check = CheckNickname(Nick, Uid, Session.Resource!, [this.host.UsernameOf(Uid), Session.NameAtLogin]);

        if(!Check.Ok){
            if(this.host.NickCheck === "enforce"){
                this.refuse(Session, RoomJid, To.Local, Nick, Check.Reason);
                return;
            }

            if(this.host.LogOnce(`nick-log|${Session.Id}|${RoomJid}`)){
                logger.warn(`chat: join nickname not checked room=${To.Local} uid=${Uid} reason=${Check.Reason} (CHAT_NICK_CHECK=log)`);
            }
        }

        // A different nickname in a room this session is already in: leave with the old one first
        if(Existing !== undefined && Held !== undefined){
            this.remove(Session, Existing, "left");
        }

        const Room = this.rooms.get(RoomJid);

        for(const [Other, OtherNick] of Room?.Occupants ?? []){
            if(Other !== Session && OtherNick === Nick){
                this.refuse(Session, RoomJid, To.Local, Nick, "conflict");
                return;
            }
        }

        if(Session.Rooms.size >= MAX_ROOMS_PER_SESSION || (Room !== undefined && Room.Occupants.size >= MAX_OCCUPANTS) || (Room === undefined && this.rooms.size >= MAX_ROOMS)){
            this.refuse(Session, RoomJid, To.Local, Nick, "limit");
            return;
        }

        const Joined = Room ?? { Jid: RoomJid, Local: To.Local, Occupants: new Map<MucSession, string>() };
        const Others = this.others(Joined, Session);

        this.rooms.set(RoomJid, Joined);

        // 1. The joiner hears of everyone already there; 2. they hear of the joiner; 3. the joiner's own
        // presence last, which completes the join on its screen
        for(const [Other, OtherNick] of Others){
            this.host.Send(Session, this.occupantPresence(Joined, OtherNick, Other, Session));
        }

        for(const [Other] of Others){
            this.host.Send(Other, this.occupantPresence(Joined, Nick, Session, Other));
        }

        Joined.Occupants.set(Session, Nick);
        Session.Rooms.set(RoomJid, Nick);
        this.host.Send(Session, this.occupantPresence(Joined, Nick, Session, Session, { Self: true }));
        logger.info(`chat: join room=${To.Local} uid=${Uid} name=${Check.Ok ? Check.Name : (NamePartOf(Nick) ?? "?")} occupants=${Others.length}`);
    }

    // Everyone in the room this session may see: not the session itself, not its own account's others
    private others(Room: Room, Session: MucSession): Array<[MucSession, string]> {
        return [...Room.Occupants].filter(([Other]) => Other !== Session && Other.Uid !== Session.Uid);
    }

    private welcome(Session: MucSession, Room: Room, Nick: string): void {
        for(const [Other, OtherNick] of this.others(Room, Session)){
            this.host.Send(Session, this.occupantPresence(Room, OtherNick, Other, Session));
        }

        this.host.Send(Session, this.occupantPresence(Room, Nick, Session, Session, { Self: true }));
    }

    Leave(Session: MucSession, To: Jid): void {
        const RoomJid = `${To.Local}@${To.Domain}`;
        const Room = this.rooms.get(RoomJid);

        if(Room === undefined || !Room.Occupants.has(Session)){
            // Not in it (after a refused join, or a restart of the metagame): confirm the leave anyway, so the
            // client's room does not stay waiting for it
            if(this.IsMucDomain(Session, To.Domain) && To.Resource !== undefined && To.Resource.length > 0){
                this.host.Send(Session, `<presence xmlns="${NS.CLIENT}" type="unavailable" from="${EscapeXml(`${RoomJid}/${To.Resource}`)}" to="${EscapeXml(FullJid(Session))}">`
                    + `<x xmlns="${NS.MUC_USER}"><item affiliation="none" role="none" jid="${EscapeXml(FullJid(Session))}"/><status code="110"/></x></presence>`);
            }

            return;
        }

        this.remove(Session, Room, "left");
    }

    // A broadcast unavailable, or the end of the session
    LeaveAll(Session: MucSession, Reason: LeaveReason): void {
        for(const RoomJid of [...Session.Rooms.keys()]){
            const Room = this.rooms.get(RoomJid);

            if(Room !== undefined){
                this.remove(Session, Room, Reason);
            }
        }

        Session.Rooms.clear();
    }

    private remove(Session: MucSession, Room: Room, Reason: LeaveReason): void {
        const Nick = Room.Occupants.get(Session);

        if(Nick === undefined){
            return;
        }

        const Evicted = Reason === "evicted";

        for(const [Other] of this.others(Room, Session)){
            this.host.Send(Other, this.occupantPresence(Room, Nick, Session, Other, { Unavailable: true, Evicted }));
        }

        Room.Occupants.delete(Session);
        Session.Rooms.delete(Room.Jid);

        if(!Session.Ended && (Reason === "left" || Reason === "evicted")){
            this.host.Send(Session, this.occupantPresence(Room, Nick, Session, Session, { Unavailable: true, Self: true, Evicted }));
        }

        if(Room.Occupants.size === 0){
            this.rooms.delete(Room.Jid);
        }

        logger.info(`chat: leave room=${Room.Local} uid=${Session.Uid} reason=${Reason}`);
    }

    // ---- Room messages ----

    GroupChat(Session: MucSession, To: Jid, Node: Element): void {
        const RoomJid = `${To.Local}@${To.Domain}`;
        const IdAttr = typeof Node.attrs.id === "string" ? Node.attrs.id as string : undefined;
        const Id = IdAttr !== undefined && IdAttr.length <= MAX_ID ? IdAttr : undefined;
        const BodyNode = ChildNamed(Node, "body");

        // A subject change alone is ignored
        if(BodyNode === undefined && ChildNamed(Node, "subject") !== undefined){
            return;
        }

        const Room = this.rooms.get(RoomJid);
        const Nick = Room?.Occupants.get(Session);
        const Body = TextOf(BodyNode);
        const Length = BodyLength(Body);

        if(Room === undefined || Nick === undefined || Length === 0 || Length > BODY_LIMIT){
            this.messageError(Session, RoomJid, Id);
            return;
        }

        if(!TakeMessageToken(Session, this.host.Clock())){
            if(this.host.LogOnce(`message-rate|${Session.Id}`, 60 * 1000)){
                logger.warn(`chat: message limit c=${Session.Id} uid=${Session.Uid} room=${Room.Local}`);
            }

            this.messageError(Session, RoomJid, Id);
            return;
        }

        const From = EscapeXml(`${Room.Jid}/${Nick}`);
        const Text = EscapeXml(Body);
        let Delivered = 0;

        for(const [Recipient] of Room.Occupants){
            if(Recipient !== Session && Recipient.Uid === Session.Uid){
                continue;
            }

            this.host.Send(Recipient, `<message xmlns="${NS.CLIENT}" type="groupchat"${Id !== undefined ? ` id="${EscapeXml(Id)}"` : ""} from="${From}" to="${EscapeXml(FullJid(Recipient))}"><body>${Text}</body></message>`);
            Delivered++;
        }

        logger.info(`chat: message room=${Room.Local} uid=${Session.Uid} len=${Length} to=${Delivered}`);
    }
}

