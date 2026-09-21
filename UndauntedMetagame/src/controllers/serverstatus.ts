import fs from "node:fs";
import path from "node:path";
import { inArray } from "drizzle-orm";
import HuntTitles from "../vendor/hunt_titles.json";
import { GetDb } from "../db";
import { users } from "../db/schema";
import { logger } from "../logger";
import { GetOnlinePlayerActivity, IsRegistrationMode, REGISTRATION_MODE } from "./undauntedapi";
import { GetLastMatchmakingResult } from "./matchmaking";

// GET /undaunted/api/ServerStatus: who is online and which game servers run, for the
// friend launcher. No auth, so nothing in it may identify an account beyond its
// username: no account ids, keys, tokens or addresses.
//
// Accuracy (best effort):
// - "Online" is a client heartbeat in the last 90 s, so a player who quits stays
//   listed for up to 90 s, and one whose client sends no heartbeat is not listed.
// - "where" comes from the heartbeat's map (and its state, when it sends one).
// - A player in a hunt is tied to a hunt server by the deploy server's expected-player
//   list, else by the game server matchmaking last sent them to (in memory: lost when
//   the metagame restarts). Everyone in Ramsgate or the Dojo counts for the one server
//   of that kind. So per-server counts are heartbeat counts, not the servers' own.

export type InstanceKind = "city" | "hunt" | "dojo" | "tutorial";
export type Where = "menu" | "city" | "hunt" | "dojo" | "tutorial" | "unknown";

// One entry of the deploy server's GET /gameservers (UndauntedDeployServer/src/controllers/gameservers.ts)
export type DeployGameserver = {
    id: string,
    port: number,
    kind: InstanceKind,
    map: string,
    gameMode: string | null,
    behemoth: string | null,
    huntId: string | null,
    matchmakerHuntId: string | null,
    expectedPlayers: string[],
    maxPlayers: number | null,
    startedAt: string
};

export type StatusInstance = {
    id: string,
    kind: InstanceKind,
    title: string,
    map: string,
    behemoth: string | null,
    players: number,
    maxPlayers: number,
    startedAt: string
};

export type StatusPlayer = {
    name: string,
    where: Where,
    instance: string | null
};

export type ServerStatus = {
    name: string,
    online: true,
    version: string,
    commit: string,
    sourceUrl: string,
    registration: "OPEN" | "INVITECODE" | "NONE",
    playersOnline: number,
    players: StatusPlayer[],
    instances: StatusInstance[],
    contentPort: number | null,
    uptimeSeconds: number
};

const DEFAULT_SERVER_NAME = "Dauntless Revived";
const DEFAULT_SOURCE_URL = "https://github.com/mixutin/dauntless-revived";
const CACHE_MS = 5000;
const DEPLOYSERVER_TIMEOUT_MS = 2000;

// The cooked 1.4.4 config sets [/Script/Engine.GameSession] MaxPlayers=32; the deploy
// server reports the hunt tables' own limits for everything else.
const DEFAULT_MAX_PLAYERS: Record<InstanceKind, number> = { city: 32, dojo: 12, tutorial: 1, hunt: 4 };

const FIXED_TITLES: Partial<Record<InstanceKind, string>> = { city: "Ramsgate", dojo: "Training Dojo", tutorial: "Tutorial" };

// ---- Identity: name, version, commit, source (roadmap 1.13, the AGPL source link) ----

type BuildInfo = { commit?: unknown, version?: unknown };
let BuildInfoCache: BuildInfo | undefined;

// dist/build-info.json, written by `npm run build` (scripts/write-build-info.js)
function ReadBuildInfo(): BuildInfo {
    if(BuildInfoCache == undefined){
        try{
            BuildInfoCache = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "build-info.json"), "utf8"));
        }
        catch{
            BuildInfoCache = {};
        }
    }

    return BuildInfoCache!;
}

function ReadPackageVersion(){
    try{
        const Version = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8")).version;
        return typeof Version === "string" ? Version : undefined;
    }
    catch{
        return undefined;
    }
}

// Printable and short; anything else is treated as unset
function CleanText(Value: unknown, Max: number){
    if(typeof Value !== "string"){
        return undefined;
    }

    const Text = Value.replace(/[^\x20-\x7E]/g, "").trim().slice(0, Max);

    return Text.length > 0 ? Text : undefined;
}

function CleanCommit(Value: unknown){
    const Text = CleanText(Value, 64);

    return Text != undefined && /^[0-9A-Za-z._+-]+$/.test(Text) ? Text : undefined;
}

export function GetServerIdentity(){
    const Build = ReadBuildInfo();

    return {
        name: CleanText(process.env.SERVER_NAME, 64) ?? DEFAULT_SERVER_NAME,
        version: CleanText(process.env.SERVER_VERSION, 32) ?? CleanText(Build.version, 32) ?? ReadPackageVersion() ?? "unknown",
        commit: CleanCommit(process.env.GIT_COMMIT) ?? CleanCommit(Build.commit) ?? "unknown",
        sourceUrl: CleanText(process.env.SOURCE_URL, 256) ?? DEFAULT_SOURCE_URL
    };
}

