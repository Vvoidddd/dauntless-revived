import { RemoveTestDb } from "./setup";
import { FAKE_DEPLOYSERVER_PORT } from "./statusenv";
import "./authenv";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { GetDb } from "../src/db";
import { users } from "../src/db/schema";
import { BehemothName, BuildServerStatus, ClassifyPlace, ClearServerStatusCache, GetServerIdentity, GetServerStatus, InstanceTitle } from "../src/controllers/serverstatus";
import { GetOnlinePlayerActivity, UpdatePlayerActivity } from "../src/controllers/undauntedapi";
import { HandlePlayerMatchmaking } from "../src/controllers/matchmaking";
import { FakeDeployServer, StartFakeDeployServer, ThreeServers, TUTORIAL_GAME_ARGS } from "./fakedeploy";

let Fake: FakeDeployServer | undefined;

after(async () => {
    await Fake?.Close();
    RemoveTestDb(() => GetDb().$client.close());
});

function Account(UserId: string, Name: string){
    GetDb().insert(users).values({ userId: UserId, name: Name, notes: 0 }).run();
}

describe("ClassifyPlace", () => {
    it("reads the heartbeat's map as a package path or a bare name", () => {
        const Cases: [unknown, string | undefined, string][] = [
            ["/Game/Maps/Map_LoginMenu", undefined, "menu"],
            ["Map_LoginMenu", undefined, "menu"],
            ["/Game/Maps/ramsgate/ramsgate_01_persistent", undefined, "city"],
            ["ramsgate_01_persistent", undefined, "city"],
            ["/Game/Maps/islands/dojo/training_dojo_persistent", undefined, "dojo"],
            ["/Game/Maps/islands/1705/dia_moss_triforce", undefined, "tutorial"],
            ["/Game/Maps/islands/1705/dia_moss_triforce_2", undefined, "hunt"],
            ["/Game/Maps/islands/1702/cora_jamima", undefined, "hunt"],
            ["/Game/Maps/islands/arenas/arena_ramsgate_00", undefined, "hunt"],
            ["cora_jamima", undefined, "hunt"],
            ["", "city", "city"],
            [undefined, "menu", "menu"],
            [undefined, "lobby", "menu"],
            [undefined, "island", "hunt"],
            [undefined, undefined, "unknown"],
            [{}, undefined, "unknown"]
        ];

        for(const [Map, State, Expected] of Cases){
            assert.equal(ClassifyPlace(Map, State), Expected, `${JSON.stringify(Map)} / ${State}`);
        }
    });
});

describe("hunt titles", () => {
    it("names behemoths from the hunt tables, else by codename", () => {
        assert.equal(BehemothName({ behemoth: "/Game/Monsters/lerawr/lerawr_beta_bp.lerawr_beta_bp_C", matchmakerHuntId: "CR19_MatchmakerHunt_Lerawr_Beta" }), "Lesser Embermane");
        assert.equal(BehemothName({ behemoth: "/Game/Monsters/mcrollin/mcbeaver_alpha_bp.mcbeaver_alpha_bp_C", matchmakerHuntId: "CR19_MatchmakerHunt_Beaver_Heroic" }), "Heroic Ragetail Gnasher");
        assert.equal(BehemothName({ behemoth: "/Game/Monsters/mcrollin/mcbeaver_alpha_bp.mcbeaver_alpha_bp_C", matchmakerHuntId: null }), "Ragetail Gnasher");
        assert.equal(BehemothName({ behemoth: "/Game/Monsters/sq/electroquill/electroquill_alpha_bp.electroquill_alpha_bp_C", matchmakerHuntId: "Arena_MatchmakerHunt_Hard_001" }), "Shockjaw Nayzaga");
        assert.equal(BehemothName({ behemoth: "/Game/Monsters/mcrollin/mcbeaver_tutorial_bp.mcbeaver_tutorial_bp_C", matchmakerHuntId: null }), "Gnasher");
        assert.equal(BehemothName({ behemoth: "/Game/Monsters/fulgar/fulgar_umbral_bp.fulgar_umbral_bp_C", matchmakerHuntId: null }), "fulgar_umbral");
        assert.equal(BehemothName({ behemoth: null, matchmakerHuntId: null }), null);
        assert.equal(BehemothName({ behemoth: null, matchmakerHuntId: "toString" }), null);
    });

    it("titles Ramsgate, the Dojo, the tutorial and hunts", () => {
        assert.equal(InstanceTitle({ kind: "city", map: "/Game/Maps/ramsgate/ramsgate_01_persistent", huntId: null }, null), "Ramsgate");
        assert.equal(InstanceTitle({ kind: "dojo", map: "/Game/Maps/islands/dojo/training_dojo_persistent", huntId: null }, null), "Training Dojo");
        assert.equal(InstanceTitle({ kind: "tutorial", map: "/Game/Maps/islands/1705/dia_moss_triforce", huntId: null }, "Gnasher"), "Tutorial");
        assert.equal(InstanceTitle({ kind: "hunt", map: "/Game/Maps/islands/1702/cora_jamima", huntId: null }, "Lesser Embermane"), "Hunt: Lesser Embermane");
        assert.equal(InstanceTitle({ kind: "hunt", map: "/Game/Maps/islands/1702/cora_jamima", huntId: "CR19_PlayerHunt_Escalation_Randall_Easy" }, null), "Hunt: Umbral Escalation");
        assert.equal(InstanceTitle({ kind: "hunt", map: "/Game/Maps/islands/1702/cora_jamima?game=X", huntId: null }, null), "Hunt: cora_jamima");
    });
});

