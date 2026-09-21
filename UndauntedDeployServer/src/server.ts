import { app } from "./app";
import { Startup } from "./controllers/gameservers";
import { RunWatchdog } from "./controllers/watchdog";
import { logger } from "./logger";

const PORT = Number(process.env.PORT);
// The deploy server has no authentication at all -- anyone who can reach it
// can spawn game processes on this machine. It must never listen beyond
// loopback; only the metagame on the same host talks to it.
const BIND_HOST = process.env.BIND_HOST || "127.0.0.1";

app.listen(PORT, BIND_HOST, (err?: Error) => {
  if (err) {
    logger.fatal(`Could not listen on ${BIND_HOST}:${PORT}: ${err.message}`);
    process.exit(1);
  }

  Startup();

  setInterval(RunWatchdog, 60 * 1000);

  logger.info(`Undaunted DeployServer on port ${PORT}`);
  logger.info(`Clear Skies, Slayer.`);
});