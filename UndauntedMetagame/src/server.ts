import { app } from "./app";
import { DrainAndRegisterAPIKeys } from "./controllers/apikeys";
import { DrainAndRegisterUserAPIKeys } from "./controllers/auth";
import { GetDb } from "./db";
import { logger } from "./logger";

const PORT = Number(process.env.PORT);
// Bind to loopback unless told otherwise. Upstream listened on every
// interface, which with REGISTRATION_MODE=OPEN let anyone who could reach the
// machine create an account. Set BIND_HOST to the VPN address (or 0.0.0.0)
// only once invite codes are on.
const BIND_HOST = process.env.BIND_HOST || "127.0.0.1";

GetDb(); // This runs migrations TODO make this more explicit

DrainAndRegisterAPIKeys().then(async () => {
  await DrainAndRegisterUserAPIKeys();

  // Express 5 hands bind failures to this callback. Upstream ignored the
  // argument and announced success anyway, so a port already taken by another
  // program (on a Shadow PC, ShadowUSB owns 127.0.0.1:60000) printed "Clear
  // Skies" and then the process quietly exited, leaving clients connected to
  // the wrong program and hanging forever.
  app.listen(PORT, BIND_HOST, (err?: Error) => {
    if (err) {
      logger.fatal(`Could not listen on ${BIND_HOST}:${PORT}: ${err.message}`);
      process.exit(1);
    }
    logger.info(`Undaunted Metagame on ${BIND_HOST}:${PORT}`);
    logger.info(`Clear Skies, Slayer.`);
  });
});