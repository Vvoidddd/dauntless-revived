import { RemoveTestDb } from "./setup";
import "./authenv";
import { PARTY_HTTP_API_PORT, PARTY_HTTP_DEPLOYSERVER_PORT, RecordingDeploy, StartRecordingDeploy, UsePartyEnv } from "./partyenv";
UsePartyEnv(PARTY_HTTP_DEPLOYSERVER_PORT);
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import type { Server } from "node:http";
import { app } from "../src/app";
import { GetDb } from "../src/db";
import { gameserverapikeys, userapikeys, users } from "../src/db/schema";
import { HashUserAPIKey, SignMetagameJWTForUid } from "../src/controllers/auth";

// Parties over HTTP (roadmap 1.9): three players' clients (A, B, C; tokens for throwaway
// accounts in this test's own database) walk the plan's tests T1-T7 that need no game,
// plus the permission rules, the account lookups and the friends routes. The app listens on
// a spare loopback port; the deploy server is a recording fake on another.

const BASE = `http://127.0.0.1:${PARTY_HTTP_API_PORT}`;
const GS_KEY = crypto.randomBytes(24).toString("hex");
const HUNT = "CR19_PlayerHunt_FTUE_Pursuit_Beta_Host";
const A = "UID-party-a", B = "UID-party-b", C = "UID-party-c", ADMIN = "UID-party-admin";
const NAMES: Record<string, string> = { [A]: "Alpha", [B]: "Bravo", [C]: "Charlie", [ADMIN]: "Boss" };
const Keys: Record<string, string> = {};
const Tokens: Record<string, string> = {};

type Reply = { status: number, text: string, json: any };
type CallOptions = { as?: string, token?: string, gs?: boolean, key?: string, body?: unknown, headers?: Record<string, string> };

async function Call(Method: string, Path: string, Options: CallOptions = {}): Promise<Reply> {
    const Headers: Record<string, string> = { ...(Options.headers ?? {}) };

    if(Options.as !== undefined) Headers["authorization"] = `bearer ${Tokens[Options.as]}`;
    if(Options.token !== undefined) Headers["authorization"] = `bearer ${Options.token}`;
    if(Options.gs) Headers["x-undaunted-gameserver-apikey"] = GS_KEY;
    if(Options.key !== undefined) Headers["x-undaunted-user-api-key"] = Options.key;
    if(Options.body !== undefined) Headers["content-type"] = "application/json; charset=utf-8";

    const Response = await fetch(BASE + Path, { method: Method, headers: Headers, body: Options.body === undefined ? undefined : JSON.stringify(Options.body) });
    const Text = await Response.text();
    let Json: any;

    try{ Json = Text.length > 0 ? JSON.parse(Text) : undefined; } catch { Json = undefined; }

    return { status: Response.status, text: Text, json: Json };
}

// The bodies the 1.4.4 client sends (parties plan section 3)
const BUILD = { buildId: "239827_rel-1.4.4_shipping", featureOverrides: [] };
const Poll = (Who: string) => Call("POST", "/party", { as: Who, body: BUILD });
const Invites = (Who: string) => Call("GET", "/party/invites", { as: Who });
const Invite = (Who: string, Recipient: string, PartyId: string) => Call("PUT", "/party/invite", { as: Who, body: { recipientPlayerId: Recipient, partyId: PartyId, ...BUILD } });
const Accept = (Who: string, InviteId: string) => Call("PUT", `/party/invite/accept/${InviteId}`, { as: Who, body: { recipientPlayerId: Who, partyId: InviteId, ...BUILD } });
const Join = (Who: string, Body: Record<string, unknown>) => Call("POST", "/candidate/join", { as: Who, body: { buildId: BUILD.buildId, gameArgs: "", playerId: "", allow_crossplay: true, session_id: "SESSION_ID_LOL", regionUrlsPings: {}, ...Body } });
const Status = (Who: string) => Call("GET", "/candidate/status", { as: Who });

let Deploy: RecordingDeploy;
let Listening: Server | undefined;
let PartyB = "";

