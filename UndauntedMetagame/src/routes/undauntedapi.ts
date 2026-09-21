import { Router } from "express";
import { DeleteInviteCode, GetAllUserIds, GetInviteCodes, GetRecentPlayerData, IsRegistrationMode, RegisterInviteCode, RegisterUser, REGISTRATION_MODE, SetRegistrationMode, ValidateAndConsumeInviteCode } from "../controllers/undauntedapi";
import { HasUndauntedUserApiKey } from "../middleware/HasUndauntedUserApiKey";
import { HasUndauntedAdminApiKey } from "../middleware/HasUndauntedAdminApiKey";
import { SignMetagameJWTForUid } from "../controllers/auth";
import { GetCharacterIdsForUserId, GetSaveHistory, RollbackCharacter, RollbackError, RollbackLoadout } from "../controllers/savehistory";
import { GetObjectiveRecords, GetSelectedHuntPass, GetTrackRecords, SeedProgression } from "../controllers/realprogression";
import { IsRealProgressionAccount } from "../controllers/progressionmode";
import { ComputeEarnedRanks, GetProgressionPath, PremiumGatingEntitlement } from "../controllers/progressionrank";
import { GrantEntitlementInTx, ListEntitlements, RevokeEntitlementInTx } from "../controllers/entitlements";
import { DoesAccountExist, RecordProgressionEvent } from "../controllers/progressionevents";
import { GetDb } from "../db";

export const undauntedApiRouter = Router();

function StatusForRollbackError(Error: RollbackError){
    switch(Error){
        case "not_found":
        case "version_not_found":
            return 404;
        case "conflict":
            return 409;
        case "db_error":
            return 500;
    }
}

undauntedApiRouter.get("/RegistrationStatus", (req, res) => {
    res.status(200);
    res.json({
        RegistrationMode: REGISTRATION_MODE
    });
});

undauntedApiRouter.post("/RegistrationStatus", HasUndauntedAdminApiKey, (req, res) => {
    const NewRegistrationStatus = req.body.RegistrationStatus;

    if(!SetRegistrationMode(NewRegistrationStatus)){
        res.status(400);
        res.send();
        return;
    }

    res.status(200);
    res.send();
});

undauntedApiRouter.get("/InviteCodes", HasUndauntedAdminApiKey, async (req, res) => {
    const InviteCodes = await GetInviteCodes();

    res.status(200);
    res.json({
        InviteCodes: InviteCodes
    });
});

undauntedApiRouter.post("/GenerateJWTForUserId", HasUndauntedAdminApiKey, async (req, res) => {
    const UserId = req.body.UserId;

    const JWT = await SignMetagameJWTForUid(UserId);

    res.status(200);
    res.send({
        JWT: JWT
    });
});

undauntedApiRouter.get("/GetAllUsers", HasUndauntedAdminApiKey, async (req, res) => {
    const AllUsers = await GetAllUserIds();

    res.status(200);
    res.send({
        Users: AllUsers
    });
})

undauntedApiRouter.post("/RegisterInviteCode", HasUndauntedAdminApiKey, async (req, res) => {    
    const NewInviteCode = req.body.NewInviteCode;
    const Uses = req.body.Uses;
    const InfiniteUses = !!req.body.InfiniteUses;

    if(!await RegisterInviteCode(NewInviteCode, Uses, InfiniteUses)){
        res.status(400);
        res.send();
        return;
    }

    res.status(200);
    res.send();
});

undauntedApiRouter.delete("/InviteCode/:inviteCodeToDelete", HasUndauntedAdminApiKey, async (req, res) => {
    const InviteCodeToDelete = req.params.inviteCodeToDelete as string;

    await DeleteInviteCode(InviteCodeToDelete);

    res.status(200);
    res.send();
});

undauntedApiRouter.post("/Register", async (req, res) => {
    if(!IsRegistrationMode(REGISTRATION_MODE)){
        res.status(500);
        res.send();
        return;
    }

    if(REGISTRATION_MODE === "NONE"){
        res.status(400);
        res.send();
        return;
    }

    const Username = req.body.Username;
    if(typeof Username !== "string" || Username.trim().length === 0){
        res.status(400);
        res.send();
        return;
    }

    if(REGISTRATION_MODE === "INVITECODE"){
        const InviteCode = req.body.InviteCode;

        if(await ValidateAndConsumeInviteCode(InviteCode)){
            const UUK = await RegisterUser(Username);

            res.status(200);
            res.json({
                UUK: UUK
            });
        }
        else{
            res.status(401);
            res.send();
        }
    }
    else if(REGISTRATION_MODE === "OPEN"){
        const UUK = await RegisterUser(Username);

        res.status(200);
        res.json({
            UUK: UUK
        });
    }
});

