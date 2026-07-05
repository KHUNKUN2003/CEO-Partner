import test from "node:test";
import assert from "node:assert/strict";

import {
  createStorage,
  createStorageWithQuery,
  saveLineSource
} from "../src/storage.js";
import { runDailyReport } from "../src/dailyReport.js";

test("storage saves line source with an upsert", async () => {
  const calls = [];
  const storage = createStorageWithQuery(async (strings, ...values) => {
    calls.push({ text: strings.join("?"), values });
    return [];
  });

  await saveLineSource(storage, { sourceId: "U123", sourceType: "user" });

  assert.match(calls[0].text, /insert into line_users/);
  assert.deepEqual(calls[0].values, ["U123", "user"]);
});

test("storage returns latest report and snapshot", async () => {
  const storage = createStorageWithQuery(async (strings) => {
    const text = strings.join("?");
    if (text.includes("from ai_reports")) {
      return [{ report_text: "latest report" }];
    }
    if (text.includes("from meta_snapshots")) {
      return [{ payload: { page: { name: "Fulltank Garage" } } }];
    }
    return [];
  });

  assert.equal(await storage.getLatestReport(), "latest report");
  assert.deepEqual(await storage.getLatestSnapshot(), { page: { name: "Fulltank Garage" } });
});

test("storage returns all LINE targets newest first", async () => {
  const storage = createStorageWithQuery(async (strings) => {
    const text = strings.join("?");
    if (text.includes("from line_users")) {
      return [{ source_id: "U456" }, { source_id: "U123" }];
    }
    return [];
  });

  assert.deepEqual(await storage.getLineTargets(), ["U456", "U123"]);
});

test("daily report fetches Meta, generates fresh AI report, stores snapshot only, and pushes LINE", async () => {
  const events = [];
  const storage = {
    saveSnapshot: async (snapshot) => {
      events.push(["snapshot", snapshot.reportDate]);
      return 42;
    },
    saveReport: async ({ reportDate, reportText, snapshotId }) => {
      events.push(["report", reportDate, reportText, snapshotId]);
      return 7;
    },
    getDefaultLineTarget: async () => "U123"
  };

  const result = await runDailyReport({
    config: {
      line: { channelAccessToken: "line-token", targetId: "", targetIds: [] },
      google: { apiKey: "google-token", model: "gemini", codeExecution: true }
    },
    dateRange: { date: "2026-05-31", since: "2026-05-31", until: "2026-05-31" },
    storage,
    fetchMetaSnapshot: async ({ dateRange }) => {
      events.push(["range", dateRange.since, dateRange.until, dateRange.days]);
      return { reportDate: dateRange.date, page: { name: "Fulltank Garage" } };
    },
    generateText: async ({ responseSchema, enableCodeExecution }) => {
      events.push(["schema", responseSchema.required.includes("priority")]);
      events.push(["code-execution", enableCodeExecution]);
      return JSON.stringify({
        yesterday_summary: "AI summary",
        lead_scores: [
          {
            customer: "Customer A",
            score: 82,
            temperature: "hot",
            reason: "asked price",
            next_action: "Send exact package price"
          }
        ],
        action_priority: [
          {
            rank: 1,
            action: "Reply to Customer A",
            owner: "Admin",
            urgency: "high",
            expected_impact: "recover hot lead"
          }
        ],
        today_actions: ["Action one"],
        content_ideas: ["Content one"],
        ad_recommendations: ["Ad one"],
        inbox_trend: "Inbox trend",
        priority: "Priority one"
      });
    },
    pushText: async ({ to, text }) => events.push(["push", to, text])
  });

  assert.equal(result.ok, true);
  assert.deepEqual(events.slice(0, 4), [
    ["range", "2026-05-31", "2026-05-31", undefined],
    ["snapshot", "2026-05-31"],
    ["schema", true],
    ["code-execution", true]
  ]);
  assert.equal(events.some(([eventName]) => eventName === "report"), false);
  assert.equal(events.at(-1)[0], "push");
  assert.equal(events.at(-1)[1], "U123");
  assert.match(events.at(-1)[2], /AI summary/);
  assert.equal(result.pushedCount, 1);
  assert.equal(result.failedCount, 0);
});

test("daily report pushes to every configured LINE target and tolerates one failed push", async () => {
  const events = [];
  const result = await runDailyReport({
    config: {
      line: { channelAccessToken: "line-token", targetId: "", targetIds: ["U123", "U456"] },
      google: { apiKey: "google-token", model: "gemini" }
    },
    dateRange: { date: "2026-05-31", since: "2026-05-31", until: "2026-05-31" },
    storage: {
      saveSnapshot: async () => 42,
      getLineTargets: async () => {
        throw new Error("configured targets should be used");
      }
    },
    fetchMetaSnapshot: async ({ dateRange }) => ({ reportDate: dateRange.date, page: { name: "Fulltank Garage" } }),
    generateText: async () =>
      JSON.stringify({
        yesterday_summary: "AI summary",
        lead_scores: [],
        action_priority: [],
        today_actions: [],
        content_ideas: [],
        ad_recommendations: [],
        inbox_trend: "Inbox trend",
        priority: "Priority one"
      }),
    pushText: async ({ to }) => {
      events.push(["push", to]);
      if (to === "U456") {
        throw new Error("LINE failed");
      }
    }
  });

  assert.equal(result.ok, true);
  assert.deepEqual(events, [
    ["push", "U123"],
    ["push", "U456"]
  ]);
  assert.equal(result.pushed, true);
  assert.equal(result.pushedCount, 1);
  assert.equal(result.failedCount, 1);
  assert.equal(result.pushFailures[0].target, "U456");
});

test("daily report defaults to yesterday in Bangkok time without saving report text", async () => {
  const events = [];
  await runDailyReport({
    config: {
      line: { channelAccessToken: "line-token", targetId: "", targetIds: [] },
      google: { apiKey: "google-token", model: "gemini" }
    },
    storage: {
      saveSnapshot: async () => 1,
      saveReport: async ({ reportDate }) => events.push(["unexpected-report-save", reportDate]),
      getDefaultLineTarget: async () => ""
    },
    now: new Date("2026-06-01T01:30:00+07:00"),
    fetchMetaSnapshot: async ({ dateRange }) => {
      events.push(["range", dateRange.since, dateRange.until, dateRange.days]);
      return { reportDate: dateRange.date, page: { name: "Fulltank Garage" } };
    },
    generateText: async () =>
      JSON.stringify({
        yesterday_summary: "AI summary",
        lead_scores: [],
        action_priority: [],
        today_actions: [],
        content_ideas: [],
        ad_recommendations: [],
        inbox_trend: "Inbox trend",
        priority: "Priority one"
      }),
    pushText: async () => {}
  });

  assert.deepEqual(events, [
    ["range", "2026-05-31", "2026-05-31", undefined]
  ]);
});

test("createStorage exposes query-backed methods", () => {
  const storage = createStorage("postgresql://user:password@example.neon.tech/db?sslmode=require");

  assert.equal(typeof storage.saveSnapshot, "function");
  assert.equal(typeof storage.getDefaultLineTarget, "function");
  assert.equal(typeof storage.getLineTargets, "function");
});
