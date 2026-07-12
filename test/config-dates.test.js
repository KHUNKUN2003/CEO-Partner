import test from "node:test";
import assert from "node:assert/strict";

import { loadConfig } from "../src/config.js";
import { getBangkokPreviousDays, getBangkokYesterday } from "../src/dates.js";

test("config requires core production secrets", () => {
  assert.throws(
    () => loadConfig({}),
    /Missing required environment variables: NEON_DATABASE_URL, META_ACCESS_TOKEN, META_PAGE_ID, META_AD_ACCOUNT_ID, LINE_CHANNEL_SECRET, LINE_CHANNEL_ACCESS_TOKEN, DEEPSEEK_API_KEY/
  );
});

test("config accepts required values and applies defaults", () => {
  const config = loadConfig({
    NEON_DATABASE_URL: "postgresql://example",
    META_ACCESS_TOKEN: "meta-token",
    META_PAGE_ID: "731445173377155",
    META_AD_ACCOUNT_ID: "act_3587793018144053",
    DEEPSEEK_API_KEY: "deepseek-token",
    LINE_CHANNEL_SECRET: "line-secret",
    LINE_CHANNEL_ACCESS_TOKEN: "line-token"
  });

  assert.equal(config.port, 3000);
  assert.equal(config.timezone, "Asia/Bangkok");
  assert.equal(config.meta.graphVersion, "v24.0");
  assert.equal(config.meta.contentMaxItems, 5000);
  assert.equal(config.ai.provider, "deepseek");
  assert.equal(config.ai.model, "deepseek-chat");
  assert.equal(config.google.provider, "deepseek");
  assert.equal(config.google.model, "deepseek-chat");
  assert.equal(config.google.searchGrounding, false);
  assert.equal(config.google.codeExecution, false);
  assert.equal(config.google.contextCache, false);
  assert.equal(config.google.contextCacheTtlSeconds, 3600);
  assert.equal(config.google.contextCacheMinChars, 4000);
  assert.equal(config.google.workspace.calendarId, "primary");
  assert.equal(config.google.workspace.tasksListId, "@default");
  assert.equal(config.google.workspace.serviceAccountEmail, "");
  assert.equal(config.google.workspace.oauthRedirectUri, "http://127.0.0.1:53682/oauth2callback");
  assert.equal(config.google.workspace.oauthRefreshToken, "");
  assert.deepEqual(config.line.targetIds, []);
});

test("config parses multiple LINE report targets", () => {
  const config = loadConfig({
    NEON_DATABASE_URL: "postgresql://example",
    META_ACCESS_TOKEN: "meta-token",
    META_PAGE_ID: "731445173377155",
    META_AD_ACCOUNT_ID: "act_3587793018144053",
    DEEPSEEK_API_KEY: "deepseek-token",
    LINE_CHANNEL_SECRET: "line-secret",
    LINE_CHANNEL_ACCESS_TOKEN: "line-token",
    LINE_TARGET_IDS: "U123, U456",
    LINE_TARGET_ID: "U123"
  });

  assert.deepEqual(config.line.targetIds, ["U123", "U456"]);
});

test("Bangkok yesterday returns a stable local date", () => {
  const now = new Date("2026-06-01T01:30:00+07:00");
  const result = getBangkokYesterday(now);

  assert.equal(result.date, "2026-05-31");
  assert.equal(result.since, "2026-05-31");
  assert.equal(result.until, "2026-05-31");
});

test("Bangkok previous 7 days returns a stable range ending yesterday", () => {
  const now = new Date("2026-06-01T01:30:00+07:00");
  const result = getBangkokPreviousDays(now, 7);

  assert.equal(result.date, "2026-05-31");
  assert.equal(result.since, "2026-05-25");
  assert.equal(result.until, "2026-05-31");
  assert.equal(result.days, 7);
});
