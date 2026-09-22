import { RemoveTestDb } from "./setup";
import "./authenv";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import WebSocket from "ws";
import { ChatServer } from "../src/realtime/chat";
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
        a.send('<presence to="ramsgate@conference.prod.ol.epicgames.com/Alpha"/>');
        b.send('<presence to="ramsgate@conference.prod.ol.epicgames.com/Bravo"/>');
        const readyA = frame(a);
        const readyB = frame(b);
        a.send('<iq type="get" id="ready-a"/>');
        b.send('<iq type="get" id="ready-b"/>');
        assert.match(await readyA, /ready-a/);
        assert.match(await readyB, /ready-b/);
        const room = frame(b, "room message");
        a.send('<message to="ramsgate@conference.prod.ol.epicgames.com" type="groupchat" id="m2"><body>Ready?</body></message>');
        assert.match(await room, /Ready\?/);
    });
});
