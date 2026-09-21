import { spawn } from "node:child_process"
import { setTimeout } from "node:timers/promises";

import crypto from "node:crypto";

import PlayerHuntTable from "../vendor/player_hunts_table.json";
import MatchmakerHuntTable from "../vendor/matchmaker_hunts_table.json";
import TrialsHardHuntTable from "../vendor/trials_hard_table.json";
import TrialsEliteHuntTable from "../vendor/trials_elite_table.json";
import { kill } from "node:process";
import { logger } from "../logger";

const RAMSGATE_MAP_PATH = "/Game/Maps/ramsgate/ramsgate_01_persistent";
const TRAINING_DOJO_MAP_PATH = "/Game/Maps/islands/dojo/training_dojo_persistent";
const TRIALS_MAP_PATH = "/Game/Maps/islands/arenas/arena_ramsgate_00";

export type Gameserver = {
    id: string,
    port: number,
    map: string,
    behemoth: string | undefined,
    matchmakerHuntId: string | undefined,
    expectedPlayers: ExpectedPlayer[] | undefined,
    isRamsgate: boolean,
    isTrainingDojo: boolean,
    processId: number,
    startTime: Date
};

type ExpectedPlayer = {
    playerUid: string,
    playerHuntId: string
};

export let Gameservers: Gameserver[] = [];
let FreePorts: number[] = [];

let RamsgateServer : Gameserver;
let TrainingDojoServer : Gameserver;

const PORT_RANGE_BEGIN = Number(process.env.PORT_RANGE_BEGIN!);
const PORT_RANGE_END = Number(process.env.PORT_RANGE_END!);
const RAMSGATE_PORT = PORT_RANGE_END;
const TRAINING_DOJO_PORT = PORT_RANGE_END - 1;
const GAMESERVER_BINARY_PATH = process.env.GAMESERVER_BINARY_PATH!;
const STANDARD_GAMESERVER_ARGS = ["-EpicPortal", "-server", "-nullrhi"];
const METAGAME_API_KEY = process.env.METAGAME_API_KEY!;
const MY_IP = process.env.MY_IP!;
const SECONDS_TO_WAIT_BETWEEN_GAMESERVER_STARTUP = Number(process.env.SECONDS_TO_WAIT_BETWEEN_GAMESERVER_STARTUP!);

function TransformExpectedPlayerArgs(ExpectedPlayers: ExpectedPlayer[]){
    let ToReturn = "";

    for(const Player of ExpectedPlayers){
        ToReturn = ToReturn + Player.playerUid + ":" + Player.playerHuntId + ",";
    }

    if(ToReturn.length > 0){
        ToReturn = ToReturn.slice(0, -1); // Remove trailing ','
    }

    return ToReturn;
}

export async function CleanupServer(ServerToShutdown: Gameserver){
    Gameservers = Gameservers.filter(Server => Server !== ServerToShutdown);

    if(ServerToShutdown.isRamsgate){
        logger.warn("RAMSGATE HAS FALLEN! Restarting!");

        await StartServer(RAMSGATE_MAP_PATH, undefined, undefined, undefined, true, false);
    }
    else if(ServerToShutdown.isTrainingDojo){
        logger.warn("Training Dojo Crashed! Restarting!");

        await StartServer(TRAINING_DOJO_MAP_PATH, undefined, undefined, undefined, false, true);
    }
    else{
        FreePorts.push(ServerToShutdown.port);
    }
}

let ServerLaunchQueue: Promise<void> = Promise.resolve();

async function StartServer(Map: string, Behemoth: string | undefined, MatchmakerHuntId: string | undefined, ExpectedPlayers: ExpectedPlayer[] | undefined, IsRamsgate: boolean, IsTrainingDojo: boolean){
    const LaunchProc = ServerLaunchQueue;

    ServerLaunchQueue = ServerLaunchQueue.catch(() => {}).then(async () => await setTimeout(SECONDS_TO_WAIT_BETWEEN_GAMESERVER_STARTUP * 1000));

    await LaunchProc;
    
    let Port;

    if(IsRamsgate){
        Port = RAMSGATE_PORT;
    }
    else if(IsTrainingDojo){
        Port = TRAINING_DOJO_PORT;
    }
    else{
        Port = FreePorts.pop();
    }

    const Id = crypto.randomUUID();

    if(Port == undefined){
        throw new Error("No free ports left!");
    }

    const Child = spawn(GAMESERVER_BINARY_PATH, [
        METAGAME_API_KEY,
        Port.toString(),
        Map,
        Behemoth != undefined ? Behemoth : "NO_BEHEMOTH",
        MatchmakerHuntId != undefined ? MatchmakerHuntId : "NO_MM_HUNTID",
        ExpectedPlayers != undefined ? TransformExpectedPlayerArgs(ExpectedPlayers) : "NO_EXPECTED_PLAYERS",
        MY_IP + ":" + Port.toString(),
        ...STANDARD_GAMESERVER_ARGS
    ]);

    Child.unref();

    const NewGameserver: Gameserver = {
        id: Id,
        port: Port,
        map: Map,
        behemoth: Behemoth,
        matchmakerHuntId: MatchmakerHuntId,
        expectedPlayers: ExpectedPlayers,
        isRamsgate: IsRamsgate,
        isTrainingDojo: IsTrainingDojo,
        processId: Child.pid!,
        startTime: new Date()
    };

    Gameservers.push(NewGameserver);

    return NewGameserver;
}