describe("GetServerIdentity", () => {
    it("has defaults and takes SERVER_NAME, SERVER_VERSION, GIT_COMMIT and SOURCE_URL", () => {
        const Saved = { ...process.env };

        try{
            for(const Key of ["SERVER_NAME", "SERVER_VERSION", "GIT_COMMIT", "SOURCE_URL"]){
                delete process.env[Key];
            }

            const Defaults = GetServerIdentity();
            assert.equal(Defaults.name, "Dauntless Revived");
            assert.equal(Defaults.sourceUrl, "https://github.com/mixutin/dauntless-revived");
            assert.equal(Defaults.version, "0.0.5");
            assert.equal(typeof Defaults.commit, "string");

            Object.assign(process.env, { SERVER_NAME: "Friday Hunts", SERVER_VERSION: "friends-v1", GIT_COMMIT: "0123456789abcdef0123456789abcdef01234567-dirty", SOURCE_URL: "https://example.org/src" });
            assert.deepEqual(GetServerIdentity(), { name: "Friday Hunts", version: "friends-v1", commit: "0123456789abcdef0123456789abcdef01234567-dirty", sourceUrl: "https://example.org/src" });

            process.env.GIT_COMMIT = "not a commit; rm -rf";
            assert.notEqual(GetServerIdentity().commit, process.env.GIT_COMMIT);
        }
        finally{
            for(const Key of ["SERVER_NAME", "SERVER_VERSION", "GIT_COMMIT", "SOURCE_URL"]){
                if(Saved[Key] === undefined){ delete process.env[Key]; } else { process.env[Key] = Saved[Key]; }
            }
        }
    });
});