before(async () => {
    for(const [UserId, Name] of Object.entries(NAMES)){
        Keys[UserId] = `UUK_${crypto.randomBytes(24).toString("hex")}`;
        GetDb().insert(users).values({ userId: UserId, name: Name, notes: 0, isAdmin: UserId === ADMIN }).run();
        GetDb().insert(userapikeys).values({ userId: UserId, keyHash: HashUserAPIKey(Keys[UserId]) }).run();
        Tokens[UserId] = SignMetagameJWTForUid(UserId);
    }

    GetDb().insert(gameserverapikeys).values({ keyHash: crypto.createHash("sha256").update(GS_KEY, "utf8").digest("hex") }).run();

    Deploy = await StartRecordingDeploy(PARTY_HTTP_DEPLOYSERVER_PORT);
    Listening = await new Promise<Server>((Resolve, Reject) => {
        const Started = app.listen(PARTY_HTTP_API_PORT, "127.0.0.1", (Error?: Error) => Error ? Reject(Error) : Resolve(Started));
    });
});

after(async () => {
    Listening?.closeAllConnections();
    await new Promise<void>((Resolve) => Listening ? Listening.close(() => Resolve()) : Resolve());
    await Deploy?.Close();
    RemoveTestDb(() => GetDb().$client.close());
});

describe("T1-T3: invite, the poll, accept", () => {
    it("each client polls its own party of one; B invites A; A's invite poll shows it; A accepts; both polls show the party with names", async () => {
        const SoloA = await Poll(A);
        const SoloB = await Poll(B);
        assert.equal(SoloA.status, 200);
        assert.deepEqual([SoloA.json.candidateId, SoloA.json.candidateState, SoloA.json.playerStates[0].displayName], ["CANDIDATE_ID_LOL", "QUEUED_FOR_START", "Alpha"]);
        PartyB = SoloB.json.partyId;

        const Sent = await Invite(B, A, PartyB);
        assert.deepEqual([Sent.status, Sent.json], [200, {}]);

        const Pending = await Invites(A);
        assert.deepEqual(Pending.json, { invitations: [{ recipientPlayerId: A, sendingPlayerId: B, partyId: PartyB, sendingPlatform: "win", sendingDisplayName: "Bravo" }] });

        const Accepted = await Accept(A, PartyB);
        assert.equal(Accepted.status, 200);
        assert.deepEqual(Accepted.json, {
            partyId: PartyB,
            leaderPlayerId: B,
            playerIds: [B, A],
            playerStates: [
                { playerId: B, isMemberOfCandidate: false, platform: "win", displayName: "Bravo", consoleSessionId: null },
                { playerId: A, isMemberOfCandidate: false, platform: "win", displayName: "Alpha", consoleSessionId: null }
            ],
            candidateState: null,
            candidateId: null,
            playerHuntId: null,
            gauntletLevel: null
        });

        for(const Who of [A, B]){
            const Party = await Poll(Who);
            assert.deepEqual(Party.json, Accepted.json, `${Who}'s poll`);
        }

        assert.deepEqual((await Invites(A)).json, { invitations: [] });
    });

    it("B invites C too; the party is three", async () => {
        assert.equal((await Invite(B, C, PartyB)).status, 200);
        assert.equal((await Accept(C, PartyB)).status, 200);
        assert.deepEqual((await Poll(C)).json.playerIds, [B, A, C]);
    });
});

