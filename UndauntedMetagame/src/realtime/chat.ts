import crypto from "node:crypto";
import { createServer, IncomingMessage, Server as HttpServer } from "node:http";
import type { Duplex } from "node:stream";
import type { Request } from "express";
import { Element } from "ltx";
import WebSocket, { RawData, WebSocketServer } from "ws";
import { ValidateMetagameJWTAndGetPayload } from "../controllers/auth";
import { FindUsernameForUserId, IsAccountIdShape } from "../controllers/login";
import { logger } from "../logger";
import { ClientAddressOf, IsTrustedGatewayRequest } from "../middleware/RequestOrigin";
import {
    AttrOf, Bucket, ChildNamed, DEFAULT_DOMAIN, EscapeXml, HasMarkupDeclaration, IsHostName, LocalName, NewBucket, NS,
    ParseFrame, RedactFrame, TakeToken, TextOf
} from "./xmpp";

// The game's chat connection (roadmap 3.10; docs/findings/chat.md): XMPP over WebSocket, in the metagame's
// own process, on its own loopback port (CHAT_PORT, default 61099). In public mode the path is launcher
// relay -> gateway :443 -> 127.0.0.1:61099; on a dev PC the game connects straight to it.
//
// A player logs in with the same signed token as the metagame (SASL PLAIN), never with an account id
// alone. No stanza, token, SASL payload or message text is logged; CHAT_TRACE=1 logs frames with those
// redacted.
//
// Safety rules, because the game reconnects on its next tick when an established connection drops:
// - every socket and server has an error listener, and every stanza handler is guarded, so bad input
//   can never take the metagame down;
// - a logged-in connection is never closed over bad input: bad stanzas are dropped and counted, and the
//   stanza errors of docs/findings/chat.md are answered. Only the client's <close/>, a ping timeout,
//   replacement, shutdown, an oversized frame or sustained abuse end one, and any end by the server
//   holds that account's next login back for 60 s, so the game backs off 15-45 s instead of looping.

const FRAME_LIMIT = 32768;
export const BODY_LIMIT = 2048;
const MAX_SOCKETS = 64;
const MAX_UNAUTHENTICATED_PER_ADDRESS = 8;
const LOGIN_DEADLINE_MS = 15 * 1000;
const BIND_DEADLINE_MS = 30 * 1000;
const SASL_FAILURE_LIMIT = 10;
const SASL_FAILURE_WINDOW_MS = 10 * 60 * 1000;
const SASL_THROTTLE_MS = 10 * 60 * 1000;
const UID_THROTTLE_MS = 60 * 1000;
const IDLE_PING_MS = 50 * 1000;
const PING_TIMEOUT_MS = 30 * 1000;
const STANZA_BURST = 60;
const STANZA_REFILL_MS = 1000 / 30;
const ABUSE_DROPS = 100;
const ABUSE_WINDOW_MS = 60 * 1000;
const LOG_ONCE_MS = 10 * 60 * 1000;
const MAX_RESOURCE = 256;
const MAX_ID = 128;

export type ChatOptions = {
    Trace?: boolean,
    // Tests: a controllable clock, and no timer of its own (the test calls Tick)
    Clock?: () => number,
    AutoTick?: boolean
};

type EndReason = "close" | "socket" | "ping-timeout" | "replaced" | "abuse" | "size" | "shutdown" | "timeout" | "refused";

export type ChatSession = {
    Id: number,
    Socket: WebSocket,
    Address: string,
    Via: "gateway" | "direct",
    OpenedAt: number,
    Domain: string,
    Uid?: string,
    NameAtLogin?: string,
    Resource?: string,
    SaslFailed: boolean,
    Ended: boolean,
    LastInbound: number,
    PingId?: string,
    PingDeadline?: number,
    Stanzas: Bucket,
    Drops: number[],
    LastDropLog: number,
    Namespaces: Set<string>,
    Available: boolean,
    Rooms: Set<string>
};

