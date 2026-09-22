import { RemoveTestDb } from "./setup";
import "./authenv";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import jwt from "jsonwebtoken";
import WebSocket from "ws";
import { ChatServer, ReadChatConfig, StartChat } from "../src/realtime/chat";
import { UrlEncodeLikeClient } from "../src/realtime/chatnick";
import { EscapeXml, ParseFrame } from "../src/realtime/xmpp";
import { ChatClientModel, JOINED, LookupFrom, NOT_JOINED } from "./chatclient";
import {
    Base64Plain, CaptureLogs, ClientFrame, DOMAIN, FRAMING, GameResource, Login, LoginOptions, LogCapture, RawClosed, RawUpgrade,
    WireClient
} from "./chatwire";
import { GetDb } from "../src/db";
import { users } from "../src/db/schema";
import { SignMetagameJWTForUid } from "../src/controllers/auth";

const A = "UID-chat-a";
const B = "UID-chat-b";
let server: ChatServer;
const sockets: WebSocket[] = [];
const queues = new WeakMap<WebSocket, { items: string[]; waiters: Array<(value: string) => void> }>();

function frame(socket: WebSocket, label = "chat frame"): Promise<string> {
    const queue = queues.get(socket)!;
    if (queue.items.length > 0) return Promise.resolve(queue.items.shift()!);
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`${label} timed out`)), 2000);
        queue.waiters.push((value) => { clearTimeout(timer); resolve(value); });
    });
}

async function connect(): Promise<WebSocket> {
    const socket = new WebSocket(`ws://127.0.0.1:${server.port}`, ["xmpp"]);
    sockets.push(socket);
    const queue = { items: [] as string[], waiters: [] as Array<(value: string) => void> };
    queues.set(socket, queue);
    socket.on("message", (data) => {
        const next = queue.waiters.shift();
        if (next) next(data.toString());
        else queue.items.push(data.toString());
    });
    await once(socket, "open");
    return socket;
}

async function login(id: string): Promise<WebSocket> {
    const socket = await connect();
    const opened = frame(socket);
    socket.send('<open xmlns="urn:ietf:params:xml:ns:xmpp-framing" to="prod.ol.epicgames.com" version="1.0"/>');
    assert.match(await opened, /<open /);
    assert.match(await frame(socket), /PLAIN/);
    const success = frame(socket);
    const encoded = Buffer.from(`\0${id}\0${SignMetagameJWTForUid(id)}`).toString("base64");
    socket.send(`<auth xmlns="urn:ietf:params:xml:ns:xmpp-sasl" mechanism="PLAIN">${encoded}</auth>`);
    assert.match(await success, /success/);
    const reopening = frame(socket);
    socket.send('<open xmlns="urn:ietf:params:xml:ns:xmpp-framing"/>');
    assert.match(await reopening, /<open /);
    assert.match(await frame(socket), /bind/);
    const bound = frame(socket);
    socket.send('<iq type="set" id="bind1"><bind xmlns="urn:ietf:params:xml:ns:xmpp-bind"><resource>game</resource></bind></iq>');
    assert.match(await bound, new RegExp(`${id}@prod.ol.epicgames.com/game`));
    return socket;
}

before(async () => {
    GetDb().insert(users).values([{ userId: A, name: "Alpha", notes: 0, isAdmin: false }, { userId: B, name: "Bravo", notes: 0, isAdmin: false }]).run();
    server = new ChatServer();
    await server.listen(0);
});

after(async () => {
    for (const socket of sockets) socket.terminate();
    await server.close();
    RemoveTestDb(() => GetDb().$client.close());
});

describe("experimental chat", () => {
    it("rejects a token for another account", async () => {
        const socket = await connect();
        socket.send('<open xmlns="urn:ietf:params:xml:ns:xmpp-framing"/>');
        await frame(socket);
        await frame(socket);
        const failure = frame(socket);
        const encoded = Buffer.from(`\0${A}\0${SignMetagameJWTForUid(B)}`).toString("base64");
        socket.send(`<auth xmlns="urn:ietf:params:xml:ns:xmpp-sasl" mechanism="PLAIN">${encoded}</auth>`);
        assert.match(await failure, /not-authorized/);
    });

    it("routes a direct message and a shared room message between two authenticated accounts", async () => {
        const a = await login(A);
        const b = await login(B);
        const direct = frame(b, "direct message");
        a.send(`<message to="${B}@prod.ol.epicgames.com" type="chat" id="m1"><body>Hello &amp; welcome</body></message>`);
        assert.match(await direct, /Hello &amp; welcome/);
        // Names observed in the 1.4.4 client log, not a fabricated generic room. Rooms live on
        // muc.<domain>, and the client joins with <name>:<account id>:<resource> (docs/findings/chat.md).
        const city = "City-d147475b-7742-4e7b-8142-6c0f55dda06b@muc.prod.ol.epicgames.com";
        const alpha = `Alpha:${A}:game`;
        const bravo = `Bravo:${B}:game`;
        const joinedA = frame(a);
        a.send(`<presence to="${city}/${alpha}"><x xmlns="http://jabber.org/protocol/muc"/></presence>`);
        const joinedAlpha = await joinedA;
        assert.match(joinedAlpha, /status code="110"/);
        assert.ok(joinedAlpha.includes(`from="${city}/${alpha}"`), "the nickname is kept as sent");
        assert.ok(joinedAlpha.includes(`jid="${A}@prod.ol.epicgames.com/game"`), "and the occupant's own JID");
        const seenByB = frame(b);
        b.send(`<presence to="${city}/${bravo}"><x xmlns="http://jabber.org/protocol/muc"/></presence>`);
        const alphaForB = await seenByB;
        assert.ok(alphaForB.includes(`from="${city}/${alpha}"`) && !alphaForB.includes("110"), "B first hears of A");
        const joinedBravo = await frame(b);
        assert.match(joinedBravo, /status code="110"/);
        assert.ok(joinedBravo.includes(`from="${city}/${bravo}"`));
        assert.ok((await frame(a)).includes(`from="${city}/${bravo}"`), "A hears of B");
        const room = frame(b, "room message");
        a.send(`<message to="${city}" type="groupchat" id="m2"><body>Ready?</body></message>`);
        const delivered = await room;
        assert.match(delivered, /Ready\?/);
        assert.ok(delivered.includes(`from="${city}/${alpha}"`));
        assert.doesNotMatch(delivered, /<nick /, "no XEP-0172 nickname: the client never reads it");
        assert.match(await frame(a), /Ready\?/);
    });
});

// ---- The listener itself (docs/findings/chat.md): handshake, login, crash guard, start, logs ----
// These run on their own ChatServer with a test clock (port 0), next to the prototype's tests above.

