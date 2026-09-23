import { Element } from "ltx";
import type { FriendshipEvent } from "../controllers/friends";
import { logger } from "../logger";
import { Bucket, ChildNamed, EscapeXml, NS, TakeToken, TextOf } from "./xmpp";

// Friends' online status (CHAT_PRESENCE=1, with CHAT=1; docs/findings/chat.md). Harmonic's fork
// (github.com/Harmonicrain/Undaunted 895f7c7) had the idea of a presence service; this is written for our
// chat server and shares no code with his. The 1.4.4 client never asks for a roster, never subscribes and
// never probes: it only knows what the server pushes (C:\dr\data\plans\chat\presence-friends.md, B), so:
//
// - A player's own broadcast presence (no "to") is relayed to every session of each ACCEPTED friend the
//   player has not blocked and is not blocked by, once that session has sent a presence of its own: <show>
//   and the <status> JSON exactly as the client sent them, from the player's FULL JID (the presence module
//   drops a sender without a resource, B 0x143a382b0). Every later change is relayed the same way.
// - At a session's first broadcast it gets the current presence of each friend who is online in that sense.
// - When a session ends (its <close/>, a ping timeout, a dropped socket, replacement) or broadcasts
//   type="unavailable", its friends get type="unavailable" from its full JID; if the account still has
//   another session with a presence, that presence follows, so the friend does not show as offline.
// - An accepted friend request (HTTP) pushes the client's friends-list message from xmpp-admin@<domain>
//   (FOnlineFriendsMcp::OnXmppMessageReceived 0x1408ba550 accepts only that sender) to both players, then
//   exchanges their presences; an unfriend or a block sends each the other's unavailable.
//
// The one rule that must never break: no stanza outside a room ever reaches a player from the player's own
// account, not even from a second session of it. The party's automatic kick of "offline" members only runs
// while the local player's own Phoenix presence is online (B 0x1415f7562), and the client's own presence
// arriving from the server is what could set it. Deliver() refuses such a stanza, and the chat tests check
// every stanza the server sends.
//
// A client that changes its presence too often has the changes held back (PRESENCE_BURST, then one per
// PRESENCE_REFILL_MS); the latest one goes out at the next tick.

export const PRESENCE_BURST = 5;
export const PRESENCE_REFILL_MS = 2000;
// <status> is a short JSON object (about 250 characters from the real client); a longer one is not relayed
export const MAX_STATUS_LENGTH = 4096;
export const ADMIN_LOCAL = "xmpp-admin";
export const FRIEND_MESSAGE_TYPE = "com.epicgames.friends.core.apiobjects.Friend";
const SHOW_VALUES = new Set(["away", "chat", "dnd", "xa"]);

// What the client last broadcast: <show> (only the four values it writes) and <status>, as sent
export type ClientPresence = { Show?: string, Status?: string };

export type PresenceSession = {
    Id: number,
    Uid?: string,
    Domain: string,
    Resource?: string,
    Ended: boolean,
    LastPresence?: ClientPresence,
    PresenceTokens: Bucket,
    PresencePending: boolean
};

export type PresenceAccess = {
    // The account's ACCEPTED friends
    FriendsOf(Uid: string): string[],
    IsBlockedEitherWay(A: string, B: string): boolean
};

export type PresenceHost = {
    // The account's bound sessions
    SessionsOf(Uid: string): readonly PresenceSession[],
    // Every session
    Sessions(): Iterable<PresenceSession>,
    Send(Session: PresenceSession, Stanza: string): void,
    Clock(): number,
    LogOnce(Key: string, WindowMs?: number): boolean
};

function SameAccount(A: string | undefined, B: string | undefined){
    return A !== undefined && B !== undefined && A.toLowerCase() === B.toLowerCase();
}

function FullJidOf(Session: PresenceSession){
    return `${Session.Uid}@${Session.Domain}/${Session.Resource}`;
}

function IsOnline(Session: PresenceSession){
    return !Session.Ended && Session.Uid !== undefined && Session.Resource !== undefined;
}

export class FriendPresence {
    private readonly host: PresenceHost;
    private readonly access: PresenceAccess;

    constructor(Host: PresenceHost, Access: PresenceAccess){
        this.host = Host;
        this.access = Access;
    }

    // ---- Who sees whom ----