describe("a player only ever acts as themself", () => {
    it("the invite poll answers an empty list without a valid token, and nobody's invites but the token's", async () => {
        await Poll(ADMIN);
        assert.equal((await Invite(ADMIN, A, "")).status, 200, "an invite for A to see");

        for(const Options of [{}, { token: "not-a-token" }, { gs: true }] as CallOptions[]){
            const Anonymous = await Call("GET", "/party/invites", Options);
            assert.deepEqual([Anonymous.status, Anonymous.json], [200, { invitations: [] }], JSON.stringify(Options));
        }

        assert.equal((await Invites(A)).json.invitations.length, 1);
        assert.equal((await Invites(C)).json.invitations.length, 0, "C does not see A's invite");
        assert.equal((await Call("DELETE", "/party/invite", { as: A, body: { sendingPlayerId: (await Poll(ADMIN)).json.partyId, recipientPlayerId: A, partyId: (await Poll(ADMIN)).json.partyId } })).status, 200);
        assert.equal((await Invites(A)).json.invitations.length, 0, "declined");
    });

    it("party routes need a player's token: none is 401, the game-server key alone is 403", async () => {
        assert.equal((await Call("POST", "/party", { body: BUILD })).status, 401);
        assert.equal((await Call("POST", "/party", { gs: true, body: BUILD })).status, 403);
        assert.equal((await Call("PUT", "/party/invite", { gs: true, body: { recipientPlayerId: A } })).status, 403);
        assert.equal((await Call("DELETE", "/party/member", {})).status, 401);
    });

    it("accepting for someone else, kicking from a party you do not lead or are not in, and inviting into another's party are refused", async () => {
        await Poll(ADMIN);
        assert.equal((await Invite(ADMIN, C, "")).status, 200);
        const ForC = await Call("PUT", `/party/invite/accept/${(await Poll(ADMIN)).json.partyId}`, { as: A, body: { recipientPlayerId: C, partyId: "x" } });
        assert.equal(ForC.status, 404, "A accepting C's invite: only A's own invites are looked up");
        assert.equal((await Invites(C)).json.invitations.length, 1, "C's invite is untouched");
        assert.deepEqual((await Poll(A)).json.playerIds, [B, A, C], "A stayed where A was");
        assert.equal((await Call("DELETE", "/party/invite", { as: C, body: { recipientPlayerId: C, partyId: (await Poll(ADMIN)).json.partyId, sendingPlayerId: ADMIN } })).status, 200);

        assert.equal((await Call("DELETE", `/party/member/${B}`, { as: A })).status, 403, "A is not the leader");
        assert.equal((await Call("DELETE", `/party/member/${B}`, { as: ADMIN })).status, 404, "not in the caller's party");
        assert.equal((await Call("PUT", `/party/member/promote/${A}`, { as: C })).status, 403);
        assert.equal((await Invite(A, ADMIN, PartyB)).status, 403, "only the leader invites");
        assert.equal((await Call("DELETE", `/party/leader/${B}`, { as: A })).status, 200, "the client's eviction call answers 200 ...");
        assert.equal((await Poll(A)).json.leaderPlayerId, B, "... and changes nothing while B is heard from");
        assert.deepEqual((await Poll(B)).json.playerIds, [B, A, C]);
    });
});

describe("T5: the leader picks a hunt; the whole party lands on one server", () => {
    let CandidateId = "";

    it("one deploy call with every member expected; the members' polls show the candidate; everyone gets the same server", async () => {
        Deploy.Calls.length = 0;

        const Joined = await Join(B, { gameMode: "ISLAND", isPrivate: false, partyId: PartyB, hunts: ["CR19_MatchmakerHunt_Host_Beta"], playerHuntId: HUNT });
        assert.equal(Joined.status, 200);
        assert.deepEqual(Object.keys(Joined.json), ["candidateId", "gameMode", "huntId", "status", "statusReason"]);
        assert.deepEqual([Joined.json.status, Joined.json.gameMode, Joined.json.huntId], ["MATCHING", "ISLAND", HUNT]);
        CandidateId = Joined.json.candidateId;

        assert.equal(Deploy.Calls.length, 1);
        assert.deepEqual(Deploy.Calls[0], { GameMode: "ISLAND", GameArgs: "", HuntId: HUNT, ExpectedPlayers: [B, A, C] });

        // The client sends DELETE /candidate right after every queued join; it keeps its 404 (MATCHMAKING_CANCEL unset)
        assert.equal((await Call("DELETE", "/candidate", { as: B })).status, 404);

        for(const Member of [A, C]){
            const Party = (await Poll(Member)).json;
            assert.deepEqual([Party.candidateState, Party.candidateId, Party.playerHuntId], ["IN_PROGRESS", CandidateId, HUNT], Member);
            assert.ok(Party.playerStates.every((State: any) => State.isMemberOfCandidate === true));
        }

        // A member's client may follow by joining the candidate by id (the exe's CandidateJoin)
        const Follow = await Call("POST", `/candidate/join/${CandidateId}`, { as: C, body: { buildId: BUILD.buildId } });
        assert.deepEqual([Follow.status, Follow.json], [200, { candidateId: CandidateId, gameMode: "ISLAND", huntId: HUNT, status: "MATCHING", statusReason: null }]);
        assert.equal((await Call("POST", `/candidate/join/${CandidateId}`, { as: ADMIN, body: {} })).status, 404, "not a member of it");
        assert.equal(Deploy.Calls.length, 1);

        for(const Member of [B, A, C]){
            const Polled = await Status(Member);
            assert.equal(Polled.status, 200);
            assert.deepEqual(Polled.json, {
                candidateId: CandidateId,
                candidateStatusPeriodMillis: 10000,
                gameMode: "ISLAND",
                huntId: HUNT,
                playerStates: { [B]: {}, [A]: {}, [C]: {} },
                serverInfo: { buildId: "239827_1.4.4_shipping", gameSessionId: CandidateId, host: "127.0.0.1", port: 8775 },
                status: "IN_PROGRESS",
                statusDuration: 0.0,
                statusReason: null
            }, Member);
        }
    });

    it("the leader's second join while loading the island starts no second server", async () => {
        const Again = await Join(B, { gameMode: "ISLAND", isPrivate: true, partyId: PartyB, hunts: ["CR19_MatchmakerHunt_Host_Beta"], playerHuntId: HUNT });
        assert.deepEqual([Again.status, Again.json.candidateId, Again.json.status], [200, CandidateId, "MATCHING"]);
        assert.equal(Deploy.Calls.length, 1);
        assert.equal((await Status(B)).json.status, "MATCHING", "answered like the solo second join, so the client does not travel twice");
    });

    it("a member cannot start a hunt of their own while in the party", async () => {
        assert.equal((await Join(A, { gameMode: "ISLAND", playerHuntId: "CR19_PlayerHunt_Pursuit_Bullseye_Beta" })).status, 400);
        assert.equal(Deploy.Calls.length, 1);
    });
});