const C = "UID-chat-c";
const D = "UID-chat-d";
const GONE = "UID-chat-gone"; // signed tokens for it exist, the account does not
const OLD = "UID-chat-old";
const OLD_NAME = "Sölve Ö"; // an older name outside today's username rules
const LOOP = "UID-chat-loop";
const FLOOD = "UID-chat-flood";
let Now = Date.parse("2026-09-22T12:00:00Z");
let Wire: ChatServer;
let Logs: LogCapture;
const Opened: WireClient[] = [];
const SECRET_MARKERS: string[] = [];

async function Connected(Server = Wire, Headers: Record<string, string> = {}){
    const Client = await WireClient.Connect(Server.port, Headers);
    Opened.push(Client);
    return Client;
}

async function SignedIn(Uid: string, Options: LoginOptions = {}, Server = Wire){
    const Client = await Login(Server.port, Uid, Options);
    Opened.push(Client);
    return Client;
}

// Open and features, then the SASL answer to this payload
async function SaslAnswer(Client: WireClient, Payload: string, Mechanism = "PLAIN"){
    Client.Send(`<open xmlns="${FRAMING}" to="${DOMAIN}" version="1.0"/>`);
    await Client.Expect("open");
    await Client.Expect("features");
    SECRET_MARKERS.push(Payload);
    Client.Send(`<auth xmlns="urn:ietf:params:xml:ns:xmpp-sasl" mechanism="${Mechanism}">${Payload}</auth>`);
    return Client.Expect("sasl answer");
}

function SignWith(Uid: string, Options: jwt.SignOptions){
    const Key = Buffer.from(process.env.AUTH_SIGNING_PRIVKEY_B64!, "base64").toString("utf8");
    return jwt.sign({ userId: Uid }, Key, { algorithm: "RS256", issuer: "undaunted-metagame", audience: "undaunted-metagame", ...Options });
}

let Whispers = 0;

async function Whispered(From: WireClient, To: WireClient, Marker: string){
    From.Send(`<message to="${To.Uid}@${DOMAIN}" type="chat" id="w${++Whispers}"><body>${Marker}</body></message>`);
    await From.Barrier();
    return (await To.Barrier()).some((Frame) => Frame.includes(Marker));
}

