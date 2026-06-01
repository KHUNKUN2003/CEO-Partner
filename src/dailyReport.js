import { buildDailyReportPrompt, buildDailyReportSchema, formatDailyReportJson } from "./analysis.js";
import { generateText as defaultGenerateText } from "./aiClient.js";
import { getBangkokYesterday } from "./dates.js";
import { fetchMetaSnapshot as defaultFetchMetaSnapshot } from "./metaClient.js";
import { pushText as defaultPushText } from "./lineClient.js";

export async function runDailyReport({
  config,
  storage,
  now = new Date(),
  dateRange = getBangkokYesterday(now),
  fetchMetaSnapshot = defaultFetchMetaSnapshot,
  generateText = defaultGenerateText,
  pushText = defaultPushText
}) {
  try {
    const snapshot = await fetchMetaSnapshot({ config, dateRange });
    const snapshotWithAssets = {
      ...snapshot,
      since: dateRange.since,
      until: dateRange.until,
      days: dateRange.days,
      pageId: config.meta?.pageId ?? snapshot.page?.id,
      adAccountId: config.meta?.adAccountId ?? snapshot.adAccountId
    };
    const snapshotId = await storage.saveSnapshot(snapshotWithAssets);
    const prompt = buildDailyReportPrompt({
      reportDate: dateRange.date,
      snapshot: snapshotWithAssets
    });
    const reportOutput = await generateText({
      apiKey: config.google.apiKey,
      model: config.google.model,
      prompt,
      enableGoogleSearch: config.google.searchGrounding,
      responseSchema: buildDailyReportSchema()
    });
    const reportText = formatDailyReportJson(JSON.parse(reportOutput));

    await storage.saveReport({
      reportDate: dateRange.date,
      reportText,
      snapshotId
    });

    const target = config.line.targetId || (await storage.getDefaultLineTarget());
    if (target) {
      await pushText({
        channelAccessToken: config.line.channelAccessToken,
        to: target,
        text: reportText
      });
    }

    return { ok: true, reportText, pushed: Boolean(target) };
  } catch (error) {
    const message = `CEO Partner report failed: ${error.message}`;
    const target = config.line.targetId || (await storage.getDefaultLineTarget?.());
    if (target) {
      await pushText({
        channelAccessToken: config.line.channelAccessToken,
        to: target,
        text: message
      });
    }
    return { ok: false, error: error.message };
  }
}
