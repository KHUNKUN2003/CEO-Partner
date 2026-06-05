import test from "node:test";
import assert from "node:assert/strict";

import { loadConfig } from "../src/config.js";
import { getBangkokPreviousDays, getBangkokYesterday } from "../src/dates.js";

test("config requires core production secrets", () => {
  assert.throws(
    () => loadConfig({}),
    /Missing required environment variables: NEON_DATABASE_URL, META_ACCESS_TOKEN, META_PAGE_ID, META_AD_ACCOUNT_ID, GOOGLE_AI_API_KEY, LINE_CHANNEL_SECRET, LINE_CHANNEL_ACCESS_TOKEN/
  );
});

test("config accepts required values and applies defaults", () => {
  const config = loadConfig({
    NEON_DATABASE_URL: "postgresql://example",
    META_ACCESS_TOKEN: "meta-token",
    META_PAGE_ID: "731445173377155",
    META_AD_ACCOUNT_ID: "act_3587793018144053",
    GOOGLE_AI_API_KEY: "google-token",
    LINE_CHANNEL_SECRET: "line-secret",
    LINE_CHANNEL_ACCESS_TOKEN: "line-token"
  });

  assert.equal(config.port, 3000);
  assert.equal(config.timezone, "Asia/Bangkok");
  assert.equal(config.meta.graphVersion, "v24.0");
  assert.equal(config.meta.contentMaxItems, 5000);
  assert.equal(config.google.model, "gemini-3.5-flash");
  assert.equal(config.google.searchGrounding, true);
  assert.equal(config.google.codeExecution, true);
  assert.equal(config.google.contextCache, true);
  assert.equal(config.google.contextCacheTtlSeconds, 3600);
  assert.equal(config.google.contextCacheMinChars, 4000);
  assert.equal(config.google.workspace.calendarId, "primary");
  assert.equal(config.google.workspace.tasksListId, "@default");
  assert.equal(config.google.workspace.serviceAccountEmail, "");
  assert.equal(config.google.workspace.oauthRedirectUri, "http://127.0.0.1:53682/oauth2callback");
  assert.equal(config.google.workspace.oauthRefreshToken, "");
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