describe("chat listener", () => {
    before(async () => {
        GetDb().insert(users).values([
            { userId: C, name: "Charlie", notes: 0, isAdmin: false }, { userId: D, name: "Delta", notes: 0, isAdmin: false },
            { userId: OLD, name: OLD_NAME, notes: 0, isAdmin: false }, { userId: LOOP, name: "Loop", notes: 0, isAdmin: false },
            { userId: FLOOD, name: "Flood", notes: 0, isAdmin: false }
        ]).run();
        Logs = CaptureLogs();
        Wire = new ChatServer({ Clock: () => Now, AutoTick: false });
        await Wire.listen(0);
    });

    after(async () => {
        for(const Client of Opened) Client.Close();
        await Wire.close();
        Logs.Stop();
    });

    describe("handshake", () => {
        it("answers the game's handshake frame by frame, and echoes its 67-character resource", async () => {
            const Client = await Connected();
            const Resource = GameResource();
            const Token = SignMetagameJWTForUid(C);

            assert.equal(Resource.length, 67);
            Client.Send(`<open xmlns="${FRAMING}" to="${DOMAIN}" version="1.0"/>`);
            assert.match(await Client.Expect(), /^<open xmlns="urn:ietf:params:xml:ns:xmpp-framing" from="prod\.ol\.epicgames\.com" id="[0-9a-f]{16}" version="1\.0" xml:lang="en"\/>$/);
            assert.equal(await Client.Expect(), `<stream:features xmlns:stream="http://etherx.jabber.org/streams"><mechanisms xmlns="urn:ietf:params:xml:ns:xmpp-sasl"><mechanism>PLAIN</mechanism></mechanisms></stream:features>`);
            SECRET_MARKERS.push(Base64Plain("", C, Token));
            Client.Send(`<auth xmlns="urn:ietf:params:xml:ns:xmpp-sasl" mechanism="PLAIN">${Base64Plain("", C, Token)}</auth>`);
            assert.equal(await Client.Expect(), `<success xmlns="urn:ietf:params:xml:ns:xmpp-sasl"/>`);
            Client.Send(`<open xmlns="${FRAMING}" to="${DOMAIN}" version="1.0"/>`);
            assert.match(await Client.Expect(), /^<open xmlns="urn:ietf:params:xml:ns:xmpp-framing" from="prod\.ol\.epicgames\.com" id="[0-9a-f]{16}" version="1\.0" xml:lang="en"\/>$/);
            assert.equal(await Client.Expect(), `<stream:features xmlns:stream="http://etherx.jabber.org/streams"><bind xmlns="urn:ietf:params:xml:ns:xmpp-bind"/></stream:features>`);
            Client.Send(`<iq type="set" id="_xmpp_bind1"><bind xmlns="urn:ietf:params:xml:ns:xmpp-bind"><resource>${Resource}</resource></bind></iq>`);
            assert.equal(await Client.Expect(), `<iq xmlns="jabber:client" type="result" id="_xmpp_bind1"><bind xmlns="urn:ietf:params:xml:ns:xmpp-bind"><jid>${C}@${DOMAIN}/${Resource}</jid></bind></iq>`);

            // Each server message is one complete stanza
            for(const Frame of Client.Frames){
                assert.ok(ParseFrame(Frame), Frame);
            }

            Client.Send(`<iq type="set" id="_xmpp_session1"><session xmlns="urn:ietf:params:xml:ns:xmpp-session"/></iq>`);
            assert.equal(await Client.Expect(), `<iq xmlns="jabber:client" type="result" id="_xmpp_session1"/>`);
            Client.Send(`<iq type="get" id="v1"><query xmlns="jabber:iq:version"/></iq>`);
            assert.equal(await Client.Expect(), `<iq xmlns="jabber:client" type="result" id="v1"/>`);
            assert.ok(Logs.Lines.some((Line) => Line.includes(`chat: bound c=`) && Line.includes(`uid=${C} resource=${Resource} domain=${DOMAIN} sessions=1`)));
        });

        it("takes the domain from <open to>, and falls back to the game's own when it is missing or not a host name", async () => {
            const Local = await SignedIn(D, { OpenTo: "dauntless.local" });
            assert.equal(Local.Domain, "dauntless.local");
            await Local.Logout();

            const Missing = await SignedIn(D, { OpenTo: null });
            assert.equal(Missing.Domain, DOMAIN);
            await Missing.Logout();

            const Odd = await SignedIn(D, { OpenTo: "not a host!" });
            assert.equal(Odd.Domain, DOMAIN);
            await Odd.Logout();
        });

        it("gives an empty resource a server one, and refuses an over-long one or one with control characters", async () => {
            const Empty = await SignedIn(D, { Resource: "" });
            assert.match(Empty.Resource, /^srv-[0-9a-f]{32}$/);

            for(const Bad of ["x".repeat(257), "V2:\tTab"]){
                const Client = await Connected();
                SECRET_MARKERS.push(Base64Plain("", D, SignMetagameJWTForUid(D)));
                assert.match(await SaslAnswer(Client, Base64Plain("", D, SignMetagameJWTForUid(D))), /<success/);
                Client.Send(`<open xmlns="${FRAMING}" to="${DOMAIN}" version="1.0"/>`);
                await Client.Expect();
                await Client.Expect();
                Client.Send(`<iq type="set" id="_xmpp_bind1"><bind xmlns="urn:ietf:params:xml:ns:xmpp-bind"><resource>${Bad}</resource></bind></iq>`);
                assert.equal(await Client.Expect(), `<iq xmlns="jabber:client" type="error" id="_xmpp_bind1"><error type="modify"><bad-request xmlns="urn:ietf:params:xml:ns:xmpp-stanzas"/></error></iq>`);
                assert.ok(Client.IsOpen, "a refused bind does not hang up");
            }
        });

        it("answers the client's <close/> with its own and hangs up", async () => {
            const Client = await SignedIn(C);
            Client.Send(`<close xmlns="${FRAMING}"/>`);
            assert.equal(await Client.Expect(), `<close xmlns="${FRAMING}"/>`);
            assert.equal((await Client.Closed).Code, 1000);
            assert.ok(Logs.Lines.some((Line) => /chat: closed c=\d+ uid=UID-chat-c reason=close after=\d+s/.test(Line)));
        });
    });

    describe("login", () => {
        it("refuses a token for another account, then the legacy login the game tries next, and hangs up", async () => {
            const Client = await Connected();
            assert.equal(await SaslAnswer(Client, Base64Plain("", C, SignMetagameJWTForUid(D))), `<failure xmlns="urn:ietf:params:xml:ns:xmpp-sasl"><not-authorized/></failure>`);
            assert.ok(Client.IsOpen, "the game gets to send its legacy login");
            Client.Send(`<iq type="set" id="_xmpp_auth1"><query xmlns="jabber:iq:auth"><username>${C}</username><password>not-a-real-password-marker</password><resource>r</resource></query></iq>`);
            SECRET_MARKERS.push("not-a-real-password-marker");
            assert.equal(await Client.Expect(), `<iq xmlns="jabber:client" type="error" id="_xmpp_auth1"><error type="auth"><not-authorized xmlns="urn:ietf:params:xml:ns:xmpp-stanzas"/></error></iq>`);
            await Client.Closed;
            assert.ok(Logs.Lines.some((Line) => /chat: login refused c=\d+ reason=uid-mismatch uid=UID-chat-c$/.test(Line)));
        });

        it("refuses an expired token, a deleted account, another mechanism and a malformed payload", async () => {
            const Cases: Array<[string, string, string, string]> = [
                ["expired", Base64Plain("", C, SignWith(C, { expiresIn: -60 })), "PLAIN", "not-authorized"],
                ["no-account", Base64Plain("", GONE, SignMetagameJWTForUid(GONE)), "PLAIN", "not-authorized"],
                ["bad-token", Base64Plain("", C, "not.a.token"), "PLAIN", "not-authorized"],
                ["bad-mechanism", Base64Plain("", C, SignMetagameJWTForUid(C)), "SCRAM-SHA-1", "invalid-mechanism"],
                ["bad-format", Buffer.from(`${C}\0only-two`).toString("base64"), "PLAIN", "not-authorized"],
                ["bad-format", Base64Plain(D, C, SignMetagameJWTForUid(C)), "PLAIN", "not-authorized"]
            ];

            for(const [Reason, Payload, Mechanism, Condition] of Cases){
                const Client = await Connected();
                assert.equal(await SaslAnswer(Client, Payload, Mechanism), `<failure xmlns="urn:ietf:params:xml:ns:xmpp-sasl"><${Condition}/></failure>`, Reason);
                Client.Close();
                assert.ok(Logs.Lines.some((Line) => Line.includes(`reason=${Reason}`)), Reason);
            }
        });

        it("holds an address back after 10 failed logins in 10 minutes", async () => {
            const Own = new ChatServer({ Clock: () => Now, AutoTick: false });
            await Own.listen(0);

            try{
                for(let Attempt = 0; Attempt < 10; Attempt++){
                    const Client = await Connected(Own);
                    assert.match(await SaslAnswer(Client, Base64Plain("", C, SignMetagameJWTForUid(D))), /not-authorized/);
                    Client.Close();
                }

                const Held = await Connected(Own);
                assert.equal(await SaslAnswer(Held, Base64Plain("", C, SignMetagameJWTForUid(C))), `<failure xmlns="urn:ietf:params:xml:ns:xmpp-sasl"><temporary-auth-failure/></failure>`);
                Held.Close();

                Now += 10 * 60 * 1000;
                const Later = await Login(Own.port, C);
                Opened.push(Later);
                assert.ok(Later.IsOpen);
            }
            finally{
                await Own.close();
            }
        });

        it("hangs up on a connection that does not log in within 15 s, or bind within 30 s", async () => {
            const Silent = await Connected();
            Now += 15 * 1000;
            Wire.Tick();
            await Silent.Closed;

            const Unbound = await Connected();
            assert.match(await SaslAnswer(Unbound, Base64Plain("", C, SignMetagameJWTForUid(C))), /<success/);
            Now += 29 * 1000;
            Wire.Tick();
            assert.ok(Unbound.IsOpen);
            Now += 1000;
            Wire.Tick();
            await Unbound.Closed;
        });
    });

    describe("liveness", () => {
        it("pings a connection that was silent for 50 s, keeps it when it answers, and ends it 30 s after an unanswered ping", async () => {
            const Client = await SignedIn(C);
            Client.AutoPong = false;
            Now += 50 * 1000;
            Wire.Tick();

            const Ping = await Client.Expect("server ping");
            assert.match(Ping, new RegExp(`^<iq xmlns="jabber:client" type="get" id="(sp\\d+)" from="${DOMAIN}" to="${C}@${DOMAIN}/${Client.Resource}"><ping xmlns="urn:xmpp:ping"/></iq>$`));
            Client.Send(`<iq type="result" id="${/id="(sp\d+)"/.exec(Ping)![1]}"/>`);
            await Client.Barrier();
            Now += 30 * 1000;
            Wire.Tick();
            assert.ok(Client.IsOpen, "answered, so still connected");

            Now += 20 * 1000;
            Wire.Tick();
            await Client.Expect("second ping");
            Now += 30 * 1000;
            Wire.Tick();
            await Client.Closed;
            assert.ok(Logs.Lines.some((Line) => /chat: closed c=\d+ uid=UID-chat-c reason=ping-timeout/.test(Line)));

            // The account's next login within 60 s waits (the game backs off 15-45 s instead of looping)
            const Next = await Connected();
            assert.equal(await SaslAnswer(Next, Base64Plain("", C, SignMetagameJWTForUid(C))), `<failure xmlns="urn:ietf:params:xml:ns:xmpp-sasl"><temporary-auth-failure/></failure>`);
            Next.Close();
            Now += 60 * 1000;
            Wire.Tick();
            Opened.push(await Login(Wire.port, C));
        });
    });

    describe("crash guard", () => {
        it("survives oversized frames, bad UTF-8, bad opcodes, DTDs and garbage, and never hangs up a signed-in player over bad XML", async () => {
            const Sender = await SignedIn(C);
            const Receiver = await SignedIn(D);
            assert.ok(await Whispered(Sender, Receiver, "marker-before-guard"));

            // Before login: a DTD gets a stream error and the connection ends; so does garbage
            const Early = await Connected();
            Early.Send(`<!DOCTYPE lol [<!ENTITY lol "lol">]><open/>`);
            assert.match(await Early.Expect(), /<restricted-xml xmlns="urn:ietf:params:xml:ns:xmpp-streams"\/>/);
            await Early.Closed;
            const Garbage = await Connected();
            Garbage.Send("<<<not xml");
            await Garbage.Closed;

            // After login: dropped, never hung up
            const Player = await SignedIn(C);
            for(const Bad of [`<!DOCTYPE x><iq/>`, `<?xml version="1.0"?><iq type="get" id="x"/>`, "<<<not xml", `<iq type="get" id="half"`, `<message><body>&bogus;</body></message>`, `<nonsense/>`]){
                Player.Send(Bad);
            }
            assert.deepEqual(await Player.Barrier(), []);
            assert.ok(Player.IsOpen);

            // A binary frame is read as text
            Player.Send(Buffer.from(`<iq type="get" id="bin1"><ping xmlns="urn:xmpp:ping"/></iq>`), true);
            assert.equal(await Player.Expect(), `<iq xmlns="jabber:client" type="result" id="bin1"/>`);

            // An oversized frame: ws closes with 1009, the metagame stays up
            const Big = await SignedIn(D);
            Big.Send(`<message to="${C}@${DOMAIN}" type="chat"><body>${"x".repeat(33 * 1024)}</body></message>`);
            assert.equal((await Big.Closed).Code, 1009);

            // Invalid UTF-8 in a text frame, a reserved opcode and an unmasked frame, over raw sockets
            for(const Frame of [ClientFrame(0x1, Buffer.from([0x3c, 0xff, 0xfe, 0x3e])), ClientFrame(0x3, Buffer.from("x")), ClientFrame(0x1, Buffer.from("<iq/>"), false)]){
                const Raw = await RawUpgrade(Wire.port);
                Raw.write(Frame);
                assert.ok(await RawClosed(Raw), "the bad connection is closed");
            }

            assert.ok(await Whispered(Sender, Receiver, "marker-after-guard"), "the others still chat");
        });

        it("refuses new connections with 503 past 8 unfinished logins from one address", async () => {
            const Own = new ChatServer({ Clock: () => Now, AutoTick: false });
            await Own.listen(0);

            try{
                const Pending: WireClient[] = [];

                for(let Index = 0; Index < 8; Index++){
                    Pending.push(await Connected(Own));
                }

                await assert.rejects(Connected(Own), /503/);

                for(const Client of Pending) Client.Close();
            }
            finally{
                await Own.close();
            }
        });
    });

    describe("public mode", () => {
        it("takes the player's address from the gateway only when it carries the secret", async () => {
            const Secret = crypto.randomBytes(24).toString("hex");
            SECRET_MARKERS.push(Secret);
            process.env.GATEWAY_SECRET = Secret;

            try{
                await Connected(Wire, { "X-Dauntless-Gateway": Secret, "X-Forwarded-For": "203.0.113.7" });
                await Connected(Wire, { "X-Dauntless-Gateway": "wrong-secret-value-000", "X-Forwarded-For": "203.0.113.8" });
                await new Promise((Resolve) => setTimeout(Resolve, 50));
                assert.ok(Logs.Lines.some((Line) => /chat: connect c=\d+ from=203\.0\.113\.7 via=gateway$/.test(Line)));
                assert.ok(Logs.Lines.some((Line) => /chat: connect c=\d+ from=127\.0\.0\.1 via=direct$/.test(Line)));
                assert.ok(!Logs.Lines.some((Line) => Line.includes("203.0.113.8")));
            }
            finally{
                delete process.env.GATEWAY_SECRET;
            }
        });
    });

    describe("settings and start", () => {
        it("reads CHAT, CHAT_PORT and CHAT_BIND_HOST, with 127.0.0.1 the only host in public mode", () => {
            assert.equal(ReadChatConfig({}).Enabled, false);
            assert.deepEqual(ReadChatConfig({ CHAT: "1" }), { Enabled: true, Port: 61099, Host: "127.0.0.1", NickCheck: "enforce", Trace: false, Errors: [], Warnings: [] });
            assert.equal(ReadChatConfig({ CHAT: "1", CHAT_NICK_CHECK: "log" }).NickCheck, "log");
            assert.equal(ReadChatConfig({ CHAT: "1", CHAT_NICK_CHECK: "off" }).NickCheck, "enforce");
            assert.match(ReadChatConfig({ CHAT: "1", CHAT_NICK_CHECK: "off" }).Warnings[0], /CHAT_NICK_CHECK=off is not enforce or log/);
            assert.equal(ReadChatConfig({ CHAT: "1", CHAT_BIND_HOST: "::1" }).Errors.length, 0);
            assert.equal(ReadChatConfig({ CHAT: "1", CHAT_BIND_HOST: "::1", GATEWAY_SECRET: "x".repeat(32) }).Errors.length, 1);
            assert.equal(ReadChatConfig({ CHAT: "1", CHAT_BIND_HOST: "0.0.0.0" }).Errors.length, 1);
            assert.equal(ReadChatConfig({ CHAT: "1", CHAT_PORT: "70000" }).Errors.length, 1);
            assert.equal(ReadChatConfig({ CHAT: "1", CHAT_TRACE: "1" }).Trace, true);
            assert.match(ReadChatConfig({ EXPERIMENTAL_CHAT: "1" }).Warnings[0], /no longer read.*CHAT=1/);
        });

        it("logs one error line and starts nothing on a port in use or a bad host; the metagame starts anyway", async () => {
            const Blocker = net.createServer();
            await new Promise<void>((Resolve) => Blocker.listen(0, "127.0.0.1", () => Resolve()));
            const Taken = (Blocker.address() as net.AddressInfo).port;

            try{
                assert.equal(await StartChat({ CHAT: "1", CHAT_PORT: String(Taken) }), undefined);
                assert.ok(Logs.Lines.some((Line) => Line === `error chat: not started: could not listen on 127.0.0.1:${Taken} (EADDRINUSE). The metagame runs without chat.`));
                assert.equal(await StartChat({ CHAT: "1", CHAT_BIND_HOST: "0.0.0.0" }), undefined);
                assert.equal(await StartChat({}), undefined);

                // The real metagame process with chat on and its port taken: it still serves
                const Output = await RunMetagame({ CHAT: "1", CHAT_PORT: String(Taken) });
                assert.match(Output, /chat: not started: could not listen on 127\.0\.0\.1:\d+ \(EADDRINUSE\)/);
                assert.match(Output, /Clear Skies, Slayer\./);
            }
            finally{
                Blocker.close();
            }
        });
    });

    describe("rooms and names", () => {
        const CITY = "City-5f1c0000-aaaa-4bbb-8ccc-000000000001";
        const MUC_DOMAIN = `muc.${DOMAIN}`;

        // A player with a client model beside its connection: the model's stanzas go out, every reply comes in
        async function Player(Uid: string, Name: string, Options: LoginOptions = {}){
            const Wire = await SignedIn(Uid, Options);
            const Model = new ChatClientModel({ LocalUid: Uid, Resource: Wire.Resource, LocalSocialName: Name, Domain: Wire.Domain });
            return { Wire, Model, Name };
        }

        type Player_ = Awaited<ReturnType<typeof Player>>;

        async function Settle(...Players: Player_[]){
            const Seen: string[][] = [];

            for(const Each of Players){
                const Frames = await Each.Wire.Barrier();
                Each.Model.ReceiveAll(Frames);
                Seen.push(Frames);
            }

            return Seen;
        }

        function JoinAs(Who: Player_, Room: string, Name = Who.Name){
            const Stanza = Who.Model.JoinPublicRoom(Room, Name);
            assert.ok(Stanza);
            Who.Wire.Send(Stanza);
        }

        function Presence(Room: string, Nick: string, Occupant: Player_, To: Player_, Self = false){
            return `<presence xmlns="jabber:client" from="${EscapeXml(`${Room}@${MUC_DOMAIN}/${Nick}`)}" to="${EscapeXml(`${To.Wire.Uid}@${DOMAIN}/${To.Wire.Resource}`)}"><x xmlns="http://jabber.org/protocol/muc#user"><item affiliation="none" role="participant" jid="${EscapeXml(`${Occupant.Wire.Uid}@${DOMAIN}/${Occupant.Wire.Resource}`)}"/>${Self ? `<status code="110"/>` : ""}</x></presence>`;
        }

        function Unavailable(Room: string, Nick: string, Occupant: Player_, To: Player_, Self = false){
            return `<presence xmlns="jabber:client" type="unavailable" from="${EscapeXml(`${Room}@${MUC_DOMAIN}/${Nick}`)}" to="${EscapeXml(`${To.Wire.Uid}@${DOMAIN}/${To.Wire.Resource}`)}"><x xmlns="http://jabber.org/protocol/muc#user"><item affiliation="none" role="none" jid="${EscapeXml(`${Occupant.Wire.Uid}@${DOMAIN}/${Occupant.Wire.Resource}`)}"/>${Self ? `<status code="110"/>` : ""}</x></presence>`;
        }

        const Lookup = LookupFrom({ [A]: "Alpha", [B]: "Bravo", [C]: "Charlie", [D]: "Delta" });

        // Fresh buckets and no login hold-backs left over from the test before; every test logs its players out
        beforeEach(() => {
            Now += 61 * 1000;
        });

        afterEach(async () => {
            for(const Client of Opened.splice(0)) await Client.Logout();
        });

        it("two players: joins in order, <item jid> everywhere, 110 only on self, every message to both with one from and id; both see usernames", async () => {
            const Alpha = await Player(A, "Alpha");
            const Bravo = await Player(B, "Bravo");
            const NickA = Alpha.Model.Nickname("Alpha");
            const NickB = Bravo.Model.Nickname("Bravo");

            JoinAs(Alpha, CITY);
            assert.deepEqual((await Settle(Alpha))[0], [Presence(CITY, NickA, Alpha, Alpha, true)]);

            JoinAs(Bravo, CITY);
            const [ForB, ForA] = await Settle(Bravo, Alpha);
            assert.deepEqual(ForB, [Presence(CITY, NickA, Alpha, Bravo), Presence(CITY, NickB, Bravo, Bravo, true)], "B hears of A, then itself");
            assert.deepEqual(ForA, [Presence(CITY, NickB, Bravo, Alpha)], "A hears of B");

            const Text = "©héllo & <b>marker-room</b>";
            Alpha.Wire.Send(Alpha.Model.RoomMessage(CITY, Text, "3F2504E04F8911D39A0C0305E82C3301"));
            const [MineA, MineB] = await Settle(Alpha, Bravo);
            const Expected = (To: Player_) => `<message xmlns="jabber:client" type="groupchat" id="3F2504E04F8911D39A0C0305E82C3301" from="${EscapeXml(`${CITY}@${MUC_DOMAIN}/${NickA}`)}" to="${EscapeXml(`${To.Wire.Uid}@${DOMAIN}/${To.Wire.Resource}`)}"><body>${EscapeXml(Text)}</body></message>`;
            assert.deepEqual(MineA, [Expected(Alpha)], "the sender gets its own line back");
            assert.deepEqual(MineB, [Expected(Bravo)]);

            Bravo.Wire.Send(Bravo.Model.RoomMessage(CITY, "marker-reply", "g2"));
            await Settle(Bravo, Alpha);
            assert.deepEqual(await Alpha.Model.ShownLines(Lookup), [`Alpha: ${Text}`, "Bravo: marker-reply"]);
            assert.deepEqual(await Bravo.Model.ShownLines(Lookup), [`Alpha: ${Text}`, "Bravo: marker-reply"]);
            assert.ok(Logs.Lines.some((Line) => Line === `info chat: join room=${CITY} uid=${B} name=Bravo occupants=1`));
            assert.ok(Logs.Lines.some((Line) => Line === `info chat: message room=${CITY} uid=${A} len=${[...Text].length} to=2`));
        });

        it("rooms live on muc.<domain> from <open to>; conference. or another case is refused not-allowed", async () => {
            const Local = await Player(C, "Charlie", { OpenTo: "dauntless.local" });

            JoinAs(Local, CITY);
            await Settle(Local);
            assert.equal(Local.Model.RoomOf(CITY)!.State, JOINED, "joined on muc.dauntless.local");

            for(const Domain of ["conference.dauntless.local", "MUC.dauntless.local", `muc.${DOMAIN}`]){
                Local.Wire.Send(`<presence to="Hunt-1@${Domain}/${Local.Model.Nickname("Charlie")}"><x xmlns="http://jabber.org/protocol/muc"/></presence>`);
                const [Frames] = await Settle(Local);
                assert.equal(Frames.length, 1, Domain);
                assert.match(Frames[0], /^<presence xmlns="jabber:client" type="error" from="Hunt-1@[^"]+"[^>]*><x xmlns="http:\/\/jabber.org\/protocol\/muc"\/><error type="cancel"><not-allowed xmlns="urn:ietf:params:xml:ns:xmpp-stanzas"\/><\/error><\/presence>$/, Domain);
            }
        });

        it("three players: the last one hears of both; leaves and a dropped connection are told to the rest", async () => {
            const Alpha = await Player(A, "Alpha");
            const Bravo = await Player(B, "Bravo");
            const Charlie = await Player(C, "Charlie");
            const [NickA, NickB, NickC] = [Alpha.Model.Nickname("Alpha"), Bravo.Model.Nickname("Bravo"), Charlie.Model.Nickname("Charlie")];

            JoinAs(Alpha, CITY);
            await Settle(Alpha);
            JoinAs(Bravo, CITY);
            await Settle(Bravo, Alpha);
            JoinAs(Charlie, CITY);
            const [ForC] = await Settle(Charlie, Alpha, Bravo);
            assert.deepEqual(ForC, [Presence(CITY, NickA, Alpha, Charlie), Presence(CITY, NickB, Bravo, Charlie), Presence(CITY, NickC, Charlie, Charlie, true)]);

            Alpha.Wire.Send(Alpha.Model.ExitRoom(CITY)!);
            const [LeftA, LeftB, LeftC] = await Settle(Alpha, Bravo, Charlie);
            assert.deepEqual(LeftA, [Unavailable(CITY, NickA, Alpha, Alpha, true)]);
            assert.deepEqual(LeftB, [Unavailable(CITY, NickA, Alpha, Bravo)]);
            assert.deepEqual(LeftC, [Unavailable(CITY, NickA, Alpha, Charlie)]);
            assert.equal(Alpha.Model.RoomOf(CITY)!.State, NOT_JOINED);

            Charlie.Wire.Close();
            await Charlie.Wire.Closed;
            await new Promise((Resolve) => setTimeout(Resolve, 50));
            const [Dropped] = await Settle(Bravo);
            assert.deepEqual(Dropped, [Unavailable(CITY, NickC, Charlie, Bravo)]);
            assert.ok(Logs.Lines.some((Line) => Line === `info chat: leave room=${CITY} uid=${C} reason=disconnect`));
        });

        it("refuses a nickname with another account's id, another name, the wrong resource or characters the client never writes", async () => {
            const Alpha = await Player(A, "Alpha");
            const Res = Alpha.Wire.Resource;
            const Cases: Array<[string, string]> = [
                [`Alpha:${B}:${Res}`, "nick-account"],
                [`Alpha`, "nick-account"],
                [`Bravo:${A}:${Res}`, "nick-name"],
                [`Al+pha:${A}:${Res}`, "nick-format"],
                [`Al pha:${A}:${Res}`, "nick-format"],
                [`%ZZ:${A}:${Res}`, "nick-format"],
                [`%FF:${A}:${Res}`, "nick-format"],
                [`Alpha:${A}:V2:Other:WIN::0`, "nick-resource"]
            ];

            for(const [Nick, Reason] of Cases){
                Alpha.Wire.Send(`<presence to="${EscapeXml(`Hunt-9@${MUC_DOMAIN}/${Nick}`)}"><x xmlns="http://jabber.org/protocol/muc"/></presence>`);
                const [Frames] = await Settle(Alpha);
                assert.equal(Frames.length, 1, Nick);
                assert.match(Frames[0], /<error type="auth"><forbidden xmlns="urn:ietf:params:xml:ns:xmpp-stanzas"\/><\/error>/, Nick);
                assert.ok(Logs.Lines.some((Line) => Line === `info chat: join refused room=Hunt-9 uid=${A} reason=${Reason}`), `${Nick}: ${Reason}`);
            }

            // Another account's id hidden in a bound resource is refused too
            const Forged = await Player(B, "Bravo", { Resource: `V2:${A}:WIN::0` });
            JoinAs(Forged, "Hunt-10");
            await Settle(Forged);
            assert.equal(Forged.Model.RoomOf("Hunt-10"), undefined);
            assert.ok(Logs.Lines.some((Line) => Line === `info chat: join refused room=Hunt-10 uid=${B} reason=nick-account`));
        });

        it("accepts the client's own encodings: %41lpha, lower-case hex, InvalidMCPUser and an older non-ASCII name", async () => {
            const Old = await Player(OLD, OLD_NAME);
            const Res = Old.Wire.Resource;

            assert.equal(UrlEncodeLikeClient(OLD_NAME), "S%C3%B6lve%20%C3%96");

            for(const [Room, Nick] of [["Hunt-20", `${UrlEncodeLikeClient(OLD_NAME)}:${OLD}:${Res}`], ["Hunt-21", `S%c3%b6lve%20%c3%96:${OLD}:${Res}`], ["Hunt-22", `InvalidMCPUser:${OLD}:${Res}`]]){
                Old.Wire.Send(`<presence to="${EscapeXml(`${Room}@${MUC_DOMAIN}/${Nick}`)}"><x xmlns="http://jabber.org/protocol/muc"/></presence>`);
                const [Frames] = await Settle(Old);
                assert.match(Frames.at(-1)!, /<status code="110"\/>/, Nick);
            }

            const Alpha = await Player(A, "Alpha");
            Alpha.Wire.Send(`<presence to="${EscapeXml(`Hunt-23@${MUC_DOMAIN}/%41lpha:${A}:${Alpha.Wire.Resource}`)}"><x xmlns="http://jabber.org/protocol/muc"/></presence>`);
            const [Frames] = await Settle(Alpha);
            assert.match(Frames.at(-1)!, /<status code="110"\/>/);
            assert.ok(Logs.Lines.some((Line) => Line === `info chat: join room=Hunt-23 uid=${A} name=Alpha occupants=0`));
        });

        it("CHAT_NICK_CHECK=log admits a bad nickname with a warning, but a nickname held by another session is a conflict", async () => {
            const Lenient = new ChatServer({ Clock: () => Now, AutoTick: false, NickCheck: "log" });
            await Lenient.listen(0);

            try{
                const Alpha = await Login(Lenient.port, A);
                const Bravo = await Login(Lenient.port, B);
                const Taken = `Alpha:${A}:${Alpha.Resource}`;

                Alpha.Send(`<presence to="${EscapeXml(`Hunt-30@${MUC_DOMAIN}/Somebody:${A}:${Alpha.Resource}`)}"><x xmlns="http://jabber.org/protocol/muc"/></presence>`);
                assert.match((await Alpha.Barrier()).at(-1)!, /<status code="110"\/>/, "admitted");
                assert.ok(Logs.Lines.some((Line) => Line === `warn chat: join nickname not checked room=Hunt-30 uid=${A} reason=nick-name (CHAT_NICK_CHECK=log)`));

                Alpha.Send(`<presence to="${EscapeXml(`Hunt-31@${MUC_DOMAIN}/${Taken}`)}"><x xmlns="http://jabber.org/protocol/muc"/></presence>`);
                await Alpha.Barrier();
                Bravo.Send(`<presence to="${EscapeXml(`Hunt-31@${MUC_DOMAIN}/${Taken}`)}"><x xmlns="http://jabber.org/protocol/muc"/></presence>`);
                const Refused = await Bravo.Barrier();
                assert.equal(Refused.length, 1);
                assert.match(Refused[0], /<error type="cancel"><conflict xmlns="urn:ietf:params:xml:ns:xmpp-stanzas"\/><\/error>/);
                await Alpha.Logout();
                await Bravo.Logout();
            }
            finally{
                await Lenient.close();
            }
        });

        it("whispers: a bare JID reaches every session of the account, a full JID one, from the sender's full JID; offline and self are dropped", async () => {
            const Alpha = await Player(A, "Alpha");
            const Bravo1 = await Player(B, "Bravo");
            const Bravo2 = await Player(B, "Bravo");

            Alpha.Wire.Send(`<message type="chat" to="${B}@${DOMAIN}" id="w1"><body>marker-psst</body></message>`);
            const [, One, Two] = await Settle(Alpha, Bravo1, Bravo2);
            const Expected = (To: Player_) => `<message xmlns="jabber:client" type="chat" from="${EscapeXml(`${A}@${DOMAIN}/${Alpha.Wire.Resource}`)}" to="${EscapeXml(`${B}@${DOMAIN}/${To.Wire.Resource}`)}" id="w1"><body>marker-psst</body></message>`;
            assert.deepEqual(One, [Expected(Bravo1)]);
            assert.deepEqual(Two, [Expected(Bravo2)]);
            assert.deepEqual(await Bravo1.Model.ShownWhispers(Lookup), ["Alpha: marker-psst"]);

            Alpha.Wire.Send(`<message type="chat" to="${EscapeXml(`${B}@${DOMAIN}/${Bravo2.Wire.Resource}`)}"><body>marker-only-two</body></message>`);
            const [, OnlyOne, OnlyTwo] = await Settle(Alpha, Bravo1, Bravo2);
            assert.equal(OnlyOne.length, 0);
            assert.equal(OnlyTwo.length, 1);

            Alpha.Wire.Send(`<message type="chat" to="${D}@${DOMAIN}"><body>marker-offline</body></message>`);
            Alpha.Wire.Send(`<message type="chat" to="${A}@${DOMAIN}"><body>marker-self</body></message>`);
            assert.deepEqual((await Settle(Alpha))[0], [], "no error goes back");
            assert.ok(Logs.Lines.some((Line) => Line === `info chat: whisper from=${A} to=${D} len=14 reason=offline`));
            assert.ok(Logs.Lines.some((Line) => Line === `info chat: whisper from=${A} to=${A} len=11 reason=self`));
            assert.ok(Logs.Lines.some((Line) => Line === `info chat: whisper from=${A} to=${B} len=11 delivered=2`));
        });

        it("two sessions of one account never see each other in a room; a third replaces the silent one; a ghost is pinged out in 10 s", async () => {
            const First = await Player(D, "Delta");
            const Second = await Player(D, "Delta");
            const Room = "Party-7d1f0000-0000-4000-8000-00000000000d";

            JoinAs(First, Room);
            await Settle(First);
            JoinAs(Second, Room);
            const [ForSecond, ForFirst] = await Settle(Second, First);
            assert.equal(ForSecond.length, 1, "only its own presence");
            assert.equal(ForFirst.length, 0, "nothing about the other session");

            First.Wire.Send(First.Model.RoomMessage(Room, "marker-same", "s1"));
            const [Mine, Other] = await Settle(First, Second);
            assert.equal(Mine.length, 1, "its own line comes back");
            assert.equal(Other.length, 0, "the other session hears nothing");

            First.Wire.Send(First.Model.ExitRoom(Room)!);
            assert.equal((await Settle(Second, First))[0].length, 0, "a leave is not told to the other session");

            // A third session: the one silent longest goes (reason replaced), and the new bind pings the
            // other one, which is ended as a ghost when it stays silent for 10 s
            Now += 1000;
            await Settle(Second);
            Second.Wire.AutoPong = false;
            const Third = await Player(D, "Delta");
            await First.Wire.Closed;
            assert.ok(Logs.Lines.some((Line) => /chat: closed c=\d+ uid=UID-chat-d reason=replaced/.test(Line)));
            Now += 10 * 1000;
            Wire.Tick();
            await Second.Wire.Closed;
            assert.ok(Logs.Lines.some((Line) => /chat: closed c=\d+ uid=UID-chat-d reason=ping-timeout/.test(Line)));
            assert.ok(Third.Wire.IsOpen);

            // Either end holds the account's next login back for 60 s
            await assert.rejects(Player(D, "Delta"), /was refused/);
        });

        it("the loop guard: more than 3 replacements in 60 s", async () => {
            const Own = new ChatServer({ Clock: () => Now, AutoTick: false });
            await Own.listen(0);

            try{
                const Resource = GameResource();
                const Racers: WireClient[] = [];

                // Five connections of one account log in first, then all bind the same resource
                for(let Index = 0; Index < 5; Index++){
                    const Racer = await Connected(Own);
                    assert.match(await SaslAnswer(Racer, Base64Plain("", LOOP, SignMetagameJWTForUid(LOOP))), /<success/);
                    Racer.Send(`<open xmlns="${FRAMING}" to="${DOMAIN}" version="1.0"/>`);
                    await Racer.Expect();
                    await Racer.Expect();
                    Racers.push(Racer);
                }

                for(const Racer of Racers){
                    Racer.Send(`<iq type="set" id="_xmpp_bind1"><bind xmlns="urn:ietf:params:xml:ns:xmpp-bind"><resource>${Resource}</resource></bind></iq>`);
                    await Racer.Expect("bind");
                }

                assert.ok(Logs.Lines.some((Line) => Line.startsWith(`warn chat: loop guard uid=${LOOP} (4 sessions replaced in 60 s)`)));
            }
            finally{
                for(const Client of Opened.splice(0)) Client.Close();
                await Own.close();
            }
        });

        it("limits: a 2049-character body and a message burst get the room error; a stanza flood ends the session and holds its logins", async () => {
            const Flooder = await Player(FLOOD, "Flood");

            JoinAs(Flooder, "Hunt-40");
            await Settle(Flooder);
            Flooder.Wire.Send(`<message type="groupchat" to="Hunt-40@${MUC_DOMAIN}" id="big"><body>${"x".repeat(2049)}</body></message>`);
            const [Big] = await Settle(Flooder);
            assert.deepEqual(Big, [`<message xmlns="jabber:client" type="error" id="big" from="Hunt-40@${MUC_DOMAIN}" to="${EscapeXml(`${FLOOD}@${DOMAIN}/${Flooder.Wire.Resource}`)}"><error type="modify"><not-acceptable xmlns="urn:ietf:params:xml:ns:xmpp-stanzas"/></error></message>`]);

            for(let Index = 0; Index < 9; Index++){
                Flooder.Wire.Send(`<message type="groupchat" to="Hunt-40@${MUC_DOMAIN}" id="r${Index}"><body>marker-burst</body></message>`);
            }

            const [Burst] = await Settle(Flooder);
            assert.equal(Burst.filter((Frame) => Frame.includes("<body>")).length, 8, "a burst of 8");
            assert.equal(Burst.filter((Frame) => Frame.includes(`type="error"`)).length, 1);

            for(let Index = 0; Index < 200; Index++){
                Flooder.Wire.Send(`<iq type="get" id="f${Index}"><ping xmlns="urn:xmpp:ping"/></iq>`);
            }

            await Flooder.Wire.Closed;
            assert.ok(Logs.Lines.some((Line) => /chat: closed c=\d+ uid=UID-chat-flood reason=abuse/.test(Line)));

            const Next = await Connected();
            assert.match(await SaslAnswer(Next, Base64Plain("", FLOOD, SignMetagameJWTForUid(FLOOD))), /temporary-auth-failure/);
            Next.Close();
        });
    });

    describe("logs", () => {
        it("CHAT_TRACE=1 logs frames with the login, passwords, message text and tokens redacted", async () => {
            const Traced = new ChatServer({ Clock: () => Now, AutoTick: false, Trace: true });
            await Traced.listen(0);

            try{
                const Sender = await Login(Traced.port, C);
                const Receiver = await Login(Traced.port, D);
                Opened.push(Sender, Receiver);
                assert.ok(await Whispered(Sender, Receiver, "marker-traced-body"));
                assert.ok(Logs.Lines.some((Line) => Line.includes("chat: trace c=") && Line.includes("<auth") && Line.includes("[redacted]")));
                assert.ok(Logs.Lines.some((Line) => Line.includes("chat: trace c=") && Line.includes("<body>[18 chars]</body>")));
            }
            finally{
                await Traced.close();
            }
        });

        it("never logs a token, a login payload, a password, message text or the gateway secret", () => {
            const Text = Logs.Lines.join("\n");

            assert.ok(Logs.Lines.length > 20);
            assert.ok(!Text.includes("eyJ"), "no token");
            assert.ok(!/marker-/.test(Text), "no message text");

            for(const Marker of SECRET_MARKERS){
                assert.ok(!Text.includes(Marker), "no login payload, password or secret");
            }
        });
    });
});

