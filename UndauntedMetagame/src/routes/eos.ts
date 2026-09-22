import { Router } from "express";
import { logger } from "../logger";
import { GetUserIDForAPIKey, SignMetagameJWTForUid } from "../controllers/auth";
import { HasUndauntedMetagameAuth } from "../middleware/HasUndauntedMetagameAuth";
import { DisplayNameForUserId, FindAccountByUsername, FindUsernameForUserId, FindUsernames } from "../controllers/login";
import { SoftMetagameAuth, SoftPlayerOf } from "../middleware/PlayerAuth";

export const eosRouter = Router();

eosRouter.post("/account/api/oauth/token", async (req, res) => {
    if(process.env.AUTH_MODE === "NONE" && process.env.NODE_ENV !== "production"){
        const UserId = req.body.exchange_code;

        logger.info(`Logging in ${UserId}!`);

        const AuthToken = SignMetagameJWTForUid(UserId);

        res.json({
            "access_token": AuthToken,
            "token_type": "bearer",
            "expires_at": "2085-09-09T01:01:01.703Z", // TODO: We sign 24hr JWTs so we're unlikely to hit this, but just in case (tm)
            "features": ["Achievements", "AntiCheat", "Ecom", "Voice"],
            "organization_id": "o-krlzxj88qrtb69fredeuaf887bl5az",
            "product_id": "prod-jackal",
            "sandbox_id": "jackal",
            "deployment_id": "53565ba467df4edbb6f5a3d939a8b4f2",
            "expires_in": 86400,
            "refresh_token": "refresh.token.lol", // TODO: IDK if we need to support this considering our intended flow, but flagged regardless
            "refresh_expires_at": "2085-09-09T01:01:01.703Z",
            "account_id": UserId
        });
    }
    else if(process.env.AUTH_MODE === "APIKEY"){
        const ApiKey = req.body.exchange_code;

        const UserId = await GetUserIDForAPIKey(ApiKey);

        if(UserId != undefined){
            logger.info(`Logging in ${UserId}!`);

            const AuthToken = SignMetagameJWTForUid(UserId);

            res.json({
                "access_token": AuthToken,
                "token_type": "bearer",
                "expires_at": "2085-09-09T01:01:01.703Z", // TODO: We sign 24hr JWTs so we're unlikely to hit this, but just in case (tm)
                "features": ["Achievements", "AntiCheat", "Ecom", "Voice"],
                "organization_id": "o-krlzxj88qrtb69fredeuaf887bl5az",
                "product_id": "prod-jackal",
                "sandbox_id": "jackal",
                "deployment_id": "53565ba467df4edbb6f5a3d939a8b4f2",
                "expires_in": 86400,
                "refresh_token": "refresh.token.lol", // TODO: IDK if we need to support this considering our intended flow, but flagged regardless
                "refresh_expires_at": "2085-09-09T01:01:01.703Z",
                "account_id": UserId
            });
        }
        else{
            logger.error(`Invalid API key auth!`);

            res.status(400);
            res.send();
        }
    }
    else{
        logger.fatal("No login method configured!");
    }
});

eosRouter.get("/account/api/oauth/verify", (req, res) => {
    logger.info("Verifying token");

    // TODO: EOS treats this as a "just checking in" endpoint, so I've gone with a minimal stub. Validate this is correct.

    res.json({
      "active": true,
      "scope": "basic_profile friends_list presence",
      "token_type": "bearer",
      "expires_in": 86400,
      "expires_at": "2085-09-09T01:01:01.703Z",
      "account_id": "9626f441055349ce8cb7d7d5a483eaa2",
      "client_id": "xyza7891lhxMVYGCON7LgnKZZ8HQGD5H",
      "application_id": "fghi4567O03HROxEjwbn7kgXpBhnhWwv"
    });
});

// Epic-style account lookups the client makes for other players (party members, Hunt
// Members, the chat's /invite <name>). With a valid player token they answer
// {id, displayName, externalAuths}; without one they answer what they always did.
function PublicAccount(UserId: string, Username: string){
    return {
        id: UserId,
        displayName: Username,
        externalAuths: {}
    };
}