function ContentPort(){
    const Value = process.env.CONTENT_PORT;

    if(Value == undefined || !/^\d{1,5}$/.test(Value.trim())){
        return null;
    }

    const Port = Number(Value.trim());

    return Port >= 1 && Port <= 65535 ? Port : null;
}

// ---- The deploy server's game servers ----

let DeployServerReachable: boolean | undefined;

function NoteDeployServer(Reachable: boolean, Why?: string){
    if(DeployServerReachable !== Reachable){
        if(Reachable){
            logger.info("ServerStatus: the deploy server's /gameservers answers");
        }
        else{
            logger.warn(`ServerStatus: no game server list from the deploy server (${Why}); showing none`);
        }
    }

    DeployServerReachable = Reachable;
}

const KINDS: InstanceKind[] = ["city", "hunt", "dojo", "tutorial"];

function IsDeployGameserver(Value: any): Value is DeployGameserver {
    return Value != null && typeof Value === "object"
        && typeof Value.id === "string" && Number.isInteger(Value.port) && KINDS.includes(Value.kind)
        && typeof Value.map === "string" && typeof Value.startedAt === "string"
        && (Value.behemoth === null || typeof Value.behemoth === "string")
        && (Value.huntId === null || typeof Value.huntId === "string")
        && (Value.matchmakerHuntId === null || typeof Value.matchmakerHuntId === "string")
        && (Value.maxPlayers === null || Number.isInteger(Value.maxPlayers))
        && Array.isArray(Value.expectedPlayers);
}

// DEPLOYSERVER_URL is host:port, as matchmaking uses it
export async function FetchGameservers(): Promise<DeployGameserver[]> {
    const DeployServer = process.env.DEPLOYSERVER_URL;

    if(DeployServer == undefined || DeployServer.length === 0){
        NoteDeployServer(false, "DEPLOYSERVER_URL is not set");
        return [];
    }

    try{
        const Reply = await fetch(`http://${DeployServer}/gameservers`, { signal: AbortSignal.timeout(DEPLOYSERVER_TIMEOUT_MS) });

        if(Reply.status !== 200){
            NoteDeployServer(false, `status ${Reply.status}`);
            return [];
        }

        const Body: any = await Reply.json();

        if(!Array.isArray(Body?.servers)){
            NoteDeployServer(false, "unexpected reply");
            return [];
        }

        NoteDeployServer(true);

        return Body.servers.filter(IsDeployGameserver);
    }
    catch(error){
        NoteDeployServer(false, (error as Error).message);
        return [];
    }
}

// ---- Names ----

type TitleTable = { playerHunts: Record<string, string>, matchmakerHunts: Record<string, string>, behemoths: Record<string, string> };
const Titles = HuntTitles as unknown as TitleTable;

function Lookup(Table: Record<string, string>, Key: string | null | undefined){
    return Key != undefined && Object.prototype.hasOwnProperty.call(Table, Key) ? Table[Key] : undefined;
}

// "/Game/Monsters/lerawr/lerawr_beta_bp.lerawr_beta_bp_C" -> "lerawr_beta_bp"
function BlueprintOf(AssetPath: string | null){
    if(AssetPath == undefined || AssetPath.length === 0){
        return undefined;
    }

    const Name = AssetPath.split("?")[0].split("/").pop()!.split(".")[0].toLowerCase();

    return Name.length > 0 ? Name : undefined;
}

// "/Game/Maps/islands/1702/cora_jamima?game=..." -> "cora_jamima"
export function MapCodename(MapPath: string){
    return MapPath.split("?")[0].split("/").pop()!.split(".")[0];
}

// Display name where the hunt tables know it, else the codename ("fulgar_umbral")
export function BehemothName(Server: Pick<DeployGameserver, "behemoth" | "matchmakerHuntId">){
    const Blueprint = BlueprintOf(Server.behemoth);

    return Lookup(Titles.matchmakerHunts, Server.matchmakerHuntId)
        ?? Lookup(Titles.behemoths, Blueprint)
        ?? (Blueprint != undefined ? Blueprint.replace(/_bp$/, "") : null);
}

export function InstanceTitle(Server: Pick<DeployGameserver, "kind" | "map" | "huntId">, Behemoth: string | null){
    const Fixed = FIXED_TITLES[Server.kind];

    if(Fixed != undefined){
        return Fixed;
    }

    return `Hunt: ${Behemoth ?? Lookup(Titles.playerHunts, Server.huntId) ?? MapCodename(Server.map)}`;
}

// ---- Where a player is ----

const TUTORIAL_MAP = /\/dia_moss_triforce(?:$|[.?])|(?:^|\/)tutorial/i;