// Starts the built metagame (build/src/server.js) in its own process with a fresh database and waits
// for its "Clear Skies" line, or 20 s. Returns everything it printed.
async function RunMetagame(Extra: Record<string, string>): Promise<string> {
    const Probe = net.createServer();
    await new Promise<void>((Resolve) => Probe.listen(0, "127.0.0.1", () => Resolve()));
    const Port = (Probe.address() as net.AddressInfo).port;
    await new Promise<void>((Resolve) => Probe.close(() => Resolve()));

    const Dir = fs.mkdtempSync(path.join(os.tmpdir(), "undaunted-chat-start-"));
    const Child = spawn(process.execPath, [path.join(__dirname, "..", "src", "server.js")], {
        cwd: path.join(__dirname, "..", ".."),
        env: {
            PATH: process.env.PATH ?? "",
            SystemRoot: process.env.SystemRoot ?? "",
            PORT: String(Port),
            BIND_HOST: "127.0.0.1",
            DB_FILENAME: path.join(Dir, "start.db"),
            NODE_ENV: "production",
            LOG_LEVEL: "info",
            AUTH_MODE: "APIKEY",
            AUTH_SIGNING_PRIVKEY_B64: process.env.AUTH_SIGNING_PRIVKEY_B64 ?? "",
            AUTH_SIGNING_PUBKEY_B64: process.env.AUTH_SIGNING_PUBKEY_B64 ?? "",
            MATCHMAKING_MODE: "DEPLOYSERVER",
            DEPLOYSERVER_URL: "127.0.0.1:1",
            REGISTRATION_MODE: "OPEN",
            QOS_TARGET_URL: "http://127.0.0.1:61000/QoS",
            TARGET_CHANGELIST: "239827",
            LOG_REQUESTS: "0",
            ...Extra
        }
    });
    let Output = "";

    try{
        await new Promise<void>((Resolve) => {
            const Timer = setTimeout(Resolve, 20000);
            const Read = (Chunk: Buffer) => {
                Output += Chunk.toString("utf8");
                if(Output.includes("Clear Skies")){ clearTimeout(Timer); Resolve(); }
            };

            Child.stdout.on("data", Read);
            Child.stderr.on("data", Read);
            Child.on("exit", () => { clearTimeout(Timer); Resolve(); });
        });
    }
    finally{
        Child.kill();
        await new Promise((Resolve) => Child.exitCode !== null ? Resolve(undefined) : Child.once("exit", Resolve));
        fs.rmSync(Dir, { recursive: true, force: true });
    }

    return Output;
}
