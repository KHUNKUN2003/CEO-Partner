import cron from "node-cron";

import { runDailyReport } from "./dailyReport.js";

export function startScheduler({ config, storage }) {
  const task = cron.schedule(
    config.dailyReportCron,
    () => runDailyReport({ config, storage }),
    { timezone: config.timezone }
  );
  return task;
}
