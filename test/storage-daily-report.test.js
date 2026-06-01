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

test("daily report fetches Meta, generates AI report, stores, and pushes LINE", async () => {
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
      line: { channelAccessToken: "line-token", targetId: "" },
      google: { apiKey: "google-token", model: "gemini" }
    },
    dateRange: { date: "2026-05-31", since: "2026-05-31", until: "2026-05-31" },
    storage,
    fetchMetaSnapshot: async () => ({ reportDate: "2026-05-31", page: { name: "Fulltank Garage" } }),
    generateText: async ({ responseSchema }) => {
      events.push(["schema", responseSchema.required.includes("priority")]);
      return JSON.stringify({
        yesterday_summary: "AI summary",
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
  assert.deepEqual(events, [
    ["snapshot", "2026-05-31"],
    ["schema", true],
    [
      "report",
      "2026-05-31",
      "CEO Partner รายงานประจำวัน\n\nสรุปเมื่อวาน: AI summary\n\nสิ่งที่ควรทำวันนี้:\n1. Action one\n\nไอเดียคอนเทนต์:\n1. Content one\n\nคำแนะนำโฆษณา:\n1. Ad one\n\nแนวโน้ม Inbox: Inbox trend\n\nPriority: Priority one",
      42
    ],
    [
      "push",
      "U123",
      "CEO Partner รายงานประจำวัน\n\nสรุปเมื่อวาน: AI summary\n\nสิ่งที่ควรทำวันนี้:\n1. Action one\n\nไอเดียคอนเทนต์:\n1. Content one\n\nคำแนะนำโฆษณา:\n1. Ad one\n\nแนวโน้ม Inbox: Inbox trend\n\nPriority: Priority one"
    ]
  ]);
});

test("createStorage exposes query-backed methods", () => {
  const storage = createStorage("postgresql://user:password@example.neon.tech/db?sslmode=require");

  assert.equal(typeof storage.saveSnapshot, "function");
  assert.equal(typeof storage.getDefaultLineTarget, "function");
});