eosRouter.get("/account/api/public/account/:AccId", SoftMetagameAuth, (req: any, res) => {
    const Caller = SoftPlayerOf(req);
    const Username = Caller !== undefined ? FindUsernameForUserId(req.params.AccId) : undefined;

    if(Caller !== undefined){
        logger.info(`EOS Account Info for ${String(req.params.AccId).slice(0, 64)} by ${Caller}: ${Username !== undefined ? "found" : "unknown"}`);
    }
    else{
        logger.info("EOS Account Info (stubbed)");
    }

    res.json(Username !== undefined ? PublicAccount(req.params.AccId, Username) : {});
});

// Before /:AccId/externalAuths, which a user named "externalAuths" would otherwise hit
eosRouter.get("/account/api/public/account/displayName/:displayName", SoftMetagameAuth, (req: any, res) => {
    const Caller = SoftPlayerOf(req);
    const Account = Caller !== undefined ? FindAccountByUsername(req.params.displayName) : undefined;

    logger.info(`EOS Account by name by ${Caller ?? "<no token>"}: ${Account !== undefined ? Account.UserId : "not found"}`);

    if(Account === undefined){
        res.status(404);
        res.send();
        return;
    }

    res.json(PublicAccount(Account.UserId, Account.Username));
});

eosRouter.get("/account/api/public/account/:AccId/externalAuths", (req, res) => {
    logger.info("External Auths (stubbed)");

    res.json({});
});

// POST /account/mapping is the 1.4.4 client's QueryAccountMappingsEndpoint, which the game calls after
// a friend search ("Add Friends") and right after a party invite arrives. Upstream answered 404, and
// both then went nowhere. It is Phoenix's own client, not Epic's: the exe has "srcAccountType",
// "accountMappings", "accountType", "epic" and "phoenix" next to it, and the live 1.4.4 client sent
// {"srcAccountType": "epic", "ids": ["<account id>"]} (22 September 2026). A first answer in Epic's
// lookup/externalId shape (an object keyed by the asked id) still showed nothing in game.
//
// The reply now satisfies both readings a Phoenix service reply gets: flat, with "accountMappings" at
// the top, and wrapped, {"code", "message", "payload": {"accountMappings"}}. Wrapped or flat depends
// on the host (docs/findings/awakening-2-1-1.md); the 2.1.1 features/platform/win answer is the
// precedent for sending one body that is both. The keyed-by-id object is gone: next to "code",
// "message" and "payload", a reader that walks the top-level keys as ids would take "accountMappings"
// (a list of account objects, the very shape an id's entry had) for an account id, and the client did
// not read that shape anyway. On this server a player's Epic id and Phoenix id are the same UID-...,
// so every mapping is the identity; each entry carries the likely spellings side by side so the client
// finds its keys. Asked ids that are not our accounts are left out, and names only go to a caller with
// a player token, like the other account lookups. The unconfirmed request is still logged by shape
// only (keys and id counts, never values that could be tokens).
const MAX_MAPPING_IDS = 100;

function MappingIds(Body: any): string[] {
    const List = (Value: unknown) => Array.isArray(Value) ? Value : undefined;
    const Raw: unknown[] = Array.isArray(Body) ? Body : List(Body?.ids) ?? List(Body?.externalIds) ?? List(Body?.accountIds) ?? List(Body?.externalAuthIds) ?? [];

    return [...new Set(Raw.filter((Id): Id is string => typeof Id === "string" && Id.length > 0 && Id.length <= 128))].slice(0, MAX_MAPPING_IDS);
}

// The account type the ids are in: srcAccountType as the client sends it, or the older guesses
function MappingSourceType(Body: any): string {
    const Field = [Body?.srcAccountType, Body?.type, Body?.externalAuthType].find((Value) => typeof Value === "string");

    return typeof Field === "string" && /^[A-Za-z0-9_.-]{1,32}$/.test(Field) ? Field : "epic";
}

function AccountMappingEntry(Id: string, Name: string, SourceType: string){
    return {
        accountType: "phoenix",
        accountId: Id,
        id: Id,
        epic: Id,
        phoenix: Id,
        srcAccountType: SourceType,
        srcAccountId: Id,
        srcId: Id,
        dstAccountType: "phoenix",
        dstAccountId: Id,
        displayName: Name
    };
}