describe("ServerStatus", () => {
    before(async () => {
        Account("UID-status-alpha", "Alpha");
        Account("UID-status-bravo", "bravo");
        Account("UID-status-charlie", "Charlie");
        Account("UID-status-delta", "Delta");
        Account("UID-status-echo", "Echo");

        Fake = await StartFakeDeployServer(FAKE_DEPLOYSERVER_PORT, ThreeServers("UID-status-bravo"));

        // Charlie is sent to the tutorial server (8775) by matchmaking, as the client asks for it
        Fake.MatchmakingPort = 8775;
        assert.equal(await HandlePlayerMatchmaking("ISLAND", TUTORIAL_GAME_ARGS, undefined as any, "UID-status-charlie"), true);

        await UpdatePlayerActivity("UID-status-alpha", "/Game/Maps/ramsgate/ramsgate_01_persistent");
        await UpdatePlayerActivity("UID-status-bravo", "/Game/Maps/islands/1702/cora_jamima", "island");
        await UpdatePlayerActivity("UID-status-charlie", "/Game/Maps/islands/1705/dia_moss_triforce");
        await UpdatePlayerActivity("UID-status-delta", "/Game/Maps/Map_LoginMenu", "menu");
        await UpdatePlayerActivity("UID-status-echo", "/Game/Maps/islands/1803/frida_moss_falls");
        await UpdatePlayerActivity("UID-no-such-account", "/Game/Maps/ramsgate/ramsgate_01_persistent");
        await UpdatePlayerActivity(undefined as any, "/Game/Maps/ramsgate/ramsgate_01_persistent"); // a heartbeat without a player token
        ClearServerStatusCache();
    });

    it("lists who is where and the three servers, with titles and per-server counts", async () => {
        const Status = await BuildServerStatus();

        assert.deepEqual(Object.keys(Status), ["name", "online", "version", "commit", "sourceUrl", "registration", "playersOnline", "players", "instances", "contentPort", "uptimeSeconds"]);
        assert.equal(Status.online, true);
        assert.equal(Status.playersOnline, 5);
        assert.deepEqual(Status.players, [
            { name: "Alpha", where: "city", instance: "5c0a9e36-8a51-4c1b-9d7e-1f2a3b4c5d01" },
            { name: "bravo", where: "hunt", instance: "5c0a9e36-8a51-4c1b-9d7e-1f2a3b4c5d02" },
            { name: "Charlie", where: "tutorial", instance: "5c0a9e36-8a51-4c1b-9d7e-1f2a3b4c5d03" },
            { name: "Delta", where: "menu", instance: null },
            { name: "Echo", where: "hunt", instance: null }
        ]);
        assert.deepEqual(Status.instances, [
            { id: "5c0a9e36-8a51-4c1b-9d7e-1f2a3b4c5d01", kind: "city", title: "Ramsgate", map: "ramsgate_01_persistent", behemoth: null, players: 1, maxPlayers: 32, startedAt: "2026-09-21T10:00:00.000Z" },
            { id: "5c0a9e36-8a51-4c1b-9d7e-1f2a3b4c5d02", kind: "hunt", title: "Hunt: Lesser Embermane", map: "cora_jamima", behemoth: "Lesser Embermane", players: 1, maxPlayers: 4, startedAt: "2026-09-21T11:00:00.000Z" },
            { id: "5c0a9e36-8a51-4c1b-9d7e-1f2a3b4c5d03", kind: "tutorial", title: "Tutorial", map: "dia_moss_triforce", behemoth: "Gnasher", players: 1, maxPlayers: 1, startedAt: "2026-09-21T11:30:00.000Z" }
        ]);

        const Text = JSON.stringify(Status);
        assert.doesNotMatch(Text, /UID-|UUK_|127\.0\.0\.1|eyJ/);
    });

    it("answers from a 5 s cache", async () => {
        ClearServerStatusCache();
        const First = await GetServerStatus();
        const Requests = Fake!.Requests.length;

        await UpdatePlayerActivity("UID-status-alpha", "/Game/Maps/Map_LoginMenu");
        const [Second, Third] = await Promise.all([GetServerStatus(), GetServerStatus()]);

        assert.equal(Second, First);
        assert.equal(Third, First);
        assert.equal(Fake!.Requests.length, Requests, "no deploy-server call while cached");

        ClearServerStatusCache();
        const Fresh = await GetServerStatus();
        assert.equal(Fresh.players.find((Player) => Player.name === "Alpha")?.where, "menu");
    });

    it("drops a heartbeat older than 90 s", async () => {
        const RealNow = Date.now;

        try{
            Date.now = () => RealNow() + 91 * 1000;
            assert.equal(GetOnlinePlayerActivity().length, 0);
        }
        finally{
            Date.now = RealNow;
        }

        assert.ok(GetOnlinePlayerActivity().length >= 5);
    });

    it("still answers, with no servers, when the deploy server is down", async () => {
        await Fake!.Close();
        Fake = undefined;
        ClearServerStatusCache();

        const Status = await GetServerStatus();

        assert.deepEqual(Status.instances, []);
        assert.equal(Status.playersOnline, 5);
        assert.ok(Status.players.every((Player) => Player.instance === null));
    });
});
