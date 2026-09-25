import path from "node:path";
import { config as loadEnv } from "dotenv";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";

loadEnv({ path: path.resolve(import.meta.dirname, "../../../.env"), quiet: true });

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL, config.NODE_ENV === "development");
const app = await createApp(config, logger);
await app.listen(config.API_PORT);
logger.info({ port: config.API_PORT }, `API hazır · http://localhost:${config.API_PORT} · belgeler /docs`);
