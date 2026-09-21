// The whole public-mode flow through the Controller, against a fake TLS gateway that serves the
// metagame routes and /content/*: invite v2 -> pinned ServerStatus -> Register -> install ->
// Play (relay + Engine.ini + launch args) -> game exit stops the relay.
// Ports: 62440 fake gateway (TLS), 62441 relay, 62442 relay for the busy-port case, 62443 a
// gateway whose certificate changes.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { EventEmitter } from "node:events";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Controller, type Platform } from "../src/main/controller";
import { validateManifest, type GameManifest } from "../src/main/manifest";
import { formatInvite } from "../src/shared/invite";
import { setSink } from "../src/main/log";
import { KeyStore } from "../src/main/keystore";
import type { SpawnFn } from "../src/main/launch";
import type { Snapshot } from "../src/shared/types";
import { FakeContentServer, FakeMetagame, makeFiles, manifestFor, sha256, TEST_BUILD } from "./fakes";
import { makeTestCert, type TestCert } from "./certs";

const GATEWAY_PORT = 62440;
const RELAY_PORT = 62441;
const BUSY_RELAY_PORT = 62442;
const SWAP_PORT = 62443;
const ASSETS = path.resolve(__dirname, "..", "..", "assets");
const EXE = "Archon/Binaries/Win64/Fake-Game.exe";

let cert: TestCert;
let other: TestCert;
let gateway: https.Server;
let meta: FakeMetagame;
let content: FakeContentServer;
let gatewayRequests: string[] = [];
const files = makeFiles();
const manifest: GameManifest = (() => {
  const r = validateManifest(manifestFor(files), TEST_BUILD, false);
  if (!r.ok) throw new Error(r.reason);
  return r.manifest;
})();
const logLines: string[] = [];
const temps: string[] = [];

function temp(prefix: string): string {
  const d = mkdtempSync(path.join(tmpdir(), prefix));
  temps.push(d);
  return d;
}

before(async () => {
  cert = makeTestCert();
  other = makeTestCert();
  meta = new FakeMetagame({ name: "Friday Hunts", validCodes: new Set(["ABCD-EFGH-JKLM", "SECOND-CODE", "THIRD-CODE", "FOURTH-CODE"]) });
  content = new FakeContentServer({ key: "unused", files });
  gateway = https.createServer({ cert: cert.certPem, key: cert.keyPem }, (req, res) => {
    gatewayRequests.push(`${req.method} ${req.url}`);
    if ((req.url ?? "").startsWith("/content/")) {
      // The content server accepts any key the metagame knows.
      const key = req.headers["x-undaunted-user-api-key"];
      content.opts = { ...content.opts, key: typeof key === "string" && meta.users.has(key) ? key : "no-such-key" };
      content.handle(req, res);
    } else {
      meta.handle(req, res);
    }
  });
  await new Promise<void>((resolve) => gateway.listen(GATEWAY_PORT, "127.0.0.1", resolve));
  setSink((l) => logLines.push(l));
});

after(async () => {
  gateway.closeAllConnections();
  await new Promise<void>((resolve) => gateway.close(() => resolve()));
  cert.cleanup();
  other.cleanup();
  for (const d of temps) rmSync(d, { recursive: true, force: true });
});

interface Harness {
  c: Controller;
  last: () => Snapshot;
  spawns: { exe: string; args: string[]; cwd: string }[];
  child: () => EventEmitter | null;
  configDir: string;
  installDir: string;
  userData: string;
}

