import express from "express";
import http from "node:http";

import { buildChatContext, buildChatPrompt } from "./analysis.js";
import { generateText as defaultGenerateText } from "./aiClient.js";
import { createCeoPartnerTools } from "./aiTools.js";
import { getBangkokYesterday } from "./dates.js";
import {
  extractLineSource,
  pushText as defaultPushText,
  replyText as defaultReplyText,
  showLoadingAnimation as defaultShowLoadingAnimation,
  verifyLineSignature
} from "./lineClient.js";
import { fetchMetaSnapshot as defaultFetchMetaSnapshot } from "./metaClient.js";

const PROCESSING_FALLBACK_TEXT = "CEO Partner กำลังประมวลผล...";
const LINE_LOADING_SECONDS = 60;
const LINE_LOADING_RENEWAL_INTERVAL_MS = 45000;

function formatCurrentDateTime(timezone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone || "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(new Date());
}

function rawBodySaver(req, _res, buffer) {
  req.rawBody = buffer.toString("utf8");
}

async function getFreshChatSnapshot({ config, storage, fetchMetaSnapshot, getDateRange }) {
  try {
    const dateRange = getDateRange();
    const snapshot = await fetchMetaSnapshot({ config, dateRange });
    const snapshotWithAssets = {
      ...snapshot,
      pageId: config.meta?.pageId ?? snapshot.page?.id,
      adAccountId: config.meta?.adAccountId ?? snapshot.adAccountId
    };
    if (storage.saveSnapshot) {
      await storage.saveSnapshot(snapshotWithAssets);
    }
    return snapshotWithAssets;
  } catch (error) {
    console.error(`Fresh Meta fetch failed, using latest stored snapshot: ${error.message}`);
    return storage.getLatestSnapshot?.() ?? null;
  }
}

async function startLineLoadingIndicator({
  sourceId,
  config,
  showLoadingAnimation,
  renewalIntervalMs = LINE_LOADING_RENEWAL_INTERVAL_MS
}) {
  if (!sourceId) {
    return { fallbackNeeded: true, stop: () => {} };
  }

  try {
    await showLoadingAnimation({
      channelAccessToken: config.line.channelAccessToken,
      chatId: sourceId,
      loadingSeconds: LINE_LOADING_SECONDS
    });
  } catch (error) {
    console.error(`LINE loading animation failed, sending fallback text: ${error.message}`);
    return { fallbackNeeded: true, stop: () => {} };
  }

  const interval = setInterval(() => {
    showLoadingAnimation({
      channelAccessToken: config.line.channelAccessToken,
      chatId: sourceId,
      loadingSeconds: LINE_LOADING_SECONDS
    }).catch((error) => {
      console.error(`LINE loading animation renewal failed: ${error.message}`);
    });
  }, renewalIntervalMs);
  interval.unref?.();

  return {
    fallbackNeeded: false,
    stop: () => clearInterval(interval)
  };
}