// From the heartbeat's map (a package path or a bare map name) and, if sent, its state
export function ClassifyPlace(Map: unknown, State: string | undefined): Where {
    const Place = typeof Map === "string" ? Map.trim().toLowerCase() : "";

    if(Place.length > 0){
        if(/login|frontend|mainmenu/.test(Place)) return "menu";
        if(Place.includes("dojo")) return "dojo";
        if(TUTORIAL_MAP.test(Place)) return "tutorial";
        if(Place.includes("/islands/") || Place.includes("arena_")) return "hunt";
        if(Place.includes("ramsgate")) return "city";
        if(/transition|entry|loading/.test(Place)) return "unknown";
    }

    switch(typeof State === "string" ? State.toLowerCase() : ""){
        case "menu":
        case "lobby":
            return "menu";
        case "city":
            return "city";
        case "island":
            return "hunt";
    }

    // Every other map in the game is a hunt island
    return Place.length > 0 ? "hunt" : "unknown";
}

// ---- The status ----

function Registration(): ServerStatus["registration"] {
    return IsRegistrationMode(REGISTRATION_MODE) ? REGISTRATION_MODE : "NONE";
}

function Usernames(UserIds: string[]){
    const Names = new Map<string, string>();

    if(UserIds.length === 0){
        return Names;
    }

    for(const Row of GetDb().select({ userId: users.userId, name: users.name }).from(users).where(inArray(users.userId, UserIds)).all()){
        Names.set(Row.userId, Row.name);
    }

    return Names;
}

export async function BuildServerStatus(): Promise<ServerStatus> {
    const Servers = (await FetchGameservers()).slice().sort((A, B) =>
        KINDS.indexOf(A.kind) - KINDS.indexOf(B.kind) || A.startedAt.localeCompare(B.startedAt) || A.port - B.port);

    // The newest server wins when a port was reused
    const Newest = Servers.slice().sort((A, B) => B.startedAt.localeCompare(A.startedAt));
    const Counts = new Map<string, number>();

    const Activity = GetOnlinePlayerActivity();
    const Names = Usernames(Activity.map((Entry) => Entry.UserId));
    const Players: StatusPlayer[] = [];

    for(const Entry of Activity){
        const Name = Names.get(Entry.UserId);

        if(Name == undefined){
            continue; // an account that no longer exists
        }

        let Place = ClassifyPlace(Entry.Map, Entry.State);
        let Instance: DeployGameserver | undefined;

        if(Place === "city" || Place === "dojo"){
            Instance = Newest.find((Server) => Server.kind === Place);
        }
        else if(Place === "hunt" || Place === "tutorial"){
            const Session = Newest.filter((Server) => Server.kind === "hunt" || Server.kind === "tutorial");
            const LastSent = GetLastMatchmakingResult(Entry.UserId);

            Instance = Session.find((Server) => Server.expectedPlayers.includes(Entry.UserId))
                ?? (LastSent?.Ready ? Session.find((Server) => Server.port === LastSent.Port) : undefined);

            if(Instance != undefined){
                Place = Instance.kind;
            }
        }

        if(Instance != undefined){
            Counts.set(Instance.id, (Counts.get(Instance.id) ?? 0) + 1);
        }

        Players.push({ name: Name, where: Place, instance: Instance?.id ?? null });
    }

    Players.sort((A, B) => A.name.toLowerCase().localeCompare(B.name.toLowerCase()) || A.name.localeCompare(B.name));

    const Instances: StatusInstance[] = Servers.map((Server) => {
        const Behemoth = Server.kind === "city" || Server.kind === "dojo" ? null : BehemothName(Server);

        return {
            id: Server.id,
            kind: Server.kind,
            title: InstanceTitle(Server, Behemoth),
            map: MapCodename(Server.map),
            behemoth: Behemoth,
            players: Counts.get(Server.id) ?? 0,
            maxPlayers: Server.maxPlayers ?? DEFAULT_MAX_PLAYERS[Server.kind],
            startedAt: Server.startedAt
        };
    });

    const Identity = GetServerIdentity();

    return {
        name: Identity.name,
        online: true,
        version: Identity.version,
        commit: Identity.commit,
        sourceUrl: Identity.sourceUrl,
        registration: Registration(),
        playersOnline: Players.length,
        players: Players,
        instances: Instances,
        contentPort: ContentPort(),
        uptimeSeconds: Math.floor(process.uptime())
    };
}

// Answers from a 5 s cache; callers polling at once share one build
let Cached: { At: number, Status: ServerStatus } | undefined;
let Building: Promise<ServerStatus> | undefined;

export async function GetServerStatus(): Promise<ServerStatus> {
    if(Cached != undefined && Date.now() - Cached.At < CACHE_MS){
        return Cached.Status;
    }

    if(Building == undefined){
        Building = BuildServerStatus()
            .then((Status) => {
                Cached = { At: Date.now(), Status: Status };
                return Status;
            })
            .finally(() => {
                Building = undefined;
            });
    }

    return Building;
}

export function ClearServerStatusCache(){
    Cached = undefined;
}