describe("T6: the leader returns to Ramsgate; the members on the hunt come along", () => {
    it("CITY from the leader moves every member that was sent to the leader's server", async () => {
        Deploy.Calls.length = 0;

        const Back = await Join(B, { gameMode: "CITY", playerHuntId: "ShatteredIsles_ReturnToRamsgate" });
        assert.equal(Back.status, 200);
        assert.deepEqual(Deploy.Calls.map((Call) => Call.GameMode), ["CITY"]);

        for(const Member of [A, C]){
            assert.equal((await Poll(Member)).json.playerHuntId, "ShatteredIsles_ReturnToRamsgate");
            const Polled = await Status(Member);
            assert.deepEqual([Polled.json.status, Polled.json.serverInfo.port], ["IN_PROGRESS", 8777], Member);
        }

        assert.equal((await Status(B)).json.serverInfo.port, 8777);
    });
});

describe("T7: promote, kick, decline, leave", () => {
    it("each change shows in the next poll", async () => {
        assert.equal((await Call("PUT", `/party/member/promote/${A}`, { as: B })).status, 200);
        assert.equal((await Poll(C)).json.leaderPlayerId, A);

        assert.equal((await Call("DELETE", `/party/member/${C}`, { as: A })).status, 200);
        assert.deepEqual((await Poll(B)).json.playerIds, [B, A]);
        const Kicked = (await Poll(C)).json;
        assert.notEqual(Kicked.partyId, PartyB);
        assert.equal(Kicked.candidateId, "CANDIDATE_ID_LOL");

        assert.equal((await Invite(A, C, PartyB)).status, 200);
        assert.equal((await Call("DELETE", "/party/invite", { as: C, body: { sendingPlayerId: PartyB, recipientPlayerId: C, partyId: PartyB } })).status, 200);
        assert.deepEqual((await Invites(C)).json, { invitations: [] });

        assert.deepEqual([(await Call("DELETE", "/party/member", { as: B })).status], [200]);
        const Alone = (await Poll(A)).json;
        assert.deepEqual([Alone.partyId, Alone.leaderPlayerId, Alone.candidateState, Alone.playerStates.length], [PartyB, A, "QUEUED_FOR_START", 1]);
    });

    it("POST /party/status lists the asked players' parties and the caller's own invitations", async () => {
        await Poll(B);
        const Reply = await Call("POST", "/party/status", { as: C, body: { playerIds: [A, B, C] } });
        assert.equal(Reply.status, 200);
        assert.deepEqual(Object.keys(Reply.json), ["parties", "invitations"]);
        assert.equal(Reply.json.parties.length, 3);
        assert.deepEqual(Reply.json.invitations, []);
    });
});

