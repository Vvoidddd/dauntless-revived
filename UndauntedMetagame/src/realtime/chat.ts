import crypto from "node:crypto";
import { createServer, Server as HttpServer } from "node:http";
import { parse } from "ltx";
import WebSocket, { WebSocketServer } from "ws";
import { ValidateMetagameJWTAndGetPayload } from "../controllers/auth";
import { FindUsernameForUserId } from "../controllers/login";
import { logger } from "../logger";

const FRAMING = "urn:ietf:params:xml:ns:xmpp-framing";
const SASL = "urn:ietf:params:xml:ns:xmpp-sasl";
const BIND = "urn:ietf:params:xml:ns:xmpp-bind";
const STREAMS = "http://etherx.jabber.org/streams";
const DOMAIN = "prod.ol.epicgames.com";
const FRAME_LIMIT = 32768;
const BODY_LIMIT = 2048;

type Client = { socket: WebSocket; id?: string; resource?: string; rooms: Set<string>; available: boolean; authenticatedAt?: number };

function escapeXml(value: string): string {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function localName(name: string): string {
    return name.split(":").at(-1)?.toLowerCase() ?? "";
}

function textOf(node: any): string {
    return node?.getText?.() ?? "";
}

function child(node: any, name: string): any {
    return node.children?.find((item: any) => typeof item !== "string" && localName(item.name) === name);
}

function send(client: Client, stanza: string): void {
    if (client.socket.readyState === WebSocket.OPEN) client.socket.send(stanza);
}

function jid(client: Client): string {
    return `${client.id}@${DOMAIN}/${client.resource ?? "game"}`;
}

// A small, opt-in XMPP-over-WebSocket service. Auth is the same signed player JWT
// as the metagame, never an account id supplied by the client alone. No stanza,
// token or message body is logged. A game-client compatibility test is still needed.
export class ChatServer {
    private readonly http: HttpServer;
    private readonly ws: WebSocketServer;
    private readonly clients = new Set<Client>();

    constructor() {
        this.http = createServer((_req, res) => { res.writeHead(404); res.end(); });
        this.ws = new WebSocketServer({ server: this.http, maxPayload: FRAME_LIMIT, perMessageDeflate: false });
        this.ws.on("connection", (socket) => {
            const client: Client = { socket, rooms: new Set(), available: false };
            this.clients.add(client);
            const timeout = setTimeout(() => socket.close(1008, "login timeout"), 15000);
            socket.on("message", (data, binary) => {
                if (binary || Buffer.byteLength(data.toString()) > FRAME_LIMIT) { socket.close(1009, "invalid frame"); return; }
                void this.handle(client, data.toString()).then((authenticated) => {
                    if (authenticated) clearTimeout(timeout);
                }).catch(() => socket.close(1008, "invalid stanza"));
            });
            socket.on("close", () => { clearTimeout(timeout); this.clients.delete(client); });
        });
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
        logger.info(`Experimental XMPP chat listening on ${host}:${port}`);
    }

    async close(): Promise<void> {
        for (const client of this.clients) client.socket.terminate();
        await new Promise<void>((resolve) => this.ws.close(() => resolve()));
        await new Promise<void>((resolve) => this.http.close(() => resolve()));
    }

    private async handle(client: Client, raw: string): Promise<boolean> {
        const node: any = parse(raw);
        const kind = localName(node.name);
        if (kind === "open") {
            send(client, `<open xmlns="${FRAMING}" from="${DOMAIN}" id="${crypto.randomBytes(8).toString("hex")}" version="1.0"/>`);
            send(client, client.id
                ? `<stream:features xmlns:stream="${STREAMS}"><bind xmlns="${BIND}"/></stream:features>`
                : `<stream:features xmlns:stream="${STREAMS}"><mechanisms xmlns="${SASL}"><mechanism>PLAIN</mechanism></mechanisms></stream:features>`);
            return Boolean(client.id);
        }
        if (kind === "auth" && !client.id) {
            if (node.attrs.mechanism !== "PLAIN") { client.socket.close(1008, "unsupported auth"); return false; }
            let fields: string[];
            try { fields = Buffer.from(textOf(node), "base64").toString("utf8").split("\0"); }
            catch { client.socket.close(1008, "bad auth"); return false; }
            if (fields.length !== 3 || fields[1].length === 0 || fields[2].length > 8192) { client.socket.close(1008, "bad auth"); return false; }
            try {
                const payload = ValidateMetagameJWTAndGetPayload(fields[2]);
                const id = typeof payload === "object" ? payload.userId : undefined;
                if (typeof id !== "string" || id !== fields[1] || !FindUsernameForUserId(id)) throw new Error("invalid account");
                client.id = id;
                client.authenticatedAt = Date.now();
                send(client, `<success xmlns="${SASL}"/>`);
                return true;
            } catch {
                send(client, `<failure xmlns="${SASL}"><not-authorized/></failure>`);
                client.socket.close(1008, "auth failed");
                return false;
            }
        }
        if (!client.id) { client.socket.close(1008, "auth required"); return false; }
        if (kind === "iq") {
            const id = escapeXml(String(node.attrs.id ?? "").slice(0, 128));
            const binding = child(node, "bind");
            if (binding) {
                const requested = textOf(child(binding, "resource"));
                client.resource = /^[A-Za-z0-9:_-]{1,64}$/.test(requested) ? requested : crypto.randomBytes(6).toString("hex");
                send(client, `<iq type="result" id="${id}"><bind xmlns="${BIND}"><jid>${escapeXml(jid(client))}</jid></bind></iq>`);
            } else if (node.attrs.type === "get" || node.attrs.type === "set") {
                send(client, `<iq type="result" id="${id}"/>`);
            }
            return true;
        }
        if (!client.resource) { client.socket.close(1008, "bind required"); return false; }
        if (kind === "presence") {
            const to = String(node.attrs.to ?? "");
            if (to.includes("@") && to.length <= 256) {
                const room = to.split("/")[0].toLowerCase();
                if (node.attrs.type === "unavailable") client.rooms.delete(room);
                else if (client.rooms.size < 8) client.rooms.add(room);
            } else client.available = node.attrs.type !== "unavailable";
            return true;
        }
        if (kind !== "message") return true;
        const body = textOf(child(node, "body"));
        const to = String(node.attrs.to ?? "");
        if (body.length === 0 || body.length > BODY_LIMIT || to.length > 256) return true;
        const stanzaId = escapeXml(String(node.attrs.id ?? "").slice(0, 128));
        const group = node.attrs.type === "groupchat";
        const target = to.split("/")[0].toLowerCase();
        for (const peer of this.clients) {
            if (!peer.id || !peer.resource || peer.socket.readyState !== WebSocket.OPEN) continue;
            if (group ? (!client.rooms.has(target) || !peer.rooms.has(target)) : peer.id.toLowerCase() !== target.split("@")[0]) continue;
            const from = group ? `${target}/${escapeXml(client.id)}` : escapeXml(jid(client));
            send(peer, `<message from="${from}" to="${escapeXml(jid(peer))}" type="${group ? "groupchat" : "chat"}" id="${stanzaId}"><body>${escapeXml(body)}</body></message>`);
        }
        return true;
    }
}
