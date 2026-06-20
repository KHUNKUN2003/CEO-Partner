import { buildDailyReportPrompt, buildDailyReportSchema, formatDailyReportJson } from "./analysis.js";
import { generateText as defaultGenerateText } from "./aiClient.js";
import { getBangkokYesterday } from "./dates.js";
import { fetchMetaSnapshot as defaultFetchMetaSnapshot } from "./metaClient.js";
import { pushText as defaultPushText } from "./lineClient.js";

async function resolveLineTargets({ config, storage }) {
  if (Array.isArray(config.line?.targetIds) && config.line.targetIds.length > 0) {
    return [...new Set(config.line.targetIds.filter(Boolean))];
  }

  if (config.line?.targetId) {
    return [config.line.targetId];
  }

  if (typeof storage.getLineTargets === "function") {
    const targets = await storage.getLineTargets();
    return [...new Set(targets.filter(Boolean))];
  }

  const target = await storage.getDefaultLineTarget?.();
  return target ? [target] : [];
}

async function pushTextToTargets({ channelAccessToken, targets, text, pushText }) {
  const results = await Promise.allSettled(
    targets.map((to) =>
      pushText({
        channelAccessToken,
        to,
        text
      })
    )
  );

  return {
    pushed: results.filter((result) => result.status === "fulfilled").length,
    failed: results.filter((result) => result.status === "rejected").length,
    failures: results
      .map((result, index) => ({ result, target: targets[index] }))
      .filter(({ result }) => result.status === "rejected")
      .map(({ result, target }) => ({ target, error: result.reason?.message ?? String(result.reason) }))
  };
}

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
    await storage.saveSnapshot(snapshotWithAssets);
    const prompt = buildDailyReportPrompt({
      reportDate: dateRange.date,
      snapshot: snapshotWithAssets
    });
    const reportOutput = await generateText({
      apiKey: config.google.apiKey,
      model: config.google.model,
      prompt,
      enableGoogleSearch: config.google.searchGrounding,
      enableCodeExecution: config.google.codeExecution,
      responseSchema: buildDailyReportSchema()
    });
    const reportText = formatDailyReportJson(JSON.parse(reportOutput));

    const targets = await resolveLineTargets({ config, storage });
    const pushResult = targets.length > 0
      ? await pushTextToTargets({
          channelAccessToken: config.line.channelAccessToken,
          targets,
          text: reportText,
          pushText
        })
      : { pushed: 0, failed: 0, failures: [] };

    return {
      ok: true,
      reportText,
      pushed: pushResult.pushed > 0,
      pushedCount: pushResult.pushed,
      failedCount: pushResult.failed,
      pushFailures: pushResult.failures
    };
  } catch (error) {
    const message = `CEO Partner report failed: ${error.message}`;
    const targets = await resolveLineTargets({ config, storage });
    if (targets.length > 0) {
      await pushTextToTargets({
        channelAccessToken: config.line.channelAccessToken,
        targets,
        text: message,
        pushText
      });
    }
    return { ok: false, error: error.message };
  }
}