describe("account lookups (Hunt Members, /invite <name>)", () => {
    it("?accountId=..&accountId=.. answers an array of the known accounts; no query answers the caller's account as before", async () => {
        const Many = await Call("GET", `/account/api/public/account?accountId=${A}&accountId=${B}&accountId=UID-nobody`, { as: C });
        assert.deepEqual(Many.json, [{ id: A, displayName: "Alpha", externalAuths: {} }, { id: B, displayName: "Bravo", externalAuths: {} }]);
        const One = await Call("GET", `/account/api/public/account?accountId=${A}`, { as: C });
        assert.deepEqual(One.json, [{ id: A, displayName: "Alpha", externalAuths: {} }]);

        const Own = await Call("GET", "/account/api/public/account", { as: C });
        assert.deepEqual([Own.json.id, Own.json.displayName, Own.json.ageGroup], [C, "Charlie", "ADULT"]);
    });

    it("/account/:id and /account/displayName/:name answer with a token, and the old replies without", async () => {
        assert.deepEqual((await Call("GET", `/account/api/public/account/${B}`, { as: A })).json, { id: B, displayName: "Bravo", externalAuths: {} });
        assert.deepEqual((await Call("GET", `/account/api/public/account/${B}`)).json, {});
        assert.deepEqual((await Call("GET", "/account/api/public/account/UID-nobody", { as: A })).json, {});
        assert.deepEqual((await Call("GET", `/account/api/public/account/${B}/externalAuths`, { as: A })).json, {});

        assert.deepEqual((await Call("GET", "/account/api/public/account/displayName/charlie", { as: A })).json, { id: C, displayName: "Charlie", externalAuths: {} });
        assert.equal((await Call("GET", "/account/api/public/account/displayName/Nobody", { as: A })).status, 404);
        assert.equal((await Call("GET", "/account/api/public/account/displayName/Charlie")).status, 404);
    });

    it("POST /account/mapping maps our own accounts to themselves in accountMappings, flat and wrapped at once, and never 404s", async () => {
        const Entry = (Id: string, Name: string, Source = "epic") => ({
            accountType: "phoenix", accountId: Id, id: Id, epic: Id, phoenix: Id,
            srcAccountType: Source, srcAccountId: Id, srcId: Id, dstAccountType: "phoenix", dstAccountId: Id, displayName: Name
        });
        const Expect = (...Entries: object[]) => ({ code: "OK", message: "", payload: { accountMappings: Entries }, accountMappings: Entries });

        // Exactly what the live 1.4.4 client sent after a friend search and a party invite (22 September 2026)
        const AsSent = await Call("POST", "/account/mapping", { as: A, body: { srcAccountType: "epic", ids: [B] } });
        assert.equal(AsSent.status, 200);
        assert.deepEqual(AsSent.json, Expect(Entry(B, "Bravo")));
        assert.deepEqual(Object.keys(AsSent.json), ["code", "message", "payload", "accountMappings"], "no top-level key an id reader could take for an account");

        // Several ids: in the asked order, once each, unknown ids left out
        assert.deepEqual((await Call("POST", "/account/mapping", { as: A, body: { srcAccountType: "epic", ids: [C, "UID-nobody", B, C] } })).json, Expect(Entry(C, "Charlie"), Entry(B, "Bravo")));

        // The older guesses at the body still work: a bare array, externalIds, type/externalAuthType
        assert.deepEqual((await Call("POST", "/account/mapping", { as: A, body: [C] })).json, Expect(Entry(C, "Charlie")));
        assert.deepEqual((await Call("POST", "/account/mapping", { as: A, body: { type: "epic", externalIds: [B] } })).json, Expect(Entry(B, "Bravo")));
        assert.deepEqual((await Call("POST", "/account/mapping", { as: A, body: { externalAuthType: "psn", ids: [B] } })).json, Expect(Entry(B, "Bravo", "psn")));
        assert.deepEqual((await Call("POST", "/account/mapping", { as: A, body: { srcAccountType: "bad type!", ids: [B] } })).json, Expect(Entry(B, "Bravo")));

        // No token: nothing is mapped (no names to strangers); an empty or odd body is still a 200 with no mappings.
        const NoToken = await Call("POST", "/account/mapping", { body: { srcAccountType: "epic", ids: [B] } });
        assert.deepEqual([NoToken.status, NoToken.json], [200, Expect()]);
        assert.deepEqual((await Call("POST", "/account/mapping", { as: A, body: {} })).json, Expect());
        assert.deepEqual((await Call("POST", "/account/mapping", { as: A, body: { ids: [{ a: 1 }, 7, "", "x".repeat(200)] } })).json, Expect());
    });

    it("/accountinfo/public with an unknown account answers an empty name instead of a 500", async () => {
        const Unknown = await Call("POST", "/accountinfo/public", { as: A, body: { accountId: "UID-nobody" } });
        assert.deepEqual([Unknown.status, Unknown.json.username], [200, ""]);
        assert.equal((await Call("POST", "/accountinfo/public", { as: A, body: { accountId: B } })).json.username, "Bravo");
    });
});