export function GetRamsgateConnectionDetails(){
    return {
        host: MY_IP,
        port: RamsgateServer.port
    };
}

// The Dojo is started on demand the first time someone is matchmade into it,
// rather than at boot. It is a full game process that most sessions never
// visit, and on a single home PC that memory matters. Concurrent first
// requests share one launch instead of racing to start two.
let TrainingDojoStarting: Promise<Gameserver> | undefined;

export async function GetTrainingDojoConnectionDetails(){
    if (TrainingDojoServer == undefined) {
        if (TrainingDojoStarting == undefined) {
            logger.info("Starting the Training Dojo on demand");
            TrainingDojoStarting = StartServer(TRAINING_DOJO_MAP_PATH, undefined, undefined, undefined, false, true)
                .finally(() => { TrainingDojoStarting = undefined; });
        }
        TrainingDojoServer = await TrainingDojoStarting;
    }

    return {
        host: MY_IP,
        port: TrainingDojoServer.port
    };
}

export async function StartupGameserverWithArgs(GameArgs: string){
    const Map = GameArgs.split("?")[0];
    const Behemoth = GameArgs.split("?")[2].split("=")[1];

    const GameServerToReturn = await StartServer(Map, Behemoth, undefined, undefined, false, false);

    return {
        host: MY_IP,
        port: GameServerToReturn.port
    };
}

function GetMatchmakerHuntIdFromPlayerHuntId(PlayerHuntId: string){
    const MatchmakerHuntIDs = (PlayerHuntTable[0].Rows as any)[PlayerHuntId].MatchmakerHuntIDs;

    let MatchmakerHuntObject;

    if(MatchmakerHuntIDs.length !== 0){
        MatchmakerHuntObject = MatchmakerHuntIDs[crypto.randomInt(0, MatchmakerHuntIDs.length)];
    }

    return MatchmakerHuntObject?.RowName;
}

function GetBehemothPathFromMatchmakerHuntId(MatchmakerHuntId: string): string{
    const MatchmakerHuntObject = (MatchmakerHuntTable[0].Rows as any)[MatchmakerHuntId];

    return MatchmakerHuntObject.SpecificBehemoth.BehemothAsset.AssetPathName;
}

function GetMapPathFromMatchmakerHuntId(MatchmakerHuntId: string): string{
    const MatchmakerHuntObject = (MatchmakerHuntTable[0].Rows as any)[MatchmakerHuntId];

    const MapList = MatchmakerHuntObject.MapList;

    return MapList[crypto.randomInt(0, MapList.length)].MapAssetName.split(".")[0];
}

function GetGameModeOverrideFromMatchmakerHuntId(MatchmakerHuntId: string): string{
    const MatchmakerHuntObject = (MatchmakerHuntTable[0].Rows as any)[MatchmakerHuntId];

    return MatchmakerHuntObject.GameModeOverride.replaceAll("Archon/Content", "/Game");
}

type TrialsData = {
    Behemoth: string;
    TrialsHuntId: string;
}

function RandomlyGenTrialsData(IsElite: boolean): TrialsData{
    const RandomTrialNum = String(crypto.randomInt(1, 89)).padStart(3, "0");

    const Difficulty = IsElite ? "Elite" : "Hard";

    const TrialsHuntId = `Arena_MatchmakerHunt_${Difficulty}_${RandomTrialNum}`;

    const Row = IsElite ? (TrialsEliteHuntTable[0].Rows as any)[TrialsHuntId] : (TrialsHardHuntTable[0].Rows as any)[TrialsHuntId];

    const Behemoth = Row.SpecificBehemoth.BehemothAsset.AssetPathName;

    return {
        Behemoth: Behemoth,
        TrialsHuntId: TrialsHuntId
    };
}