async function handleLineEvent({
  event,
  config,
  storage,
  generateText,
  replyText,
  pushText,
  showLoadingAnimation,
  fetchMetaSnapshot,
  getDateRange,
  lineLoadingRenewalIntervalMs
}) {
  const source = extractLineSource(event);
  if (source && storage.saveLineSource) {
    await storage.saveLineSource(source);
    console.log(`LINE source seen: ${source.sourceType} ${source.sourceId}`);
  }

  if (event.type !== "message" || event.message?.type !== "text") {
    return;
  }

  const loadingIndicator = await startLineLoadingIndicator({
    sourceId: source?.sourceId,
    config,
    showLoadingAnimation,
    renewalIntervalMs: lineLoadingRenewalIntervalMs
  });

  if (loadingIndicator.fallbackNeeded && event.replyToken) {
    await replyText({
      channelAccessToken: config.line.channelAccessToken,
      replyToken: event.replyToken,
      text: PROCESSING_FALLBACK_TEXT
    });
  }

  try {
    const latestSnapshot = await getFreshChatSnapshot({ config, storage, fetchMetaSnapshot, getDateRange });
    const aiTools = createCeoPartnerTools({
      config,
      storage,
      getFreshSnapshot: () => getFreshChatSnapshot({ config, storage, fetchMetaSnapshot, getDateRange })
    });
    const prompt = buildChatPrompt({
      latestSnapshot,
      message: event.message.text,
      includeContext: !config.google.contextCache,
      currentDateTime: `${formatCurrentDateTime(config.timezone)} ${config.timezone}`
    });
    const cacheContext = config.google.contextCache
      ? {
          enabled: true,
          displayName: "CEO Partner LINE chat context",
          text: buildChatContext({ latestSnapshot }),
          ttlSeconds: config.google.contextCacheTtlSeconds,
          minChars: config.google.contextCacheMinChars
        }
      : undefined;
    const answer = await generateText({
      provider: config.google.provider,
      apiKey: config.google.apiKey,
      model: config.google.model,
      baseUrl: config.google.baseUrl,
      prompt,
      enableGoogleSearch: config.google.searchGrounding,
      functionDeclarations: aiTools.declarations,
      functionHandlers: aiTools.handlers,
      cacheContext
    });

    const pushTarget = source?.sourceId || config.line.targetId || (await storage.getDefaultLineTarget?.());
    if (!pushTarget) {
      console.error("No LINE push target available for final answer");
      return;
    }

    await pushText({
      channelAccessToken: config.line.channelAccessToken,
      to: pushTarget,
      text: answer
    });
  } catch (error) {
    console.error(error);
    const pushTarget = source?.sourceId || config.line.targetId || (await storage.getDefaultLineTarget?.());
    if (pushTarget) {
      await pushText({
        channelAccessToken: config.line.channelAccessToken,
        to: pushTarget,
        text: "CEO Partner AI encountered an error. Please try again in a moment."
      });
    }
  } finally {
    loadingIndicator.stop();
  }
}

function wrapExpress(expressApp) {
  return {
    expressApp,
    listen: (...args) => expressApp.listen(...args),
    async request(path, options = {}) {
      const server = http.createServer(expressApp);
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      const { port } = server.address();
      try {
        return await fetch(`http://127.0.0.1:${port}${path}`, options);
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    }
  };
}

export function createApp({
  config,
  storage,
  generateText = defaultGenerateText,
  replyText = defaultReplyText,
  pushText = defaultPushText,
  showLoadingAnimation = defaultShowLoadingAnimation,
  fetchMetaSnapshot = defaultFetchMetaSnapshot,
  getDateRange = getBangkokYesterday,
  lineLoadingRenewalIntervalMs = LINE_LOADING_RENEWAL_INTERVAL_MS,
  awaitLineEvents = true
}) {
  const app = express();
  app.use(express.json({ verify: rawBodySaver }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  const lineWebhookHandler = async (req, res) => {
    const rawBody = req.rawBody ?? JSON.stringify(req.body);
    const signature = req.get("x-line-signature");
    if (!verifyLineSignature(rawBody, signature, config.line.channelSecret)) {
      res.status(401).json({ ok: false, error: "invalid LINE signature" });
      return;
    }

    const eventTasks = (req.body.events ?? []).map((event) =>
      handleLineEvent({
        event,
        config,
        storage,
        generateText,
        replyText,
        pushText,
        showLoadingAnimation,
        fetchMetaSnapshot,
        getDateRange,
        lineLoadingRenewalIntervalMs
      })
    );

    try {
      if (awaitLineEvents) {
        await Promise.all(eventTasks);
      } else {
        Promise.all(eventTasks).catch((error) => {
          console.error(error);
        });
      }
      res.json({ ok: true });
    } catch (error) {
      console.error(error);
      res.status(500).json({ ok: false, error: error.message });
    }
  };

  app.post("/webhook/line", lineWebhookHandler);
  app.post("/webhook", lineWebhookHandler);

  return wrapExpress(app);
}