    private friendsOf(Uid: string): string[] {
        try{
            return [...new Set(this.access.FriendsOf(Uid))].filter((Friend) => !SameAccount(Friend, Uid) && !this.access.IsBlockedEitherWay(Uid, Friend));
        }
        catch(error){
            if(this.host.LogOnce(`presence-friends|${Uid}`, 60 * 1000)){
                logger.warn(error, `chat: presence: could not read the friends of ${Uid}; nothing relayed`);
            }

            return [];
        }
    }

    // The sessions of the account's friends that are online for presence: bound, and they sent a presence of
    // their own (a session that has not sent one yet hears of its friends at its first). Never one of the
    // account's own sessions.
    private audience(Uid: string): PresenceSession[] {
        return this.friendsOf(Uid).flatMap((Friend) => this.present(Friend));
    }

    private present(Uid: string): PresenceSession[] {
        return this.host.SessionsOf(Uid).filter((Each) => IsOnline(Each) && Each.LastPresence !== undefined);
    }

    // ---- Sending ----

    // Every stanza of this module goes through here: none reaches a session of the account it names as its sender
    private deliver(FromUid: string | undefined, To: PresenceSession, Stanza: string): void {
        if(FromUid === undefined || To.Uid === undefined || SameAccount(FromUid, To.Uid)){
            if(this.host.LogOnce(`presence-self|${To.Uid}`, 60 * 1000)){
                logger.error(`chat: presence: refused to send c=${To.Id} a stanza from its own account`);
            }

            return;
        }

        this.host.Send(To, Stanza);
    }

    private presenceStanza(From: PresenceSession, To: PresenceSession): string {
        const Shown = From.LastPresence ?? {};

        return `<presence xmlns="${NS.CLIENT}" from="${EscapeXml(FullJidOf(From))}" to="${EscapeXml(FullJidOf(To))}">`
            + (Shown.Show !== undefined ? `<show>${Shown.Show}</show>` : "")
            + (Shown.Status !== undefined ? `<status>${EscapeXml(Shown.Status)}</status>` : "")
            + `</presence>`;
    }

    private unavailableStanza(From: PresenceSession, To: PresenceSession): string {
        return `<presence xmlns="${NS.CLIENT}" type="unavailable" from="${EscapeXml(FullJidOf(From))}" to="${EscapeXml(FullJidOf(To))}"/>`;
    }

    // The friends-list push: {"type", "payload", "timestamp"} in the body of a plain message from xmpp-admin
    private friendMessage(To: PresenceSession, Other: string, Direction: "INBOUND" | "OUTBOUND", CreatedAt: number): string {
        const Now = new Date(this.host.Clock()).toISOString();
        const Body = JSON.stringify({
            type: FRIEND_MESSAGE_TYPE,
            payload: { accountId: Other, status: "ACCEPTED", direction: Direction, created: new Date(CreatedAt > 0 ? CreatedAt : this.host.Clock()).toISOString() },
            timestamp: Now
        });

        return `<message xmlns="${NS.CLIENT}" from="${ADMIN_LOCAL}@${EscapeXml(To.Domain)}" to="${EscapeXml(FullJidOf(To))}"><body>${EscapeXml(Body)}</body></message>`;
    }

    private relay(Session: PresenceSession): number {
        const Audience = this.audience(Session.Uid!);

        for(const To of Audience){
            this.deliver(Session.Uid, To, this.presenceStanza(Session, To));
        }

        return Audience.length;
    }

    // ---- The chat server's events ----

    // A broadcast presence (no "to", no type) from a bound session
    Broadcast(Session: PresenceSession, Node: Element): void {
        if(!IsOnline(Session)){
            return;
        }

        const Show = TextOf(ChildNamed(Node, "show")).trim();
        let Status = TextOf(ChildNamed(Node, "status"));

        if(Status.length > MAX_STATUS_LENGTH){
            if(this.host.LogOnce(`presence-long|${Session.Id}`)){
                logger.info(`chat: presence c=${Session.Id} status of ${Status.length} characters not relayed`);
            }

            Status = "";
        }

        const Next: ClientPresence = { Show: SHOW_VALUES.has(Show) ? Show : undefined, Status: Status.length > 0 ? Status : undefined };
        const Previous = Session.LastPresence;

        Session.LastPresence = Next;

        if(Previous === undefined){
            // First presence of this session: it hears of the friends who are online, they hear of it
            let Told = 0;

            for(const Friend of this.audience(Session.Uid!)){
                this.deliver(Friend.Uid, Session, this.presenceStanza(Friend, Session));
                Told++;
            }

            TakeToken(Session.PresenceTokens, PRESENCE_BURST, PRESENCE_REFILL_MS, this.host.Clock());
            Session.PresencePending = false;
            logger.info(`chat: presence c=${Session.Id} uid=${Session.Uid} online: told ${this.relay(Session)} friend session(s), heard of ${Told}`);
            return;
        }

        if(Previous.Show === Next.Show && Previous.Status === Next.Status){
            return;
        }

        if(TakeToken(Session.PresenceTokens, PRESENCE_BURST, PRESENCE_REFILL_MS, this.host.Clock())){
            Session.PresencePending = false;
            logger.debug(`chat: presence c=${Session.Id} changed: relayed to ${this.relay(Session)} friend session(s)`);
        }
        else{
            Session.PresencePending = true;
        }
    }