function harness(relayPort = RELAY_PORT): Harness {
  let snap: Snapshot | null = null;
  const spawns: Harness["spawns"] = [];
  let child: EventEmitter | null = null;
  const fakeSpawn = ((exe: string, args: string[], opts: { cwd: string }) => {
    spawns.push({ exe, args, cwd: opts.cwd });
    child = new EventEmitter();
    const c = child;
    setImmediate(() => c.emit("spawn"));
    return child;
  }) as unknown as SpawnFn;
  const userData = temp("dr-ctl-user-");
  const installDir = temp("dr-ctl-game-");
  const configDir = temp("dr-ctl-cfg-");
  const p: Platform = {
    userDataDir: userData,
    resourcesDir: ASSETS,
    defaultInstallDir: installDir,
    appVersion: "0.0.0-test",
    packaged: false,
    defaultLanguage: "en",
    encryptor: {
      isAvailable: () => true,
      encrypt: (plain) => Buffer.from("enc:" + Buffer.from(plain).toString("base64")),
      decrypt: (data) => Buffer.from(data.toString().slice(4), "base64").toString(),
    },
    manifest,
    gameConfigDir: configDir,
    relayPort,
    exePin: { relativePath: EXE, sha256: sha256(files.find((f) => f.path === EXE)!.data) },
    chooseFolder: async () => null,
    chooseSaveFile: async () => null,
    chooseOpenFile: async () => null,
    openExternal: async () => undefined,
    openPath: async () => undefined,
    emitSnapshot: (s) => {
      snap = s;
    },
    emitProgress: () => undefined,
    findTailscale: () => null,
    findRunningClients: async () => [],
    spawn: fakeSpawn,
  };
  const c = new Controller(p);
  return { c, last: () => snap ?? c.snapshot(), spawns, child: () => child, configDir, installDir, userData };
}

function invite(fp: string, code = "ABCD-EFGH-JKLM"): string {
  return formatInvite({ mode: "public", host: "127.0.0.1", port: GATEWAY_PORT, fp, code, name: "Friday Hunts", share: null });
}

function get(port: number, p: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    http
      .get({ host: "127.0.0.1", port, path: p, agent: false }, (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
      })
      .on("error", reject);
  });
}

test("public mode end to end: join, register, install, play through the relay, game exit", async () => {
  const hx = harness();
  await hx.c.init();
  assert.equal(hx.last().phase, "join");

  const joined = await hx.c.submitInvite(invite(cert.fingerprint));
  assert.deepEqual(joined, { ok: true });
  let s = hx.last();
  assert.equal(s.server?.mode, "public");
  assert.equal(s.server?.fingerprint, cert.fingerprint);
  assert.equal(s.connect.problem, null);
  assert.equal(s.phase, "register");
  assert.equal(s.install.contentAvailable, true, "content found behind the gateway");
  assert.equal(s.status?.name, "Friday Hunts");

  const reg = await hx.c.register("Slayer_42");
  assert.deepEqual(reg, { ok: true, username: "Slayer_42" });
  s = hx.last();
  assert.equal(s.phase, "install");
  assert.equal(s.account.username, "Slayer_42");
  assert.equal(meta.registrations.at(-1)?.code, "ABCD-EFGH-JKLM");

  const installed = await hx.c.startInstall();
  assert.deepEqual(installed, { ok: true });
  s = hx.last();
  assert.equal(s.phase, "ready");
  assert.equal(s.notice, "install_done");
  for (const f of files) assert.ok(readFileSync(path.join(hx.installDir, ...f.path.split("/"))).equals(f.data), f.path);
  for (const dll of ["dxgi.dll", "UndauntedInternalServer.dll"]) assert.ok(existsSync(path.join(hx.installDir, "Archon", "Binaries", "Win64", dll)), dll);
  assert.ok(gatewayRequests.some((r) => r.startsWith("GET /content/v1/files/")), "files came through the gateway");

  const played = await hx.c.play();
  assert.deepEqual(played, { ok: true });
  s = hx.last();
  assert.equal(s.phase, "running");
  assert.equal(s.game.relayPort, RELAY_PORT);
  assert.equal(hx.c.relayActive, true);

  // Launch line: the relay first, the key second, never in the log.
  assert.equal(hx.spawns.length, 1);
  const args = hx.spawns[0].args;
  assert.equal(args[0], `127.0.0.1:${RELAY_PORT}`);
  assert.match(args[1], /^-AUTH_PASSWORD=UUK_[0-9a-f]{48}$/);
  const key = args[1].slice("-AUTH_PASSWORD=".length);
  assert.ok(hx.spawns[0].exe.endsWith("Dauntless-Win64-Shipping.exe"));
  assert.ok(logLines.some((l) => l.includes("-AUTH_PASSWORD=<hidden>")), "the launch was logged, masked");
  for (const l of logLines) assert.ok(!l.includes(key), `key leaked into the log: ${l}`);

  // Chat goes to the relay too.
  const ini = readFileSync(path.join(hx.configDir, "Engine.ini"), "latin1");
  assert.ok(ini.includes('ServerAddr="ws://127.0.0.1"\r\nServerPort=' + RELAY_PORT + "\r\nbUseSSL=false"));

  // The game's own traffic crosses the relay to the gateway.
  const through = await get(RELAY_PORT, "/undaunted/api/ServerStatus");
  assert.equal(through.status, 200);
  assert.equal(JSON.parse(through.body).name, "Friday Hunts");

  // The game exits: the relay goes away with it.
  hx.child()!.emit("exit", 0);
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(hx.c.relayActive, false);
  assert.equal(hx.last().phase, "ready");
  await assert.rejects(get(RELAY_PORT, "/undaunted/api/ServerStatus"));
  await hx.c.shutdown();
});