export async function StartupGameserverWithHuntIdAndPlayers(HuntId: string, ExpectedPlayers: string[]){
    const TrialsData = HuntId.includes("Arena") ? RandomlyGenTrialsData(HuntId.includes("Elite")) : undefined;
    const MatchmakerHuntId = TrialsData == undefined ? GetMatchmakerHuntIdFromPlayerHuntId(HuntId) : TrialsData.TrialsHuntId;
    let BehemothPath = TrialsData == undefined ? GetBehemothPathFromMatchmakerHuntId(MatchmakerHuntId!) : TrialsData.Behemoth;
    let MapPath = TrialsData == undefined ? GetMapPathFromMatchmakerHuntId(MatchmakerHuntId!) : TRIALS_MAP_PATH;

    if(MatchmakerHuntId != undefined && !MatchmakerHuntId.includes("Arena")){
        const OverrideGameMode = GetGameModeOverrideFromMatchmakerHuntId(MatchmakerHuntId);

        if(OverrideGameMode != undefined && OverrideGameMode.includes("_C")){
            logger.info(`Overriding gamemode to ${OverrideGameMode}`);
            MapPath = `${MapPath}?game=${OverrideGameMode}`;
        }
    }

    const GameServerToReturn = await StartServer(MapPath, BehemothPath, MatchmakerHuntId, ExpectedPlayers.map((PlayerId) => {
        return {
            playerUid: PlayerId,
            playerHuntId: HuntId
        };
    }), false, false);

    return {
        host: MY_IP,
        port: GameServerToReturn.port
    }
}

// ---- GET /gameservers: what runs now, for the metagame's /undaunted/api/ServerStatus ----

export type GameserverKind = "city" | "hunt" | "dojo" | "tutorial";

// The tutorial is started from the client's own game args: the tutorial Gnasher on
// dia_moss_triforce (regular hunts use dia_moss_triforce_2, hence the exact match)
const TUTORIAL_MAP = /\/dia_moss_triforce(?:$|[.?])/i;
const TRAINING_DOJO_MATCHMAKER_HUNT_ID = "CR19_MatchmakerHunt_ShatteredIsles_TrainingDojo";

export function KindOfGameserver(Server: Gameserver): GameserverKind {
    if(Server.isRamsgate){
        return "city";
    }

    if(Server.isTrainingDojo){
        return "dojo";
    }

    if(/_tutorial_bp/i.test(Server.behemoth ?? "") || TUTORIAL_MAP.test(Server.map)){
        return "tutorial";
    }

    return "hunt";
}

function MaxPlayersFromTables(MatchmakerHuntId: string){
    const Row = (MatchmakerHuntTable[0].Rows as any)[MatchmakerHuntId]
        ?? (TrialsHardHuntTable[0].Rows as any)[MatchmakerHuntId]
        ?? (TrialsEliteHuntTable[0].Rows as any)[MatchmakerHuntId];

    return Number.isInteger(Row?.MaxPlayers) ? Row.MaxPlayers as number : null;
}

// null where the tables don't say (Ramsgate): the metagame fills in its default
function MaxPlayersOf(Server: Gameserver, Kind: GameserverKind): number | null {
    switch(Kind){
        case "tutorial":
            return 1;
        case "dojo":
            return MaxPlayersFromTables(TRAINING_DOJO_MATCHMAKER_HUNT_ID);
        case "hunt":
            return Server.matchmakerHuntId != undefined ? MaxPlayersFromTables(Server.matchmakerHuntId) : null;
        default:
            return null;
    }
}

export function IsProcessAlive(ProcessId: number){
    try{
        kill(ProcessId, 0);

        return true;
    } catch {
        return false;
    }
}

// Servers whose process has exited are left out at once (the watchdog frees them within a minute)
export function DescribeGameservers(Servers: Gameserver[] = Gameservers, IsAlive: (ProcessId: number) => boolean = IsProcessAlive){
    return Servers.filter((Server) => IsAlive(Server.processId)).map((Server) => {
        const Kind = KindOfGameserver(Server);
        const [MapPath, ...Options] = Server.map.split("?");
        const GameMode = Options.find((Option) => Option.startsWith("game="))?.slice("game=".length);

        return {
            id: Server.id,
            port: Server.port,
            kind: Kind,
            map: MapPath,
            gameMode: GameMode != undefined && GameMode.length > 0 ? GameMode : null,
            behemoth: Server.behemoth != undefined && Server.behemoth.length > 0 && Server.behemoth !== "NO_BEHEMOTH" ? Server.behemoth : null,
            huntId: Server.expectedPlayers?.[0]?.playerHuntId ?? null,
            matchmakerHuntId: Server.matchmakerHuntId ?? null,
            expectedPlayers: (Server.expectedPlayers ?? []).map((Player) => Player.playerUid),
            maxPlayers: MaxPlayersOf(Server, Kind),
            startedAt: Server.startTime.toISOString()
        };
    });
}

export async function Startup(){
    for(let i = PORT_RANGE_BEGIN; i <= PORT_RANGE_END - 2; i++){
        FreePorts.push(i);
    }

    RamsgateServer = await StartServer(RAMSGATE_MAP_PATH, undefined, undefined, undefined, true, false);

    // Upstream always started the Dojo here. Opt back in with ENABLE_DOJO=1 on
    // a machine with RAM to spare; otherwise it starts on first use.
    if (process.env.ENABLE_DOJO === "1") {
        TrainingDojoServer = await StartServer(TRAINING_DOJO_MAP_PATH, undefined, undefined, undefined, false, true);
    }
}