    // The session went offline: an unavailable broadcast, or the session ended (it is no longer among the
    // account's sessions by then)
    Unavailable(Session: PresenceSession, Why: string): void {
        if(Session.LastPresence === undefined || Session.Uid === undefined || Session.Resource === undefined){
            return;
        }

        Session.LastPresence = undefined;
        Session.PresencePending = false;

        const Audience = this.audience(Session.Uid);

        for(const To of Audience){
            this.deliver(Session.Uid, To, this.unavailableStanza(Session, To));
        }

        // Another session of the same account is still online: its presence again
        const Other = this.host.SessionsOf(Session.Uid).find((Each) => Each !== Session && IsOnline(Each) && Each.LastPresence !== undefined);

        if(Other !== undefined){
            for(const To of Audience){
                this.deliver(Other.Uid, To, this.presenceStanza(Other, To));
            }
        }

        logger.info(`chat: presence c=${Session.Id} uid=${Session.Uid} offline (${Why}): told ${Audience.length} friend session(s)${Other !== undefined ? `; c=${Other.Id} is still online` : ""}`);
    }

    // Held-back changes whose turn has come (the chat server's 1 s tick)
    Tick(): void {
        const Now = this.host.Clock();

        for(const Session of this.host.Sessions()){
            if(Session.PresencePending && IsOnline(Session) && Session.LastPresence !== undefined && TakeToken(Session.PresenceTokens, PRESENCE_BURST, PRESENCE_REFILL_MS, Now)){
                Session.PresencePending = false;
                this.relay(Session);
            }
        }
    }

    // A friendship began or ended over HTTP (controllers/friends.ts)
    Friendship(Event: FriendshipEvent): void {
        if(Event.Kind === "accepted"){
            this.accepted(Event.Requester, Event.Accepter, Event.CreatedAt);
        }
        else{
            this.ended(Event.A, Event.B);
        }
    }

    private accepted(Requester: string, Accepter: string, CreatedAt: number): void {
        if(SameAccount(Requester, Accepter) || this.access.IsBlockedEitherWay(Requester, Accepter)){
            return;
        }

        const OfRequester = this.host.SessionsOf(Requester).filter(IsOnline);
        const OfAccepter = this.host.SessionsOf(Accepter).filter(IsOnline);

        // The list entry to every session first, then the presences between the sessions that are online
        // for presence (the others hear of the new friend at their first presence)
        for(const To of OfAccepter){
            this.deliver(ADMIN_LOCAL, To, this.friendMessage(To, Requester, "INBOUND", CreatedAt));
        }

        for(const To of OfRequester){
            this.deliver(ADMIN_LOCAL, To, this.friendMessage(To, Accepter, "OUTBOUND", CreatedAt));
        }

        for(const [From, To] of [[this.present(Requester), this.present(Accepter)], [this.present(Accepter), this.present(Requester)]]){
            for(const Sender of From){
                for(const Receiver of To){
                    this.deliver(Sender.Uid, Receiver, this.presenceStanza(Sender, Receiver));
                }
            }
        }

        if(OfRequester.length + OfAccepter.length > 0){
            logger.info(`chat: presence: ${Requester} and ${Accepter} are friends now: told ${OfRequester.length} and ${OfAccepter.length} session(s)`);
        }
    }

    // Each sees the other go, once; after that neither is in the other's audience
    private ended(A: string, B: string): void {
        const OfA = this.present(A);
        const OfB = this.present(B);

        for(const [From, To] of [[OfA, OfB], [OfB, OfA]]){
            for(const Sender of From){
                for(const Receiver of To){
                    this.deliver(Sender.Uid, Receiver, this.unavailableStanza(Sender, Receiver));
                }
            }
        }
    }
}