function DescribeMappingBody(Body: any): string {
    if(Body === undefined || Body === null){
        return "no body";
    }

    if(Array.isArray(Body)){
        return `array of ${Body.length} (${[...new Set(Body.map((Value: unknown) => typeof Value))].join(",")})`;
    }

    if(typeof Body !== "object"){
        return typeof Body;
    }

    const Keys = Object.keys(Body);

    if(Keys.length === 0){
        return "empty object";
    }

    return Keys.slice(0, 12).map((Key) => {
        const Value = Body[Key];
        const Shape = Array.isArray(Value) ? `[${Value.length}]` : typeof Value === "string" ? (Value.length <= 24 && /^[A-Za-z0-9_.-]*$/.test(Value) ? JSON.stringify(Value) : `string(${Value.length})`) : typeof Value;
        return `${Key.slice(0, 40)}=${Shape}`;
    }).join(" ");
}

eosRouter.post("/account/mapping", SoftMetagameAuth, (req: any, res) => {
    const Caller = SoftPlayerOf(req);
    const Ids = MappingIds(req.body);
    const SourceType = MappingSourceType(req.body);
    const Names = Caller !== undefined ? FindUsernames(Ids) : new Map<string, string>();
    const AccountMappings: ReturnType<typeof AccountMappingEntry>[] = [];

    for(const Id of Ids){
        const Name = Names.get(Id);

        if(Name !== undefined){
            AccountMappings.push(AccountMappingEntry(Id, Name, SourceType));
        }
    }

    logger.info(`account/mapping by ${Caller ?? "<no token>"}: ${DescribeMappingBody(req.body)}; content-type ${String(req.headers["content-type"] ?? "none").slice(0, 60)} -> ${AccountMappings.length} of ${Ids.length} mapped`);

    // Flat and wrapped in one body (see above)
    res.json({
        code: "OK",
        message: "",
        payload: { accountMappings: AccountMappings },
        accountMappings: AccountMappings
    });
});

eosRouter.delete("/account/api/oauth/sessions/kill", (req, res) => {
    logger.info("Session kill (stubbed)");

    // TODO: Is this needed?

    res.json({});
})

eosRouter.delete("/account/api/oauth/sessions/kill/:AuthToken", (req, res) => {
    logger.info("Session kill (stubbed)");

    // TODO: Is this needed?

    res.json({});
})

// Several accounts at once (?accountId=A&accountId=B): an array of the ones that exist
const MAX_ACCOUNT_LOOKUP = 100;

eosRouter.get("/account/api/public/account", HasUndauntedMetagameAuth, async (req: any, res) => {
    const UserId = req.AuthData.userId;

    if(req.query?.accountId !== undefined){
        const Asked: string[] = (Array.isArray(req.query.accountId) ? req.query.accountId : [req.query.accountId])
            .filter((Id: unknown): Id is string => typeof Id === "string")
            .slice(0, MAX_ACCOUNT_LOOKUP);
        const Names = FindUsernames(Asked);
        const Found = [...new Set(Asked)].filter((Id) => Names.has(Id)).map((Id) => PublicAccount(Id, Names.get(Id)!));

        logger.info(`Account info for ${Asked.length} account(s) by userId ${UserId}: ${Found.length} found`);

        res.json(Found);
        return;
    }

    const Username = await DisplayNameForUserId(UserId);

    logger.info(`Account info for userId ${UserId}`);

    res.json({
        "id": UserId,
        "displayName": Username,
        "name": "",
        "lastName": "",
        "email": "",
        "failedLoginAttempts": 0,
        "lastLogin": new Date().toISOString(),
        "numberOfDisplayNameChanges": 0,
        "ageGroup": "ADULT",
        "headless": false,
        "country": "US",
        "lastNameChange": new Date().toISOString(),
        "preferredLanguage": "en",
        "canUpdateDisplayName": false,
        "tfaEnabled": false,
        "emailVerified": true,
        "minorVerified": false,
        "minorStatus": "NOT_MINOR"
    });
});