export function FullJidOf(Session: ChatSession): string {
    return `${Session.Uid}@${Session.Domain}/${Session.Resource}`;
}

function ErrorName(Error_: unknown): string {
    return Error_ instanceof Error ? Error_.name : typeof Error_;
}

export class ChatServer {
    private readonly http: HttpServer;
    private readonly ws: WebSocketServer;
    private readonly clients = new Set<ChatSession>();
    // Bound sessions per account, oldest first
    private readonly byUid = new Map<string, ChatSession[]>();
    private readonly saslFailures = new Map<string, number[]>();
    private readonly throttledAddresses = new Map<string, number>();
    private readonly throttledUids = new Map<string, number>();
    private readonly loggedOnce = new Map<string, number>();
    private readonly clock: () => number;
    private readonly trace: boolean;
    private readonly ticker?: NodeJS.Timeout;
    private nextId = 1;
    private nextPing = 1;

    constructor(Options: ChatOptions = {}) {
        this.clock = Options.Clock ?? (() => Date.now());
        this.trace = Options.Trace === true;
        this.http = createServer((_req, res) => { res.writeHead(404); res.end(); });
        this.http.on("clientError", (_error, socket) => socket.destroy());
        this.http.on("upgrade", (req, socket, head) => this.upgrade(req, socket, head));
        this.ws = new WebSocketServer({ noServer: true, maxPayload: FRAME_LIMIT, perMessageDeflate: false, clientTracking: false });
        this.ws.on("error", (error) => logger.error(`chat: WebSocket server error (${ErrorName(error)})`));

        if(Options.AutoTick !== false){
            this.ticker = setInterval(() => this.Tick(), 1000);
            this.ticker.unref();
        }
    }

    get port(): number {
        const address = this.http.address();
        return typeof address === "object" && address !== null ? address.port : 0;
    }

    async listen(port: number, host = "127.0.0.1"): Promise<void> {
        await new Promise<void>((resolve, reject) => {
            this.http.once("error", reject);
            this.http.listen(port, host, () => { this.http.removeListener("error", reject); resolve(); });
        });
        this.http.on("error", (error) => logger.error(`chat: listener error (${ErrorName(error)})`));
        logger.info(`chat: listening on ${host}:${this.port}`);
    }

    // Shutdown: <close/> to every session, then whatever is still open is cut after 1 s
    async close(): Promise<void> {
        if(this.ticker !== undefined){
            clearInterval(this.ticker);
        }

        const Open = [...this.clients];

        for(const Session of Open){
            this.end(Session, "shutdown");
        }

        await new Promise<void>((resolve) => {
            const Deadline = setTimeout(done, 1000);
            const Check = setInterval(() => { if(Open.every((Session) => Session.Socket.readyState === WebSocket.CLOSED)) done(); }, 20);

            function done(){
                clearTimeout(Deadline);
                clearInterval(Check);
                resolve();
            }
        });

        for(const Session of Open){
            Session.Socket.terminate();
        }

        await new Promise<void>((resolve) => this.ws.close(() => resolve()));
        await new Promise<void>((resolve) => this.http.listening ? this.http.close(() => resolve()) : resolve());
    }

    // The deadlines, pings and sweeps. A 1 s timer calls it; tests call it with their own clock.
    Tick(): void {
        const Now = this.clock();

        for(const Session of [...this.clients]){
            if(Session.Ended){
                continue;
            }

            if(Session.Uid === undefined && Now - Session.OpenedAt >= LOGIN_DEADLINE_MS){
                this.end(Session, "timeout");
            }
            else if(Session.Uid !== undefined && Session.Resource === undefined && Now - Session.OpenedAt >= BIND_DEADLINE_MS){
                this.end(Session, "timeout");
            }
            else if(Session.Resource !== undefined){
                if(Session.PingDeadline !== undefined){
                    if(Now >= Session.PingDeadline){
                        this.end(Session, "ping-timeout");
                    }
                }
                else if(Now - Session.LastInbound >= IDLE_PING_MS){
                    this.ping(Session, PING_TIMEOUT_MS);
                }
            }
        }

        this.prune(Now);
    }

