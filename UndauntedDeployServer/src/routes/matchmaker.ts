import { Router } from "express";
import { logger } from "../logger";
import { HandleMatchmakingRequest } from "../controllers/matchmaker";
import { CheckMatchmakingRequest } from "../controllers/matchmakinginput";
import { IsDirectLoopbackRequest } from "./gameservers";
import express from "express";

export const matchmakingRouter = Router();

matchmakingRouter.post("/handle-matchmaking-for-player", express.json(), async (req, res) => {
    // Starts game server processes, with no authentication: the metagame on this machine only
    if(!IsDirectLoopbackRequest(req)){
        logger.warn(`Refusing a matchmaking call from ${req.socket.remoteAddress}: only the metagame on this machine may call it`);

        res.status(403);
        res.send();
        return;
    }

    const Body = req.body != null && typeof req.body === "object" ? req.body : {};
    const GameMode = Body.GameMode;
    const GameArgs = Body.GameArgs;
    const HuntId = Body.HuntId;
    const ExpectedPlayers = Body.ExpectedPlayers;

    const BadRequest = CheckMatchmakingRequest(GameMode, GameArgs, HuntId, ExpectedPlayers);

    if(BadRequest != undefined){
        logger.warn(`Refusing a matchmaking call: ${BadRequest}`);

        res.status(400);
        res.json({ error: "bad_request", message: BadRequest });
        return;
    }

    const MatchmakingResult = await HandleMatchmakingRequest(GameMode, GameArgs, HuntId, ExpectedPlayers);

    res.status(200);
    res.json(MatchmakingResult);
});
