import express from "express";
import fs from "node:fs";
import { loginRouter } from "./routes/login.js";
import { logger } from "./logger.js";
import { eosRouter } from "./routes/eos.js";
import { systemRouter } from "./routes/system.js";
import { friendsRouter } from "./routes/friends.js";
import { characterRouter } from "./routes/character.js";
import { inventoryRouter } from "./routes/inventory.js";
import { storeRouter } from "./routes/store.js";
import { guildRouter } from "./routes/guild.js";
import { tuningRouter } from "./routes/tuning.js";
import { matchmakingRouter } from "./routes/matchmaking.js";
import { partyRouter } from "./routes/party.js";
import { progressionRouter } from "./routes/progression.js";
import { loadoutRouter } from "./routes/loadout.js";
import { undauntedApiRouter } from "./routes/undauntedapi.js";
import { DescribeOrigin, RefuseProxiedInDevAuthMode } from "./middleware/RequestOrigin.js";

export const app = express();

// Development logins (AUTH_MODE=NONE) never answer anything relayed by the gateway or
// another proxy; a no-op with AUTH_MODE=APIKEY. See middleware/RequestOrigin.ts.
app.use(RefuseProxiedInDevAuthMode);

app.use(express.json({ limit: "50mb" }));

app.use(express.urlencoded({ extended: true }));

// Request trace. Upstream only logged unstubbed routes, which left no way to
// see how far a client got before it stalled. `gs=1` marks calls made by a
// game-server process (they carry the gameserver API key) rather than a player.
// Never write credentials to the log: some routes carry a JWT in the path
// (e.g. DELETE /account/api/oauth/sessions/kill/<token>).
// Behind the public-mode gateway the line ends with " via=gateway ip=<player address>";
// a direct request keeps the old format.
const redact = (path: string) =>
    path.replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, "<token>").replace(/[\w-]{64,}/g, "<redacted>");

if (process.env.LOG_REQUESTS !== "0") {
    app.use((req, _res, next) => {
        logger.info(`${req.method} ${redact(req.path)} gs=${req.headers["x-undaunted-gameserver-apikey"] ? 1 : 0}${DescribeOrigin(req)}`);
        next();
    });
}

// Body capture for the save routes that are still stubbed or missing. Their
// request formats are only inferred from the client binary, and a wrong
// response shape can crash the client, so we record what the game actually
// sends before building on it (also the party, friends, guild and account lookups of roadmap
// 1.9 and 3.11, with the query string, which is in originalUrl). Off unless LOG_BODIES=1; one JSON object per
// line in BODY_LOG_FILE (default ./bodies.log), bodies capped at 8 KB (64 KB for
// /inventory, whose hunt-end batches decide INVENTORY_REFUSE_OVERSPEND), with any
// token-shaped string removed from both the URL and the body. The guild, account mapping and
// account info bodies hold account ids and guild names only.
const BODY_ROUTES = /^\/(progression|huntpass|bounty|cooldown|escalation|entitlement|loadout\/[^/]+\/[^/]+\/unlock|product\/skus|candidate|party|friends|guild|balance|store|inventory|account\/api\/public\/account|account\/mapping|accountinfo\/public)/;
if (process.env.LOG_BODIES === "1") {
    const bodyLog = process.env.BODY_LOG_FILE || "bodies.log";
    app.use((req, _res, next) => {
        if (BODY_ROUTES.test(req.path)) {
            let body = "";
            try { body = redact(JSON.stringify(req.body ?? null)); } catch { body = "<unserialisable>"; }
            const cap = req.path.startsWith("/inventory") ? 65536 : 8192;
            if (body.length > cap) body = body.slice(0, cap) + "…<truncated>";
            const line = JSON.stringify({
                t: new Date().toISOString(),
                method: req.method,
                url: redact(req.originalUrl),
                gs: req.headers["x-undaunted-gameserver-apikey"] ? 1 : 0,
                body,
            });
            fs.appendFile(bodyLog, line + "\n", (err) => { if (err) logger.warn(`body log write failed: ${err.message}`); });
        }
        next();
    });
}

app.use("/", loginRouter);
app.use("/", eosRouter);
app.use("/", systemRouter);
app.use("/", friendsRouter);
app.use("/", characterRouter);
app.use("/", inventoryRouter);
app.use("/", storeRouter);
app.use("/", guildRouter);
app.use("/", tuningRouter);
app.use("/", matchmakingRouter);
app.use("/", partyRouter);
app.use("/", progressionRouter);
app.use("/", loadoutRouter);
app.use("/undaunted/api", undauntedApiRouter); // Everything that I/we add to help manage undaunted that doesn't belong to the game proper belongs here

app.use((req, res) => {
    logger.warn(`Unstubbed route ${req.method} ${req.path}`)

    res.status(404);
    res.send();
});

// Unparseable JSON on the account routes the launcher and host scripts call gets the
// same {"error": "bad_request"} as any other bad body there. Every other route keeps
// Express's default error handling.
const JSON_ERROR_ROUTES = new Set(["/undaunted/api/register", "/undaunted/api/createinvite", "/undaunted/api/renameuser", "/undaunted/api/partyinvite", "/undaunted/api/friends", "/undaunted/api/guildinvite", "/undaunted/api/disbandguild"]);

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if(err?.type === "entity.parse.failed" && JSON_ERROR_ROUTES.has(req.path.toLowerCase().replace(/\/+$/, ""))){
        res.status(400);
        res.json({ error: "bad_request", message: "The request body is not valid JSON." });
        return;
    }

    next(err);
});