    // ---- Connections ----

    private upgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
        socket.on("error", () => socket.destroy());

        const Request_ = req as unknown as Request;
        const Address = ClientAddressOf(Request_);
        const Via = IsTrustedGatewayRequest(Request_) ? "gateway" : "direct";
        const Unauthenticated = [...this.clients].filter((Session) => Session.Address === Address && Session.Uid === undefined).length;

        if(this.clients.size >= MAX_SOCKETS || Unauthenticated >= MAX_UNAUTHENTICATED_PER_ADDRESS){
            if(this.logOnce(`busy|${Address}`)){
                logger.warn(`chat: refused a connection from=${Address} via=${Via} (${this.clients.size >= MAX_SOCKETS ? "too many connections" : "too many logins in progress from this address"})`);
            }

            socket.end("HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\nContent-Length: 0\r\n\r\n", () => socket.destroy());
            return;
        }

        try{
            this.ws.handleUpgrade(req, socket, head, (Socket) => this.connected(Socket, Address, Via));
        }
        catch(error){
            logger.warn(`chat: upgrade failed (${ErrorName(error)})`);
            socket.destroy();
        }
    }

    private connected(Socket: WebSocket, Address: string, Via: "gateway" | "direct"): void {
        const Now = this.clock();
        const Session: ChatSession = {
            Id: this.nextId++,
            Socket: Socket,
            Address: Address,
            Via: Via,
            OpenedAt: Now,
            Domain: DEFAULT_DOMAIN,
            SaslFailed: false,
            Ended: false,
            LastInbound: Now,
            Stanzas: NewBucket(STANZA_BURST, Now),
            Drops: [],
            LastDropLog: 0,
            Namespaces: new Set(),
            Available: false,
            Rooms: new Set()
        };

        this.clients.add(Session);
        logger.info(`chat: connect c=${Session.Id} from=${Address} via=${Via}`);

        // An oversized frame (1009), invalid UTF-8 in a text frame (1007) or a bad opcode: ws emits this
        // and closes the socket. Without a listener Node would throw and stop the whole metagame.
        Socket.on("error", (error: Error & { code?: string }) => {
            if(error.code === "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH"){
                this.countFailure(Session.Address, this.clock());
                this.end(Session, "size");
            }
            else{
                this.end(Session, "socket");
            }
        });
        Socket.on("close", () => this.end(Session, "socket"));
        // Text and binary frames alike are read as UTF-8 (the game sends text)
        Socket.on("message", (Data: RawData) => {
            try{
                this.frame(Session, (Buffer.isBuffer(Data) ? Data : Array.isArray(Data) ? Buffer.concat(Data) : Buffer.from(Data)).toString("utf8"));
            }
            catch(error){
                logger.error(`chat: stanza handler failed c=${Session.Id} (${ErrorName(error)})`);
            }
        });
    }

    private send(Session: ChatSession, Stanza: string): void {
        if(Session.Socket.readyState !== WebSocket.OPEN){
            return;
        }

        if(this.trace){
            logger.info(`chat: trace c=${Session.Id} out ${RedactFrame(Stanza)}`);
        }

        Session.Socket.send(Stanza);
    }

    // Ends a session once. The server-side ends of an established session hold that account's next
    // login back for 60 s (the game then backs off instead of reconnecting at once).
    private end(Session: ChatSession, Reason: EndReason): void {
        if(Session.Ended){
            return;
        }

        const Now = this.clock();

        Session.Ended = true;
        this.clients.delete(Session);
        this.leaveAll(Session, Reason === "replaced" ? "replaced" : "disconnect");

        if(Session.Uid !== undefined && Session.Resource !== undefined){
            const List = (this.byUid.get(Session.Uid) ?? []).filter((Other) => Other !== Session);

            if(List.length > 0) this.byUid.set(Session.Uid, List); else this.byUid.delete(Session.Uid);

            if(Reason === "ping-timeout" || Reason === "replaced" || Reason === "abuse" || Reason === "size"){
                this.throttledUids.set(Session.Uid, Now + UID_THROTTLE_MS);
            }
        }

        logger.info(`chat: closed c=${Session.Id} uid=${Session.Uid ?? "-"} reason=${Reason} after=${Math.round((Now - Session.OpenedAt) / 1000)}s`);

        if(Session.Socket.readyState === WebSocket.OPEN){
            if(Reason === "close" || Reason === "shutdown" || Reason === "replaced"){
                this.send(Session, `<close xmlns="${NS.FRAMING}"/>`);
                Session.Socket.close(1000);
            }
            else if(Reason === "size"){
                Session.Socket.close(1009);
            }
            else{
                Session.Socket.terminate();
            }
        }
    }

    private ping(Session: ChatSession, TimeoutMs: number): void {
        Session.PingId = `sp${this.nextPing++}`;
        Session.PingDeadline = this.clock() + TimeoutMs;
        this.send(Session, `<iq xmlns="${NS.CLIENT}" type="get" id="${Session.PingId}" from="${EscapeXml(Session.Domain)}" to="${EscapeXml(FullJidOf(Session))}"><ping xmlns="${NS.PING}"/></iq>`);
    }

    // ---- Throttles and log limits ----

    private logOnce(Key: string, WindowMs = LOG_ONCE_MS): boolean {
        const Now = this.clock();
        const Last = this.loggedOnce.get(Key);

        if(Last !== undefined && Now - Last < WindowMs){
            return false;
        }

        this.loggedOnce.set(Key, Now);
        return true;
    }

    private countFailure(Address: string, Now: number): void {
        const Recent = (this.saslFailures.get(Address) ?? []).filter((At) => Now - At < SASL_FAILURE_WINDOW_MS);

        Recent.push(Now);
        this.saslFailures.set(Address, Recent);

        if(Recent.length >= SASL_FAILURE_LIMIT){
            this.throttledAddresses.set(Address, Now + SASL_THROTTLE_MS);
        }
    }

    private prune(Now: number): void {
        for(const [Key, Until] of this.throttledAddresses) if(Until <= Now) this.throttledAddresses.delete(Key);
        for(const [Key, Until] of this.throttledUids) if(Until <= Now) this.throttledUids.delete(Key);
        for(const [Key, At] of this.loggedOnce) if(Now - At >= LOG_ONCE_MS) this.loggedOnce.delete(Key);
        for(const [Key, Times] of this.saslFailures){
            const Recent = Times.filter((At) => Now - At < SASL_FAILURE_WINDOW_MS);

            if(Recent.length > 0) this.saslFailures.set(Key, Recent); else this.saslFailures.delete(Key);
        }
    }

    private drop(Session: ChatSession, Reason: "parse" | "rate" | "unknown"): void {
        const Now = this.clock();

        Session.Drops = Session.Drops.filter((At) => Now - At < ABUSE_WINDOW_MS);
        Session.Drops.push(Now);

        if(Now - Session.LastDropLog >= 60 * 1000){
            Session.LastDropLog = Now;
            logger.info(`chat: dropped c=${Session.Id} reason=${Reason}`);
        }

        if(Session.Drops.length > ABUSE_DROPS){
            this.end(Session, "abuse");
        }
    }

    // ---- Stanzas ----

    private frame(Session: ChatSession, Raw: string): void {
        if(Session.Ended){
            return;
        }

        const Now = this.clock();

        Session.LastInbound = Now;
        Session.PingDeadline = undefined;
        Session.PingId = undefined;

        if(this.trace){
            logger.info(`chat: trace c=${Session.Id} in ${RedactFrame(Raw)}`);
        }

        if(Session.Uid !== undefined && !TakeToken(Session.Stanzas, STANZA_BURST, STANZA_REFILL_MS, Now)){
            this.drop(Session, "rate");
            return;
        }

        // No DTDs or processing instructions, ever. Before login that ends the connection; after it the
        // frame is dropped (the game never sends one, and closing would start a reconnect loop).
        if(HasMarkupDeclaration(Raw)){
            if(Session.Uid === undefined){
                this.send(Session, `<stream:error xmlns:stream="${NS.STREAMS}"><restricted-xml xmlns="${NS.STREAM_ERRORS}"/></stream:error>`);
                this.end(Session, "refused");
            }
            else{
                this.drop(Session, "parse");
            }

            return;
        }

        const Node = ParseFrame(Raw);

        if(Node === undefined){
            if(Session.Uid === undefined) this.end(Session, "refused"); else this.drop(Session, "parse");
            return;
        }

        const Kind = LocalName(Node.name);

        if(Kind === "open"){
            this.open(Session, Node);
            return;
        }

        if(Kind === "close"){
            this.end(Session, "close");
            return;
        }

        if(Session.Uid === undefined){
            this.beforeLogin(Session, Node, Kind);
            return;
        }

        if(Kind === "iq"){
            this.iq(Session, Node);
            return;
        }

        if(Session.Resource === undefined){
            this.drop(Session, "unknown");
            return;
        }

        if(Kind === "presence"){
            this.presence(Session, Node);
        }
        else if(Kind === "message"){
            this.message(Session, Node);
        }
        else{
            this.drop(Session, "unknown");
        }
    }

    private open(Session: ChatSession, Node: Element): void {
        if(Session.Resource === undefined){
            const To = AttrOf(Node, "to");

            if(IsHostName(To)){
                Session.Domain = To;
            }
            else if(Session.Uid === undefined){
                Session.Domain = DEFAULT_DOMAIN;
            }
        }

        this.send(Session, `<open xmlns="${NS.FRAMING}" from="${EscapeXml(Session.Domain)}" id="${crypto.randomBytes(8).toString("hex")}" version="1.0" xml:lang="en"/>`);
        this.send(Session, Session.Uid !== undefined
            ? `<stream:features xmlns:stream="${NS.STREAMS}"><bind xmlns="${NS.BIND}"/></stream:features>`
            : `<stream:features xmlns:stream="${NS.STREAMS}"><mechanisms xmlns="${NS.SASL}"><mechanism>PLAIN</mechanism></mechanisms></stream:features>`);
    }

    private beforeLogin(Session: ChatSession, Node: Element, Kind: string): void {
        if(Kind === "auth"){
            this.auth(Session, Node);
            return;
        }

        // After a failed SASL the game tries legacy jabber:iq:auth (_xmpp_auth1): refuse it and hang up
        if(Kind === "iq"){
            const Id = AttrOf(Node, "id") ?? "";

            this.send(Session, `<iq xmlns="${NS.CLIENT}" type="error"${Id.length > 0 && Id.length <= MAX_ID ? ` id="${EscapeXml(Id)}"` : ""}><error type="auth"><not-authorized xmlns="${NS.STANZAS}"/></error></iq>`);
        }

        this.end(Session, "refused");
    }

    private refuseLogin(Session: ChatSession, Reason: string, Uid: string | undefined, Condition = "not-authorized"): void {
        if(Reason !== "throttled"){
            this.countFailure(Session.Address, this.clock());
        }

        Session.SaslFailed = true;

        if(this.logOnce(`login|${Uid ?? Session.Address}|${Reason}`)){
            logger.info(`chat: login refused c=${Session.Id} reason=${Reason}${Uid !== undefined ? ` uid=${Uid}` : ""}`);
        }

        this.send(Session, `<failure xmlns="${NS.SASL}"><${Condition}/></failure>`);
    }

    private auth(Session: ChatSession, Node: Element): void {
        const Now = this.clock();
        const AddressUntil = this.throttledAddresses.get(Session.Address);

        if(AddressUntil !== undefined && AddressUntil > Now){
            this.refuseLogin(Session, "throttled", undefined, "temporary-auth-failure");
            return;
        }

        if(AttrOf(Node, "mechanism") !== "PLAIN"){
            this.refuseLogin(Session, "bad-mechanism", undefined, "invalid-mechanism");
            return;
        }

        const Encoded = TextOf(Node).trim();

        if(Encoded.length === 0 || Encoded.length > 12000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(Encoded)){
            this.refuseLogin(Session, "bad-format", undefined);
            return;
        }

        const Fields = Buffer.from(Encoded, "base64").toString("utf8").split("\0");

        if(Fields.length !== 3 || (Fields[0] !== "" && Fields[0] !== Fields[1]) || !IsAccountIdShape(Fields[1]) || Fields[2].length === 0 || Fields[2].length > 8192){
            this.refuseLogin(Session, "bad-format", undefined);
            return;
        }

        const Uid = Fields[1];
        const UidUntil = this.throttledUids.get(Uid);

        if(UidUntil !== undefined && UidUntil > Now){
            this.refuseLogin(Session, "throttled", Uid, "temporary-auth-failure");
            return;
        }

        let Payload: unknown;

        try{
            Payload = ValidateMetagameJWTAndGetPayload(Fields[2]);
        }
        catch(error){
            this.refuseLogin(Session, ErrorName(error) === "TokenExpiredError" ? "expired" : "bad-token", Uid);
            return;
        }

        const TokenUid = typeof Payload === "object" && Payload !== null ? (Payload as { userId?: unknown }).userId : undefined;

        if(TokenUid !== Uid){
            this.refuseLogin(Session, "uid-mismatch", Uid);
            return;
        }

        const Name = FindUsernameForUserId(Uid);

        if(Name === undefined){
            this.refuseLogin(Session, "no-account", Uid);
            return;
        }

        Session.Uid = Uid;
        Session.NameAtLogin = Name;
        Session.SaslFailed = false;
        logger.info(`chat: login ok c=${Session.Id} uid=${Uid}`);
        this.send(Session, `<success xmlns="${NS.SASL}"/>`);
    }

    private iq(Session: ChatSession, Node: Element): void {
        const Type = AttrOf(Node, "type");
        const Id = AttrOf(Node, "id") ?? "";

        if(Type === "result" || Type === "error"){
            return;
        }

        if((Type !== "get" && Type !== "set") || Id.length > MAX_ID){
            this.drop(Session, "unknown");
            return;
        }

        const Binding = ChildNamed(Node, "bind");

        if(Type === "set" && Binding !== undefined){
            this.bind(Session, Id, TextOf(ChildNamed(Binding, "resource")));
            return;
        }

        // Pings, the never-advertised session IQ, and anything else: an empty result, which is what the
        // game was seen working with. The namespace of an unknown one is logged once per session.
        const Child = Node.children.find((Item): Item is Element => typeof Item !== "string");
        const Namespace = Child !== undefined ? (AttrOf(Child, "xmlns") ?? "") : "";

        if(Child !== undefined && Namespace !== NS.PING && Namespace !== NS.SESSION && !Session.Namespaces.has(Namespace) && Session.Namespaces.size < 32){
            Session.Namespaces.add(Namespace);
            logger.debug(`chat: iq c=${Session.Id} ${Type} namespace=${Namespace.slice(0, 80)}`);
        }

        this.send(Session, `<iq xmlns="${NS.CLIENT}" type="result" id="${EscapeXml(Id)}"/>`);
    }

    private bind(Session: ChatSession, Id: string, Requested: string): void {
        const Uid = Session.Uid!;

        if(Session.Resource !== undefined){
            this.send(Session, `<iq xmlns="${NS.CLIENT}" type="result" id="${EscapeXml(Id)}"><bind xmlns="${NS.BIND}"><jid>${EscapeXml(FullJidOf(Session))}</jid></bind></iq>`);
            return;
        }

        if(Requested.length > MAX_RESOURCE || /[\x00-\x1f\x7f]/.test(Requested)){
            this.send(Session, `<iq xmlns="${NS.CLIENT}" type="error" id="${EscapeXml(Id)}"><error type="modify"><bad-request xmlns="${NS.STANZAS}"/></error></iq>`);
            return;
        }

        const Resource = Requested.length > 0 ? Requested : `srv-${crypto.randomBytes(16).toString("hex")}`;

        Session.Resource = Resource;
        this.byUid.set(Uid, [...(this.byUid.get(Uid) ?? []), Session]);
        logger.info(`chat: bound c=${Session.Id} uid=${Uid} resource=${Resource} domain=${Session.Domain} sessions=${this.byUid.get(Uid)!.length}`);
        this.send(Session, `<iq xmlns="${NS.CLIENT}" type="result" id="${EscapeXml(Id)}"><bind xmlns="${NS.BIND}"><jid>${EscapeXml(FullJidOf(Session))}</jid></bind></iq>`);
    }

    // ---- Presence and messages ----

    private leaveAll(Session: ChatSession, _Reason: "disconnect" | "replaced"): void {
        Session.Rooms.clear();
    }

    private presence(Session: ChatSession, Node: Element): void {
        const To = AttrOf(Node, "to") ?? "";

        if(To.includes("@") && To.length <= 256){
            const Room = To.split("/")[0].toLowerCase();

            if(AttrOf(Node, "type") === "unavailable"){
                Session.Rooms.delete(Room);
                this.send(Session, `<presence from="${EscapeXml(Room)}/${EscapeXml(Session.Uid!)}" to="${EscapeXml(FullJidOf(Session))}" type="unavailable"/>`);
            }
            else if(Session.Rooms.has(Room) || Session.Rooms.size < 8){
                Session.Rooms.add(Room);
                // MUC clients need their own reflected presence before considering a
                // public-room join complete. Code 110 identifies this occupant as self.
                this.send(Session, `<presence from="${EscapeXml(Room)}/${EscapeXml(Session.Uid!)}" to="${EscapeXml(FullJidOf(Session))}"><x xmlns="http://jabber.org/protocol/muc#user"><item affiliation="member" role="participant"/><status code="110"/></x></presence>`);
            }
        }
        else{
            // A broadcast presence is recorded and dropped: never echoed, never relayed
            Session.Available = AttrOf(Node, "type") !== "unavailable";
        }
    }

    private message(Session: ChatSession, Node: Element): void {
        const Body = TextOf(ChildNamed(Node, "body"));
        const To = AttrOf(Node, "to") ?? "";

        if(Body.length === 0 || Body.length > BODY_LIMIT || To.length > 256){
            return;
        }

        const Id = AttrOf(Node, "id") ?? "";
        const StanzaId = EscapeXml(Id.length <= MAX_ID ? Id : "");
        const Group = AttrOf(Node, "type") === "groupchat";
        const Target = To.split("/")[0].toLowerCase();

        for(const Peer of this.clients){
            if(!Peer.Uid || !Peer.Resource || Peer.Socket.readyState !== WebSocket.OPEN) continue;
            if(Group ? (!Session.Rooms.has(Target) || !Peer.Rooms.has(Target)) : Peer.Uid.toLowerCase() !== Target.split("@")[0]) continue;
            // 1.4.4 treats the MUC occupant resource as an account ID. Replacing it
            // with a display name makes the sender "unknown" in the game. Keep the
            // authenticated UID as the identity and advertise the stored account
            // name separately with the standard XEP-0172 nickname element.
            const From = Group ? `${Target}/${EscapeXml(Session.Uid!)}` : EscapeXml(FullJidOf(Session));
            this.send(Peer, `<message from="${From}" to="${EscapeXml(FullJidOf(Peer))}" type="${Group ? "groupchat" : "chat"}" id="${StanzaId}"><body>${EscapeXml(Body)}</body><nick xmlns="http://jabber.org/protocol/nick">${EscapeXml(Session.NameAtLogin!)}</nick></message>`);
        }
    }
}

