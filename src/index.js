import { loadConfig } from "./config.js";
import { createStorage } from "./storage.js";
import { createApp } from "./server.js";
import { startScheduler } from "./scheduler.js";

const config = loadConfig();
const storage = createStorage(config.neon.databaseUrl);
const app = createApp({ config, storage, awaitLineEvents: false });

startScheduler({ config, storage });

app.listen(config.port, () => {
  console.log(`CEO Partner listening on http://localhost:${config.port}`);
});