undauntedApiRouter.get("/GetUserInfo", HasUndauntedUserApiKey, async (req: any, res) => {
    res.status(200);
    res.json(req.UndauntedUserInfo);
});


undauntedApiRouter.get("/PrivateOnlineStats", HasUndauntedAdminApiKey, async (req, res) => {
    const PlayerData = await GetRecentPlayerData();

    res.status(200);
    res.json(PlayerData);
});

undauntedApiRouter.get("/PublicOnlineStats", HasUndauntedUserApiKey, async (req, res) => {
    const PlayerData = await GetRecentPlayerData();

    res.status(200);
    res.json({
        NumActivePlayers: PlayerData.length
    });
});

// Saved versions of a player's character data and loadouts (no blobs). ?UserId= or ?CharacterId=
// Kept: the newest SAVE_HISTORY_KEEP (100, ~50 min of play), then the last of each hour
// for SAVE_HISTORY_HOURLY hours (48) and of each day for SAVE_HISTORY_DAILY days (30).
undauntedApiRouter.get("/SaveHistory", HasUndauntedAdminApiKey, async (req, res) => {
    const UserId = req.query.UserId;
    const CharacterId = req.query.CharacterId;

    let CharacterIds: string[];
    if(typeof CharacterId === "string" && CharacterId.length > 0){
        CharacterIds = [CharacterId];
    }
    else if(typeof UserId === "string" && UserId.length > 0){
        CharacterIds = await GetCharacterIdsForUserId(UserId);
    }
    else{
        res.status(400);
        res.send();
        return;
    }

    const Characters = await GetSaveHistory(CharacterIds);

    if(Characters.length === 0){
        res.status(404);
        res.send();
        return;
    }

    res.status(200);
    res.json({
        Characters: Characters
    });
});

// Roll a character's data back to a version listed by /SaveHistory. The player should be offline.
undauntedApiRouter.post("/RollbackCharacter", HasUndauntedAdminApiKey, async (req: any, res) => {
    const CharacterId = req.body.CharacterId;
    const Version = req.body.Version;

    if(typeof CharacterId !== "string" || !Number.isSafeInteger(Version)){
        res.status(400);
        res.send();
        return;
    }

    const Result = RollbackCharacter(CharacterId, Version, req.UndauntedUserInfo.UserId);

    if(!Result.success){
        res.status(StatusForRollbackError(Result.error));
        res.send();
        return;
    }

    res.status(200);
    res.json(Result.data);
});

// Same for loadouts; Version is a loadout version from /SaveHistory
undauntedApiRouter.post("/RollbackLoadout", HasUndauntedAdminApiKey, async (req: any, res) => {
    const CharacterId = req.body.CharacterId;
    const Version = req.body.Version;

    if(typeof CharacterId !== "string" || !Number.isSafeInteger(Version)){
        res.status(400);
        res.send();
        return;
    }

    const Result = RollbackLoadout(CharacterId, Version, req.UndauntedUserInfo.UserId);

    if(!Result.success){
        res.status(StatusForRollbackError(Result.error));
        res.send();
        return;
    }

    res.status(200);
    res.json(Result.data);
});