test("public mode: a certificate that does not match the invite stops everything before any request", async () => {
  const hx = harness();
  await hx.c.init();
  gatewayRequests = [];
  await hx.c.submitInvite(invite(other.fingerprint, "SECOND-CODE"));
  const s = hx.last();
  assert.equal(s.phase, "connect");
  assert.equal(s.connect.problem, "cert_mismatch");
  assert.deepEqual(gatewayRequests, [], "the mismatching server received no request at all");
  const reg = await hx.c.register("Other_Name");
  assert.equal(reg.ok, false);
  assert.deepEqual(gatewayRequests, []);
  assert.ok(meta.opts.validCodes?.has("SECOND-CODE"), "the invite code was not spent");
  await hx.c.shutdown();
});

test("public mode: a busy relay port is reported and the game is not started", async () => {
  const hx = harness(BUSY_RELAY_PORT);
  await hx.c.init();
  await hx.c.submitInvite(invite(cert.fingerprint, "SECOND-CODE"));
  assert.deepEqual(await hx.c.register("Busy_Port"), { ok: true, username: "Busy_Port" });
  assert.deepEqual(await hx.c.startInstall(), { ok: true });
  const squatter = net.createServer();
  await new Promise<void>((resolve) => squatter.listen(BUSY_RELAY_PORT, "127.0.0.1", resolve));
  try {
    const r = await hx.c.play();
    assert.deepEqual(r, { ok: false, error: { code: "relay_port_busy", detail: String(BUSY_RELAY_PORT) } });
    assert.equal(hx.spawns.length, 0);
    assert.equal(hx.c.relayActive, false);
    assert.equal(hx.last().phase, "ready");
  } finally {
    await new Promise<void>((resolve) => squatter.close(() => resolve()));
  }
  await hx.c.shutdown();
});