describe("friends list and blocklist", () => {
    it("request, accept, the two directions, and unfriend", async () => {
        const List = async (Who: string, Pending = true) => (await Call("GET", `/friends/api/public/friends/${Who}${Pending ? "?includePending=true" : ""}`, { as: Who })).json;

        assert.deepEqual(await List(A), []);
        assert.equal((await Call("POST", `/friends/api/public/friends/${A}/${B}`, { as: A })).status, 204);
        const Outbound = await List(A);
        assert.deepEqual(Outbound.map((Friend: any) => [Friend.accountId, Friend.status, Friend.direction]), [[B, "PENDING", "OUTBOUND"]]);
        assert.match(Outbound[0].created, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
        assert.deepEqual((await List(B)).map((Friend: any) => [Friend.accountId, Friend.status, Friend.direction]), [[A, "PENDING", "INBOUND"]]);
        assert.deepEqual(await List(B, false), [], "without includePending only friends");

        assert.equal((await Call("POST", `/friends/api/public/friends/${B}/${A}`, { as: B })).status, 204, "B accepts by asking back");
        assert.deepEqual((await List(A)).map((Friend: any) => [Friend.accountId, Friend.status, Friend.direction]), [[B, "ACCEPTED", "OUTBOUND"]]);
        assert.deepEqual((await List(B, false)).map((Friend: any) => [Friend.accountId, Friend.status, Friend.direction]), [[A, "ACCEPTED", "INBOUND"]]);

        assert.equal((await Call("DELETE", `/friends/api/public/friends/${B}/${A}`, { as: B })).status, 204);
        assert.deepEqual(await List(A), []);
    });

    it("a token reads and changes only its own lists", async () => {
        await Call("POST", `/friends/api/public/friends/${A}/${C}`, { as: A });
        const Foreign = await Call("GET", `/friends/api/public/friends/${A}?includePending=true`, { as: B });
        assert.deepEqual([Foreign.status, Foreign.json], [200, []], "another account's list: the old empty reply, never A's data");
        assert.deepEqual((await Call("GET", `/friends/api/public/friends/${A}?includePending=true`)).json, [], "no token: the old empty list");
        assert.equal((await Call("GET", `/friends/api/public/friends/${A}?includePending=true`, { as: A })).json.length, 1, "A sees the request to C");
        assert.equal((await Call("DELETE", `/friends/api/public/friends/${A}/${C}`, { as: A })).status, 204);
        assert.deepEqual((await Call("GET", `/friends/api/public/blocklist/${A}`)).json, { blockedUsers: [] });
        assert.equal((await Call("POST", `/friends/api/public/friends/${B}/${C}`, { as: A })).status, 403);
        assert.equal((await Call("POST", `/friends/api/public/friends/${A}/${C}`)).status, 401);
        assert.equal((await Call("POST", `/friends/api/public/friends/${A}/UID-nobody`, { as: A })).status, 404);
        assert.equal((await Call("POST", `/friends/api/public/friends/${A}/${A}`, { as: A })).status, 400);
    });

    it("a block hides nothing but stops friend requests and party invites both ways", async () => {
        assert.equal((await Call("POST", `/friends/api/public/blocklist/${C}/${A}`, { as: C })).status, 204);
        assert.deepEqual((await Call("GET", `/friends/api/public/blocklist/${C}`, { as: C })).json, { blockedUsers: [A] });
        assert.equal((await Call("POST", `/friends/api/public/friends/${A}/${C}`, { as: A })).status, 403);
        assert.equal((await Invite(A, C, "")).status, 403);
        assert.equal((await Call("DELETE", `/friends/api/public/blocklist/${C}/${A}`, { as: C })).status, 204);
        assert.deepEqual((await Call("GET", `/friends/api/public/blocklist/${C}`, { as: C })).json, { blockedUsers: [] });
        assert.equal((await Invite(A, C, "")).status, 200);
    });

    it("recent players and settings answer their empty defaults", async () => {
        assert.deepEqual((await Call("GET", `/friends/api/public/list/fortnite/${A}/recentPlayers`, { as: A })).json, []);
        assert.deepEqual((await Call("GET", `/friends/api/v1/${A}/settings`, { as: A })).json, { acceptInvites: "public" });
    });
});

describe("/undaunted/api fallbacks by name", () => {
    it("PartyInvite: the key's owner invites; an admin may name the inviter, directly only", async () => {
        const ByKey = await Call("POST", "/undaunted/api/PartyInvite", { key: Keys[B], body: { Username: "charlie" } });
        assert.deepEqual([ByKey.status, ByKey.json], [200, { From: "Bravo", To: "Charlie" }]);
        assert.ok((await Invites(C)).json.invitations.some((Pending: any) => Pending.sendingPlayerId === B));

        assert.equal((await Call("POST", "/undaunted/api/PartyInvite", { key: Keys[A], body: { Username: "Bravo", From: "Charlie" } })).status, 403, "not an admin");
        const ForSomeone = await Call("POST", "/undaunted/api/PartyInvite", { key: Keys[ADMIN], body: { Username: "Alpha", From: C } });
        assert.deepEqual([ForSomeone.status, ForSomeone.json], [200, { From: "Charlie", To: "Alpha" }]);
        assert.equal((await Call("POST", "/undaunted/api/PartyInvite", { key: Keys[ADMIN], body: { Username: "Alpha", From: "Bravo" }, headers: { "x-forwarded-for": "203.0.113.9" } })).status, 403, "admin through a proxy");
        assert.equal((await Call("POST", "/undaunted/api/PartyInvite", { key: Keys[B], body: { Username: "Nobody" } })).status, 404);
        assert.equal((await Call("POST", "/undaunted/api/PartyInvite", { body: { Username: "Alpha" } })).status, 401);
        const Refused = await Call("POST", "/undaunted/api/PartyInvite", { key: Keys[B], body: { Username: "Charlie" } });
        assert.deepEqual([Refused.status, Refused.json.error], [409, "party_invite_refused"], "already invited");
    });

    it("Friends: sends a request, or accepts the one the other side sent", async () => {
        const Sent = await Call("POST", "/undaunted/api/Friends", { key: Keys[C], body: { Username: "Bravo" } });
        assert.deepEqual([Sent.status, Sent.json], [200, { From: "Charlie", To: "Bravo", Result: "requested" }]);
        const Back = await Call("POST", "/undaunted/api/Friends", { key: Keys[B], body: { Username: "charlie" } });
        assert.deepEqual([Back.status, Back.json.Result], [200, "accepted"]);
        assert.deepEqual((await Call("GET", `/friends/api/public/friends/${B}`, { as: B })).json.map((Friend: any) => Friend.accountId), [C]);
    });
});

describe("heartbeats", () => {
    it("a game server's heartbeat without a player token records nobody", async () => {
        const Beat = await Call("POST", "/heartbeat", { gs: true, body: { map: "/Game/Maps/ramsgate/ramsgate_01_persistent" } });
        assert.deepEqual([Beat.status, Beat.text], [200, "20000"]);
        assert.deepEqual((await Call("POST", "/heartbeat", { as: A, body: { map: "/Game/Maps/ramsgate/ramsgate_01_persistent" } })).text, "20000");
        const Players = await Call("GET", "/undaunted/api/PrivateOnlineStats", { key: Keys[ADMIN] });
        assert.deepEqual(Players.json.map((Player: any) => Player.UserId), [A], "only the player's own heartbeat");
    });
});