// Real progression of one account: tracks with the ranks the client will compute,
// objectives, Hunt Pass and entitlements. ?UserId=
undauntedApiRouter.get("/Progression", HasUndauntedAdminApiKey, async (req, res) => {
    const UserId = req.query.UserId;

    if(typeof UserId !== "string" || UserId.length === 0){
        res.status(400);
        res.send();
        return;
    }

    if(!GetDb().transaction((tx) => DoesAccountExist(tx, UserId))){
        res.status(404);
        res.send();
        return;
    }

    const Entitlements = ListEntitlements(UserId);

    res.status(200);
    res.json({
        UserId: UserId,
        RealMode: IsRealProgressionAccount(UserId),
        HuntPass: GetSelectedHuntPass(UserId),
        Tracks: GetTrackRecords(UserId).map((Track) => {
            const Path = GetProgressionPath(Track.progression_id);
            const Gate = PremiumGatingEntitlement(Path);
            const HasPremium = Gate !== "" && Entitlements.some((Entitlement) => Entitlement.name === Gate);

            return {
                ...Track,
                earned_free_rank: Path == undefined ? null : ComputeEarnedRanks(Path, Track.progress, false).EarnedFreeRank,
                earned_premium_rank: Path == undefined ? null : ComputeEarnedRanks(Path, Track.progress, HasPremium).EarnedPremiumRank
            };
        }),
        Objectives: GetObjectiveRecords(UserId),
        Entitlements: Entitlements
    });
});

// Roadmap 2.13, per account: {UserId, Mode: "grandfather" | "fresh"}. grandfather puts
// every track at its max rank, fully confirmed (looks like the stub, grants nothing);
// fresh puts every track at 0 and clears the objectives. The account only reads
// these rows once it is in real mode (PROGRESSION_REAL_ACCOUNTS or PROGRESSION_MODE=real).
// Do it while the player is offline.
undauntedApiRouter.post("/SeedProgression", HasUndauntedAdminApiKey, async (req: any, res) => {
    const UserId = req.body?.UserId;
    const Mode = req.body?.Mode;

    if(typeof UserId !== "string" || (Mode !== "grandfather" && Mode !== "fresh")){
        res.status(400);
        res.send();
        return;
    }

    const Result = SeedProgression(UserId, Mode, req.UndauntedUserInfo.UserId);

    res.status(Result.Status);

    if(Result.Body === undefined){
        res.send();
        return;
    }

    res.json({
        UserId: UserId,
        Mode: Mode,
        RealMode: IsRealProgressionAccount(UserId),
        Tracks: Result.Body
    });
});

// {UserId, Entitlement, Duration (hours, 0 = permanent)}; answers the account's list
undauntedApiRouter.post("/GrantEntitlement", HasUndauntedAdminApiKey, async (req: any, res) => {
    const UserId = req.body?.UserId;
    const Name = req.body?.Entitlement;
    const Duration = req.body?.Duration ?? 0;

    if(typeof UserId !== "string" || typeof Name !== "string" || Name.length === 0 || !Number.isSafeInteger(Duration) || Duration < 0){
        res.status(400);
        res.send();
        return;
    }

    const Result = GetDb().transaction((tx) => {
        if(!DoesAccountExist(tx, UserId)){
            return undefined;
        }

        const List = GrantEntitlementInTx(tx, UserId, Name, Duration, `admin:${req.UndauntedUserInfo.UserId}`);

        RecordProgressionEvent(tx, {AccountId: UserId, Caller: "admin", Route: "admin GrantEntitlement", Body: req.body, Status: 200, Reply: List});

        return List;
    });

    if(Result == undefined){
        res.status(404);
        res.send();
        return;
    }

    res.status(200);
    res.json({
        UserId: UserId,
        Entitlements: Result
    });
});

// {UserId, Entitlement}. A revoked default entitlement stays revoked until granted again.
undauntedApiRouter.post("/RevokeEntitlement", HasUndauntedAdminApiKey, async (req: any, res) => {
    const UserId = req.body?.UserId;
    const Name = req.body?.Entitlement;

    if(typeof UserId !== "string" || typeof Name !== "string" || Name.length === 0){
        res.status(400);
        res.send();
        return;
    }

    const Result = GetDb().transaction((tx) => {
        if(!DoesAccountExist(tx, UserId)){
            return undefined;
        }

        const Revoked = RevokeEntitlementInTx(tx, UserId, Name);

        RecordProgressionEvent(tx, {AccountId: UserId, Caller: "admin", Route: "admin RevokeEntitlement", Body: req.body, Status: 200, Notes: [Revoked ? "revoked" : "not owned"]});

        return Revoked;
    });

    if(Result == undefined){
        res.status(404);
        res.send();
        return;
    }

    res.status(200);
    res.json({
        UserId: UserId,
        Revoked: Result,
        Entitlements: ListEntitlements(UserId)
    });
});
