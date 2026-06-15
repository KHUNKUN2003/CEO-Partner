import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

import { createApp } from "../src/server.js";

function signedBody(body, secret = "secret") {
  const rawBody = JSON.stringify(body);
  return {
    rawBody,
    signature: crypto.createHmac("sha256", secret).update(rawBody).digest("base64")
  };
}

test("health endpoint returns ok", async () => {
  const app = createApp({
    config: { line: { channelSecret: "secret" } },
    storage: {},
    generateText: async () => "ok"
  });

  const response = await app.request("/health");
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
});

test("LINE webhook rejects invalid signatures", async () => {
  const app = createApp({
    config: { line: { channelSecret: "secret" } },
    storage: {},
    generateText: async () => "ok"
  });

  const response = await app.request("/webhook/line", {
    method: "POST",
    headers: { "content-type": "application/json", "x-line-signature": "bad" },
    body: JSON.stringify({ events: [] })
  });

  assert.equal(response.status, 401);
});

test("LINE webhook starts loading animation, then pushes answer without fallback text", async () => {
  const events = [];
  const { rawBody, signature } = signedBody({
    events: [
      {
        type: "message",
        replyToken: "reply-token",
        source: { type: "user", userId: "U123" },
        message: { type: "text", text: "question" }
      }
    ]
  });
  const app = createApp({
    config: {
      line: { channelSecret: "secret", channelAccessToken: "line-token" },
      google: { apiKey: "google-token", model: "gemini" }
    },
    storage: {
      saveLineSource: async (source) => events.push(["source", source]),
      getLatestReport: async () => "latest report",
      getLatestSnapshot: async () => ({ page: { name: "Fulltank Garage" } })
    },
    generateText: async ({ prompt }) => {
      events.push(["prompt", prompt.includes("question")]);
      return "answer";
    },
    fetchMetaSnapshot: async () => ({ page: { name: "Fulltank Garage" }, adInsights: { data: [] } }),
    showLoadingAnimation: async ({ chatId, loadingSeconds }) => events.push(["loading", chatId, loadingSeconds]),
    replyText: async ({ replyToken, text }) => events.push(["reply", replyToken, text]),
    pushText: async ({ to, text }) => events.push(["push", to, text])
  });

  const response = await app.request("/webhook/line", {
    method: "POST",
    headers: { "content-type": "application/json", "x-line-signature": signature },
    body: rawBody
  });

  assert.equal(response.status, 200);
  assert.deepEqual(events, [
    ["source", { sourceType: "user", sourceId: "U123" }],
    ["loading", "U123", 60],
    ["prompt", true],
    ["push", "U123", "answer"]
  ]);
});

test("LINE webhook can acknowledge before background processing finishes", async () => {
  let releaseProcessing;
  const processingStarted = new Promise((resolve) => {
    releaseProcessing = resolve;
  });
  const events = [];
  const { rawBody, signature } = signedBody({
    events: [
      {
        type: "message",
        replyToken: "reply-token",
        source: { type: "user", userId: "U123" },
        message: { type: "text", text: "slow question" }
      }
    ]
  });
  const app = createApp({
    config: {
      line: { channelSecret: "secret", channelAccessToken: "line-token" },
      google: { apiKey: "google-token", model: "gemini" }
    },
    storage: {
      saveLineSource: async () => {},
      saveSnapshot: async () => {},
      getDefaultLineTarget: async () => "U123"
    },
    generateText: async () => {
      await processingStarted;
      return "slow answer";
    },
    fetchMetaSnapshot: async () => ({ page: { name: "Fulltank Garage" }, adInsights: { data: [] } }),
    showLoadingAnimation: async () => events.push(["loading"]),
    pushText: async ({ text }) => events.push(["push", text]),
    awaitLineEvents: false
  });

  const response = await app.request("/webhook/line", {
    method: "POST",
    headers: { "content-type": "application/json", "x-line-signature": signature },
    body: rawBody
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body, { ok: true });
  assert.equal(events.some(([eventName]) => eventName === "push"), false);

  releaseProcessing();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(events, [["loading"], ["push", "slow answer"]]);
});

test("LINE webhook renews loading animation while a long answer is processing", async () => {
  const events = [];
  const { rawBody, signature } = signedBody({
    events: [
      {
        type: "message",
        replyToken: "reply-token",
        source: { type: "user", userId: "U123" },
        message: { type: "text", text: "long question" }
      }
    ]
  });
  const app = createApp({
    config: {
      line: { channelSecret: "secret", channelAccessToken: "line-token" },
      google: { apiKey: "google-token", model: "gemini" }
    },
    storage: {
      getLatestReport: async () => "latest report",
      getLatestSnapshot: async () => ({ page: { name: "Fulltank Garage" } })
    },
    generateText: async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return "answer";
    },
    fetchMetaSnapshot: async () => ({ page: { name: "Fulltank Garage" }, adInsights: { data: [] } }),
    showLoadingAnimation: async ({ loadingSeconds }) => events.push(["loading", loadingSeconds]),
    pushText: async ({ text }) => events.push(["push", text]),
    lineLoadingRenewalIntervalMs: 5
  });

  const response = await app.request("/webhook/line", {
    method: "POST",
    headers: { "content-type": "application/json", "x-line-signature": signature },
    body: rawBody
  });

  assert.equal(response.status, 200);
  assert.ok(events.filter(([eventName]) => eventName === "loading").length >= 2);
  assert.deepEqual(events.at(-1), ["push", "answer"]);
});