// ---- Settings and start ----

export type ChatConfig = { Enabled: boolean, Port: number, Host: string, Trace: boolean, Errors: string[], Warnings: string[] };

// CHAT=1 turns the listener on (off by default until the live two-player test passes). CHAT_PORT (61099)
// and CHAT_BIND_HOST (127.0.0.1) say where; in public mode (GATEWAY_SECRET set) the gateway forwards to
// 127.0.0.1 and nothing else is accepted. CHAT_TRACE=1 logs redacted frames.
export function ReadChatConfig(Env: NodeJS.ProcessEnv = process.env): ChatConfig {
    const Errors: string[] = [];
    const Warnings: string[] = [];
    const Enabled = Env.CHAT === "1";
    const PortText = Env.CHAT_PORT || "61099";
    const Port = Number(PortText);
    const Host = Env.CHAT_BIND_HOST || "127.0.0.1";
    const PublicMode = typeof Env.GATEWAY_SECRET === "string" && Env.GATEWAY_SECRET.length > 0;

    if(Env.EXPERIMENTAL_CHAT !== undefined && Env.CHAT === undefined){
        Warnings.push("EXPERIMENTAL_CHAT is no longer read; the switch is now CHAT=1");
    }

    if(Env.CHAT !== undefined && Env.CHAT !== "0" && Env.CHAT !== "1"){
        Warnings.push(`CHAT=${Env.CHAT.slice(0, 16)} is not 0 or 1; chat stays off`);
    }

    if(!/^\d{1,5}$/.test(PortText) || !Number.isInteger(Port) || Port < 1 || Port > 65535){
        Errors.push(`CHAT_PORT must be a port number (1-65535)`);
    }

    if(PublicMode ? Host !== "127.0.0.1" : (Host !== "127.0.0.1" && Host !== "::1")){
        Errors.push(PublicMode
            ? `CHAT_BIND_HOST must be 127.0.0.1 in public mode (the gateway forwards chat there)`
            : `CHAT_BIND_HOST must be 127.0.0.1 or ::1`);
    }

    return { Enabled, Port, Host, Trace: Env.CHAT_TRACE === "1", Errors, Warnings };
}

// Starts chat when CHAT=1. Never throws and never stops the metagame: a bad setting or a port in use is
// one error line, and the metagame serves on without chat.
export async function StartChat(Env: NodeJS.ProcessEnv = process.env): Promise<ChatServer | undefined> {
    const Config = ReadChatConfig(Env);

    for(const Warning of Config.Warnings){
        logger.warn(`chat: ${Warning}`);
    }

    if(!Config.Enabled){
        return undefined;
    }

    if(Config.Errors.length > 0){
        logger.error(`chat: not started: ${Config.Errors.join("; ")}. The metagame runs without chat.`);
        return undefined;
    }

    const Server = new ChatServer({ Trace: Config.Trace });

    try{
        await Server.listen(Config.Port, Config.Host);
        return Server;
    }
    catch(error){
        const Code = (error as { code?: unknown })?.code;

        logger.error(`chat: not started: could not listen on ${Config.Host}:${Config.Port} (${typeof Code === "string" ? Code : ErrorName(error)}). The metagame runs without chat.`);
        await Server.close().catch(() => undefined);
        return undefined;
    }
}
