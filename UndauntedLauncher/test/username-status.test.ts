import { test } from "node:test";
import assert from "node:assert/strict";
import { checkUsername, extractAccountKey, isPlausibleAccountKey } from "../src/shared/username";
import { parseServerStatus, sortInstances } from "../src/shared/status";
import { parseBranding, parseNews, sniffImage } from "../src/main/hostapi";
import { BELL, RLO } from "../src/shared/text";

test("username rules (roadmap 1.6)", () => {
  assert.equal(checkUsername("Slayer_01"), "ok");
  assert.equal(checkUsername("abc"), "ok");
  assert.equal(checkUsername("a".repeat(16)), "ok");
  assert.equal(checkUsername(""), "empty");
  assert.equal(checkUsername("ab"), "too_short");
  assert.equal(checkUsername("a".repeat(17)), "too_long");
  assert.equal(checkUsername("bad name"), "bad_chars");
  assert.equal(checkUsername("näyttö"), "bad_chars");
  assert.equal(checkUsername("x-y"), "bad_chars");
  assert.equal(checkUsername("<script>"), "bad_chars");
  assert.equal(checkUsername(undefined), "empty");
  assert.equal(checkUsername(123), "empty");
});

test("account keys", () => {
  const key = "UUK_" + "ab".repeat(24);
  assert.equal(isPlausibleAccountKey(key), true);
  assert.equal(isPlausibleAccountKey("short"), false);
  assert.equal(isPlausibleAccountKey("UUK_has space"), false);
  assert.equal(isPlausibleAccountKey('UUK_"quote"'), false);
  assert.equal(extractAccountKey(`  ${key}\r\n`), key);
  assert.equal(extractAccountKey(`Dauntless Revived account key\r\n\r\nServer: X\r\nKey: ${key}\r\n\r\nKeep this file private.`), key);
  assert.equal(extractAccountKey("not a key at all"), null);
});

const fullStatus = {
  name: "Alex's Ramsgate",
  online: true,
  version: "1.2.0",
  commit: "a4cb7cf",
  sourceUrl: "https://github.com/mixutin/dauntless-revived",
  registration: "INVITECODE",
  playersOnline: 3,
  players: [
    { name: "Aurora", where: "city", instance: "8777" },
    { name: "Borealis", where: "hunt", instance: "8770" },
    { name: "Cirrus", where: "somewhere-new", instance: null },
  ],
  instances: [
    { id: "8770", kind: "hunt", title: "Hunt: Shrike", map: "Hunt_Shrike", behemoth: "Shrike", players: 1, maxPlayers: 4, startedAt: "2026-09-21T10:00:00Z" },
    { id: "8777", kind: "city", title: "Ramsgate", map: "Ramsgate", behemoth: null, players: 1, maxPlayers: 100, startedAt: "2026-09-21T08:00:00.000Z" },
    { id: "8776", kind: "dojo", title: "Training Dojo", map: "Dojo", behemoth: null, players: 0, maxPlayers: 1, startedAt: "garbage" },
  ],
  contentPort: 61002,
  uptimeSeconds: 12345,
};

test("ServerStatus: parses the full contract", () => {
  const s = parseServerStatus(fullStatus);
  assert.ok(s);
  assert.equal(s.name, "Alex's Ramsgate");
  assert.equal(s.online, true);
  assert.equal(s.registration, "INVITECODE");
  assert.equal(s.playersOnline, 3);
  assert.equal(s.players.length, 3);
  assert.equal(s.players[2].where, "unknown");
  assert.equal(s.instances.length, 3);
  assert.equal(s.instances[2].startedAt, null);
  assert.equal(s.instances[1].startedAt, "2026-09-21T08:00:00.000Z");
  assert.equal(s.contentPort, 61002);
  assert.equal(s.sourceUrl, "https://github.com/mixutin/dauntless-revived");
  assert.deepEqual(sortInstances(s.instances).map((i) => i.kind), ["city", "dojo", "hunt"]);
});

test("ServerStatus: rejects or cleans hostile input", () => {
  assert.equal(parseServerStatus(null), null);
  assert.equal(parseServerStatus([]), null);
  assert.equal(parseServerStatus({ online: true }), null); // no name
  const s = parseServerStatus({
    name: `  Evil${RLO}${BELL} Server  `,
    online: "yes",
    sourceUrl: "javascript:alert(1)",
    registration: "WHATEVER",
    playersOnline: -5,
    players: [{ name: "<img src=x onerror=alert(1)>", where: "city" }, "junk", { where: "hunt" }],
    instances: [{ id: "x", kind: "raid", title: "t" }, { id: "y", kind: "hunt", players: 1e9, maxPlayers: "4" }],
    contentPort: 70000,
    uptimeSeconds: "long",
  });
  assert.ok(s);
  assert.equal(s.name, "Evil Server");
  assert.equal(s.online, false);
  assert.equal(s.sourceUrl, null);
  assert.equal(s.registration, null);
  assert.equal(s.playersOnline, 0);
  assert.equal(s.players.length, 1);
  assert.equal(s.players[0].name, "<img src=x onerror=alert(1)>"); // kept as text; the UI never renders HTML
  assert.equal(s.instances.length, 1);
  assert.equal(s.instances[0].players, 1000);
  assert.equal(s.instances[0].maxPlayers, 0);
  assert.equal(s.contentPort, 65535);
  assert.equal(s.uptimeSeconds, 0);
  assert.equal(parseServerStatus({ name: "x", contentPort: 0 })?.contentPort, null);
  assert.equal(parseServerStatus({ name: "x", contentPort: null })?.contentPort, null);
  assert.equal(parseServerStatus({ name: "x", sourceUrl: "http://example.com" })?.sourceUrl, null);
  assert.equal(parseServerStatus({ name: "x", sourceUrl: "https://u:p@example.com" })?.sourceUrl, null);
});

test("ServerStatus: caps list sizes", () => {
  const players = Array.from({ length: 2000 }, (_, i) => ({ name: `p${i}`, where: "menu" }));
  const s = parseServerStatus({ name: "x", players });
  assert.equal(s?.players.length, 500);
});

test("news and branding parsing", () => {
  const news = parseNews({ items: [{ date: "2026-09-20T12:00:00Z", title: "Friends night", body: `Line one\r\nLine two${BELL}` }, { title: "no body" }, "junk"] });
  assert.equal(news.length, 1);
  assert.equal(news[0].body, "Line one\nLine two");
  assert.deepEqual(parseNews(null), []);
  const b = parseBranding({
    backgrounds: [
      { url: "/content/v1/branding/dusk.jpg", credit: "Painted by a friend" },
      { url: "/content/v1/branding/../secret.jpg" },
      { url: "https://evil.example/x.png" },
      { url: "/content/v1/branding/script.svg" },
    ],
    accent: "#3EE6D3",
  });
  assert.equal(b.backgrounds.length, 1);
  assert.equal(b.accent, "#3ee6d3");
  assert.equal(parseBranding({ accent: "red; background:url(x)" }).accent, null);
  assert.equal(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
  assert.equal(sniffImage(Buffer.from("<svg onload=alert(1)>")), null);
});
