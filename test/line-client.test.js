import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

import {
  buildLoadingAnimationBody,
  buildPushBody,
  buildReplyBody,
  extractLineSource,
  showLoadingAnimation,
  verifyLineSignature
} from "../src/lineClient.js";

test("LINE signature verification accepts a valid signature", () => {
  const body = JSON.stringify({ events: [] });
  const secret = "secret";
  const signature = crypto.createHmac("sha256", secret).update(body).digest("base64");

  assert.equal(verifyLineSignature(body, signature, secret), true);
});

test("LINE signature verification rejects an invalid signature", () => {
  const body = JSON.stringify({ events: [] });

  assert.equal(verifyLineSignature(body, "bad-signature", "secret"), false);
});

test("LINE source extraction supports users and groups", () => {
  assert.deepEqual(
    extractLineSource({ source: { type: "user", userId: "U123" } }),
    { sourceType: "user", sourceId: "U123" }
  );
  assert.deepEqual(
    extractLineSource({ source: { type: "group", groupId: "C123" } }),
    { sourceType: "group", sourceId: "C123" }
  );
});

test("LINE reply and push bodies use text messages", () => {
  assert.deepEqual(buildReplyBody("reply-token", "hello"), {
    replyToken: "reply-token",
    messages: [{ type: "text", text: "hello" }]
  });
  assert.deepEqual(buildPushBody("U123", "hello"), {
    to: "U123",
    messages: [{ type: "text", text: "hello" }]
  });
});

test("LINE loading animation body uses chat id and seconds", () => {
  assert.deepEqual(buildLoadingAnimationBody("U123", 30), {
    chatId: "U123",
    loadingSeconds: 30
  });
});

test("LINE loading animation calls the loading endpoint", async () => {
  const calls = [];
  await showLoadingAnimation({
    channelAccessToken: "line-token",
    chatId: "U123",
    loadingSeconds: 30,
    fetchImpl: async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body) });
      return new Response("", { status: 202 });
    }
  });

  assert.equal(calls[0].url, "https://api.line.me/v2/bot/chat/loading/start");
  assert.deepEqual(calls[0].body, { chatId: "U123", loadingSeconds: 30 });
});