test("public mode: an invite for the same host:port with a new certificate never gets the stored key before the user confirms", async () => {
  // One gateway whose certificate can be swapped: first the real one, then another (a rebuilt
  // server, or someone in the middle who hands out their own invite).
  let presented = cert;
  const seen: { url: string; withKey: boolean; fp: string }[] = [];
  const swap = https.createServer({ cert: cert.certPem, key: cert.keyPem }, (req, res) => {
    seen.push({ url: req.url ?? "", withKey: typeof req.headers["x-undaunted-user-api-key"] === "string", fp: presented.fingerprint });
    if ((req.url ?? "").startsWith("/content/")) {
      const key = req.headers["x-undaunted-user-api-key"];
      content.opts = { ...content.opts, key: typeof key === "string" && meta.users.has(key) ? key : "no-such-key" };
      content.handle(req, res);
    } else {
      meta.handle(req, res);
    }
  });
  await new Promise<void>((resolve) => swap.listen(SWAP_PORT, "127.0.0.1", resolve));
  const inviteFor = (fp: string, code: string) =>
    formatInvite({ mode: "public", host: "127.0.0.1", port: SWAP_PORT, fp, code, name: "Friday Hunts", share: null });
  const hx = harness();
  try {
    await hx.c.init();
    assert.deepEqual(await hx.c.submitInvite(inviteFor(cert.fingerprint, "THIRD-CODE")), { ok: true });
    assert.deepEqual(await hx.c.register("Cert_Change"), { ok: true, username: "Cert_Change" });
    assert.ok(seen.some((r) => r.withKey), "the key was used with the real certificate");

    swap.setSecureContext({ cert: other.certPem, key: other.keyPem });
    presented = other;
    swap.closeAllConnections();
    seen.length = 0;

    // The page asks first and gets the warning.
    assert.deepEqual(await hx.c.checkInvite(inviteFor(other.fingerprint, "FOURTH-CODE")), {
      ok: true,
      certificateChanged: true,
      previousFingerprint: cert.fingerprint,
    });
    assert.deepEqual(await hx.c.checkInvite(inviteFor(cert.fingerprint, "FOURTH-CODE")), { ok: true, certificateChanged: false, previousFingerprint: null });

    // Joining without the user's confirmation changes nothing and sends nothing.
    const refused = await hx.c.submitInvite(inviteFor(other.fingerprint, "FOURTH-CODE"));
    assert.deepEqual(refused, { ok: false, error: { code: "cert_changed", detail: cert.fingerprint } });
    assert.equal(seen.length, 0, "nothing went to the new certificate");
    assert.equal(hx.last().server?.fingerprint, cert.fingerprint, "the saved server keeps its certificate");

    // The old pin keeps refusing the new certificate: still nothing sent.
    await hx.c.connect();
    assert.equal(hx.last().connect.problem, "cert_mismatch");
    assert.equal(seen.length, 0);

    // Whatever the settings say, the stored key belongs to the old certificate only.
    const ks = new KeyStore(path.join(hx.userData, "keys"), {
      isAvailable: () => true,
      encrypt: (plain) => Buffer.from("enc:" + Buffer.from(plain).toString("base64")),
      decrypt: (data) => Buffer.from(data.toString().slice(4), "base64").toString(),
    });
    assert.equal(await ks.load({ host: "127.0.0.1", port: SWAP_PORT, mode: "public", fp: other.fingerprint }), null);
    assert.match((await ks.load({ host: "127.0.0.1", port: SWAP_PORT, mode: "public", fp: cert.fingerprint })) ?? "", /^UUK_/);

    // The user confirms: the key moves to the new certificate and is used there.
    assert.deepEqual(await hx.c.submitInvite(inviteFor(other.fingerprint, "FOURTH-CODE"), { acceptNewCertificate: true }), { ok: true });
    const s = hx.last();
    assert.equal(s.server?.fingerprint, other.fingerprint);
    assert.equal(s.connect.problem, null);
    assert.equal(s.account.username, "Cert_Change");
    assert.equal(s.phase, "install");
    assert.ok(seen.some((r) => r.withKey && r.fp === other.fingerprint && r.url === "/undaunted/api/GetUserInfo"));
    assert.ok(meta.opts.validCodes?.has("FOURTH-CODE"), "the account was kept, the new invite's code was not spent");
    assert.equal(await ks.load({ host: "127.0.0.1", port: SWAP_PORT, mode: "public", fp: cert.fingerprint }), null);
  } finally {
    await hx.c.shutdown();
    swap.closeAllConnections();
    await new Promise<void>((resolve) => swap.close(() => resolve()));
  }
});