test("LINE webhook sends fallback text only when loading animation fails", async () => {
  const events = [];
  const { rawBody, signature } = signedBody({
    events: [
      {
        type: "message",
        replyToken: "reply-token",
        source: { type: "user", userId: "U123" },
        message: { type: "text", text: "question" }
      }
    ]
  });
  const app = createApp({
    config: {
      line: { channelSecret: "secret", channelAccessToken: "line-token" },
      google: { apiKey: "google-token", model: "gemini" }
    },
    storage: {
      getLatestReport: async () => "latest report",
      getLatestSnapshot: async () => ({ page: { name: "Fulltank Garage" } })
    },
    generateText: async () => "answer",
    fetchMetaSnapshot: async () => ({ page: { name: "Fulltank Garage" }, adInsights: { data: [] } }),
    showLoadingAnimation: async () => {
      events.push(["loading-failed"]);
      throw new Error("loading not available");
    },
    replyText: async ({ replyToken, text }) => events.push(["reply", replyToken, text]),
    pushText: async ({ to, text }) => events.push(["push", to, text])
  });

  const response = await app.request("/webhook/line", {
    method: "POST",
    headers: { "content-type": "application/json", "x-line-signature": signature },
    body: rawBody
  });

  assert.equal(response.status, 200);
  assert.deepEqual(events, [
    ["loading-failed"],
    ["reply", "reply-token", "CEO Partner กำลังประมวลผล..."],
    ["push", "U123", "answer"]
  ]);
});

test("LINE chatbot fetches fresh Meta data before pushing answer", async () => {
  const events = [];
  const { rawBody, signature } = signedBody({
    events: [
      {
        type: "message",
        replyToken: "reply-token",
        source: { type: "user", userId: "U123" },
        message: { type: "text", text: "Meta today?" }
      }
    ]
  });
  const app = createApp({
    config: {
      line: { channelSecret: "secret", channelAccessToken: "line-token" },
      google: { apiKey: "google-token", model: "gemini" },
      meta: { pageId: "page-1", adAccountId: "act_1" }
    },
    storage: {
      saveLineSource: async () => {},
      saveSnapshot: async (snapshot) => events.push(["snapshot", snapshot.page.name]),
      getLatestReport: async () => {
        throw new Error("chat should not read stored reports");
      },
      getLatestSnapshot: async () => ({ page: { name: "Old snapshot" } })
    },
    getDateRange: () => ({ date: "2026-05-31", since: "2026-05-31", until: "2026-05-31" }),
    fetchMetaSnapshot: async ({ dateRange }) => {
      events.push(["meta", dateRange.date]);
      return {
        reportDate: dateRange.date,
        page: { id: "page-1", name: "Fresh Meta Page" },
        adInsights: { data: [] }
      };
    },
    generateText: async ({ prompt, functionDeclarations, functionHandlers }) => {
      events.push(["prompt", prompt.includes("Fresh Meta Page"), prompt.includes("Old snapshot")]);
      events.push(["stored-report", prompt.includes("latest report")]);
      events.push(["tools", functionDeclarations.some((declaration) => declaration.name === "get_latest_meta_snapshot")]);
      const toolResult = await functionHandlers.get_latest_meta_snapshot({ area: "inbox" });
      events.push(["tool-result", toolResult.page.name]);
      return "fresh answer";
    },
    showLoadingAnimation: async ({ loadingSeconds }) => events.push(["loading", loadingSeconds]),
    replyText: async ({ text }) => events.push(["reply", text]),
    pushText: async ({ text }) => events.push(["push", text])
  });

  const response = await app.request("/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "x-line-signature": signature },
    body: rawBody
  });

  assert.equal(response.status, 200);
  assert.deepEqual(events, [
    ["loading", 60],
    ["meta", "2026-05-31"],
    ["snapshot", "Fresh Meta Page"],
    ["prompt", true, false],
    ["stored-report", false],
    ["tools", true],
    ["meta", "2026-05-31"],
    ["snapshot", "Fresh Meta Page"],
    ["tool-result", "Fresh Meta Page"],
    ["push", "fresh answer"]
  ]);
});

test("LINE chatbot pushes an error fallback when AI generation fails", async () => {
  const events = [];
  const { rawBody, signature } = signedBody({
    events: [
      {
        type: "message",
        replyToken: "reply-token",
        source: { type: "user", userId: "U123" },
        message: { type: "text", text: "report please" }
      }
    ]
  });
  const app = createApp({
    config: {
      line: { channelSecret: "secret", channelAccessToken: "line-token" },
      google: { apiKey: "google-token", model: "gemini" },
      meta: { pageId: "page-1", adAccountId: "act_1" }
    },
    storage: {
      saveLineSource: async () => {},
      getLatestReport: async () => "latest report",
      getLatestSnapshot: async () => ({ page: { name: "Snapshot" } })
    },
    fetchMetaSnapshot: async () => ({ page: { name: "Fresh" }, adInsights: { data: [] } }),
    generateText: async () => {
      throw new Error("Gemini failed");
    },
    showLoadingAnimation: async () => events.push(["loading"]),
    pushText: async ({ to, text }) => events.push(["push", to, text])
  });

  const response = await app.request("/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "x-line-signature": signature },
    body: rawBody
  });

  assert.equal(response.status, 200);
  assert.deepEqual(events, [
    ["loading"],
    ["push", "U123", "CEO Partner AI encountered an error. Please try again in a moment."]
  ]);
});

test("LINE webhook also accepts the short /webhook path", async () => {
  const { rawBody, signature } = signedBody({ events: [] });
  const app = createApp({
    config: { line: { channelSecret: "secret" } },
    storage: {},
    generateText: async () => "ok"
  });

  const response = await app.request("/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "x-line-signature": signature },
    body: rawBody
  });

  assert.equal(response.status, 200);
});
