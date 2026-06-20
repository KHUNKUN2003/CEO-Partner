import cron from "node-cron";

import { runDailyReport } from "./dailyReport.js";

export function startScheduler({ config, storage }) {
  console.log(`Daily report scheduler registered: ${config.dailyReportCron} (${config.timezone})`);
  const task = cron.schedule(
    config.dailyReportCron,
    async () => {
      console.log("Daily report job started");
      const result = await runDailyReport({ config, storage });
      console.log(
        `Daily report job finished: ok=${result.ok} pushed=${result.pushedCount ?? 0} failed=${result.failedCount ?? 0}`
      );
    },
    { timezone: config.timezone }
  );
  return task;
}
