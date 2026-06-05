import test from "node:test";
import assert from "node:assert/strict";

import { createGoogleWorkspaceClient } from "../src/googleWorkspaceClient.js";
import { buildCeoPartnerFunctionDeclarations, createCeoPartnerTools } from "../src/aiTools.js";

function workspaceConfig(overrides = {}) {
  return {
    timezone: "Asia/Bangkok",
    google: {
      workspace: {
        serviceAccountEmail: "service@example.iam.gserviceaccount.com",
        serviceAccountPrivateKey: "-----BEGIN PRIVATE KEY-----\\nkey\\n-----END PRIVATE KEY-----",
        calendarId: "primary",
        docsFolderId: "folder-1",
        shareEmail: "owner@example.com",
        ...overrides
      }
    }
  };
}

test("Google Workspace client prefers OAuth refresh token when configured", async () => {
  const calls = [];
  const googleApi = {
    auth: {
      OAuth2: class {
        constructor(clientId, clientSecret, redirectUri) {
          calls.push(["oauth", clientId, Boolean(clientSecret), redirectUri]);
        }

        setCredentials(credentials) {
          calls.push(["credentials", credentials.refresh_token]);
        }
      },
      JWT: class {
        constructor() {
          calls.push(["jwt"]);
        }
      }
    },
    docs: ({ auth }) => {
      calls.push(["docs", Boolean(auth)]);
      return {
        documents: {
          batchUpdate: async () => {}
        }
      };
    },
    sheets: () => ({
      spreadsheets: {
        create: async () => ({ data: { spreadsheetId: "sheet-oauth", sheets: [{ properties: { sheetId: 123 } }] } }),
        values: { update: async () => ({}) },
        batchUpdate: async () => ({})
      }
    }),
    slides: () => ({
      presentations: {
        create: async () => ({ data: { presentationId: "slides-oauth" } }),
        batchUpdate: async () => ({})
      }
    }),
    drive: () => ({
      files: {
        create: async () => ({ data: { id: "doc-oauth" } })
      },
      permissions: {
        create: async () => {}
      }
    }),
    calendar: () => ({
      events: {
        insert: async () => ({ data: {} })
      }
    }),
    tasks: () => ({
      tasks: {
        insert: async () => ({ data: {} })
      }
    })
  };

  const client = createGoogleWorkspaceClient({
    config: workspaceConfig({
      oauthClientId: "client-id",
      oauthClientSecret: "client-secret",
      oauthRedirectUri: "http://127.0.0.1:53682/oauth2callback",
      oauthRefreshToken: "refresh-token"
    }),
    googleApi
  });
  await client.createDocument({ title: "OAuth Doc", content: "" });

  assert.deepEqual(calls.slice(0, 3), [
    ["oauth", "client-id", true, "http://127.0.0.1:53682/oauth2callback"],
    ["credentials", "refresh-token"],
    ["docs", true]
  ]);
  assert.ok(!calls.some(([name]) => name === "jwt"));
});

test("Google Workspace client creates a document and shares it when configured", async () => {
  const calls = [];
  const googleApi = {
    auth: {
      JWT: class {
        constructor(options) {
          calls.push(["auth", options.email, options.key.includes("\n")]);
        }
      }
    },
    docs: () => ({
      documents: {
        batchUpdate: async ({ documentId, requestBody }) => {
          calls.push(["docs.batchUpdate", documentId, requestBody.requests[0].insertText.text]);
        }
      }
    }),
    drive: () => ({
      files: {
        create: async ({ requestBody }) => {
          calls.push(["drive.create", requestBody.name, requestBody.mimeType, requestBody.parents[0]]);
          return { data: { id: "doc-123" } };
        },
        update: async ({ fileId, addParents }) => calls.push(["drive.update", fileId, addParents])
      },
      permissions: {
        create: async ({ fileId, requestBody }) => calls.push(["drive.share", fileId, requestBody.emailAddress])
      }
    }),
    sheets: () => ({
      spreadsheets: {
        create: async () => ({ data: { spreadsheetId: "sheet-1", sheets: [{ properties: { sheetId: 123 } }] } }),
        values: { update: async () => ({}) },
        batchUpdate: async () => ({})
      }
    }),
    slides: () => ({
      presentations: {
        create: async () => ({ data: { presentationId: "slides-1" } }),
        batchUpdate: async () => ({})
      }
    }),
    calendar: () => ({
      events: {
        insert: async () => ({ data: {} })
      }
    }),
    tasks: () => ({
      tasks: {
        insert: async () => ({ data: {} })
      }
    })
  };

  const client = createGoogleWorkspaceClient({ config: workspaceConfig(), googleApi });
  const result = await client.createDocument({ title: "Proposal", content: "Hello" });

  assert.equal(result.documentId, "doc-123");
  assert.equal(result.url, "https://docs.google.com/document/d/doc-123/edit");
  assert.deepEqual(calls, [
    ["auth", "service@example.iam.gserviceaccount.com", true],
    ["drive.create", "Proposal", "application/vnd.google-apps.document", "folder-1"],
    ["docs.batchUpdate", "doc-123", "Hello\n"],
    ["drive.share", "doc-123", "owner@example.com"]
  ]);
});

test("Google Workspace client creates a calendar event with default duration", async () => {
  let eventRequest;
  const googleApi = {
    auth: {
      JWT: class {}
    },
    docs: () => ({ documents: {} }),
    drive: () => ({ files: {}, permissions: {} }),
    sheets: () => ({ spreadsheets: {} }),
    slides: () => ({ presentations: {} }),
    tasks: () => ({ tasks: { insert: async () => ({ data: {} }) } }),
    calendar: () => ({
      events: {
        insert: async (request) => {
          eventRequest = request;
          return {
            data: {
              id: "event-1",
              summary: request.requestBody.summary,
              start: request.requestBody.start,
              end: request.requestBody.end,
              htmlLink: "https://calendar.google.com/event?eid=1"
            }
          };
        }
      }
    })
  };

  const client = createGoogleWorkspaceClient({ config: workspaceConfig(), googleApi });
  const result = await client.createCalendarEvent({
    summary: "Install appointment",
    startDateTime: "2026-06-03T10:00:00+07:00",
    durationMinutes: 90
  });

  assert.equal(eventRequest.calendarId, "primary");
  assert.equal(eventRequest.requestBody.start.timeZone, "Asia/Bangkok");
  assert.equal(eventRequest.requestBody.end.dateTime, "2026-06-03T04:30:00.000Z");
  assert.equal(result.eventId, "event-1");
  assert.equal(result.url, "https://calendar.google.com/event?eid=1");
});

test("Google Workspace client creates a Google Task with default task list", async () => {
  let taskRequest;
  const googleApi = {
    auth: {
      JWT: class {}
    },
    docs: () => ({ documents: {} }),
    drive: () => ({ files: {}, permissions: {} }),
    sheets: () => ({ spreadsheets: {} }),
    slides: () => ({ presentations: {} }),
    calendar: () => ({ events: {} }),
    tasks: () => ({
      tasks: {
        insert: async (request) => {
          taskRequest = request;
          return {
            data: {
              id: "task-1",
              title: request.requestBody.title,
              notes: request.requestBody.notes,
              due: request.requestBody.due,
              status: "needsAction"
            }
          };
        }
      }
    })
  };

  const client = createGoogleWorkspaceClient({ config: workspaceConfig({ tasksListId: "default-list" }), googleApi });
  const result = await client.createTask({
    title: "Follow up Tesla lead",
    notes: "Send film package quote.",
    dueDateTime: "2026-06-06T09:00:00+07:00"
  });

  assert.equal(taskRequest.tasklist, "default-list");
  assert.equal(taskRequest.requestBody.title, "Follow up Tesla lead");
  assert.equal(taskRequest.requestBody.due, "2026-06-06T02:00:00.000Z");
  assert.equal(result.taskId, "task-1");
  assert.equal(result.status, "needsAction");
});

test("Google Workspace tools expose document and calendar handlers", async () => {
  const declarations = buildCeoPartnerFunctionDeclarations();
  const workspaceClient = {
    createDocument: async ({ title }) => ({ documentId: "doc-1", title }),
    createCalendarEvent: async ({ summary }) => ({ eventId: "event-1", summary }),
    createTask: async ({ title }) => ({ taskId: "task-1", title }),
    createSpreadsheetReport: async ({ title }) => ({ spreadsheetId: "sheet-1", title }),
    createSlideReport: async ({ title }) => ({ presentationId: "slides-1", title })
  };
  const tools = createCeoPartnerTools({
    config: workspaceConfig(),
    storage: {},
    workspaceClient
  });

  assert.ok(declarations.some((declaration) => declaration.name === "create_google_doc"));
  assert.ok(declarations.some((declaration) => declaration.name === "create_calendar_event"));
  assert.ok(declarations.some((declaration) => declaration.name === "create_google_task"));
  assert.ok(declarations.some((declaration) => declaration.name === "create_google_sheet_report"));
  assert.ok(declarations.some((declaration) => declaration.name === "create_google_slides_report"));
  assert.deepEqual(await tools.handlers.create_google_doc({ title: "Doc", content: "Body" }), {
    documentId: "doc-1",
    title: "Doc"
  });
  assert.deepEqual(await tools.handlers.create_calendar_event({ summary: "Meeting", startDateTime: "2026-06-03T10:00:00+07:00" }), {
    eventId: "event-1",
    summary: "Meeting"
  });
  assert.deepEqual(await tools.handlers.create_google_task({ title: "Follow up lead" }), {
    taskId: "task-1",
    title: "Follow up lead"
  });
  assert.deepEqual(await tools.handlers.create_google_sheet_report({ title: "Sheet", headers: ["A"], rows: [["B"]] }), {
    spreadsheetId: "sheet-1",
    title: "Sheet"
  });
  assert.deepEqual(await tools.handlers.create_google_slides_report({ title: "Slides", slides: [] }), {
    presentationId: "slides-1",
    title: "Slides"
  });
});

test("Google Workspace client creates a spreadsheet report with a chart", async () => {
  const calls = [];
  let chartRequest;
  const googleApi = {
    auth: { JWT: class {} },
    docs: () => ({ documents: {} }),
    calendar: () => ({ events: {} }),
    tasks: () => ({ tasks: { insert: async () => ({ data: {} }) } }),
    drive: () => ({
      files: { update: async ({ fileId, addParents }) => calls.push(["drive.update", fileId, addParents]) },
      permissions: { create: async ({ fileId }) => calls.push(["drive.share", fileId]) }
    }),
    sheets: () => ({
      spreadsheets: {
        create: async ({ requestBody }) => {
          calls.push(["sheets.create", requestBody.properties.title]);
          return { data: { spreadsheetId: "sheet-123", sheets: [{ properties: { sheetId: 123 } }] } };
        },
        values: {
          update: async ({ spreadsheetId, range, requestBody }) => {
            calls.push(["sheets.values.update", spreadsheetId, range, requestBody.values.length]);
          }
        },
        batchUpdate: async ({ spreadsheetId, requestBody }) => {
          chartRequest = requestBody.requests.find((request) => request.addChart);
          calls.push(["sheets.batchUpdate", spreadsheetId, requestBody.requests.some((request) => request.addChart)]);
        }
      }
    }),
    slides: () => ({ presentations: {} })
  };
  const client = createGoogleWorkspaceClient({ config: workspaceConfig(), googleApi });
  const result = await client.createSpreadsheetReport({
    title: "Ad Report",
    headers: ["Day", "Leads", "Reach"],
    rows: [["Mon", 10, 1000], ["Tue", 12, 1200]],
    chartType: "COLUMN"
  });

  assert.equal(result.spreadsheetId, "sheet-123");
  assert.equal(result.chartCreated, true);
  assert.equal(chartRequest.addChart.chart.spec.basicChart.series.length, 2);
  assert.deepEqual(calls, [
    ["sheets.create", "Ad Report"],
    ["sheets.values.update", "sheet-123", "Report!A1:C3", 3],
    ["sheets.batchUpdate", "sheet-123", true],
    ["drive.update", "sheet-123", "folder-1"],
    ["drive.share", "sheet-123"]
  ]);
});

test("Google Workspace client creates a slide report", async () => {
  const calls = [];
  let uploadedMedia;
  const googleApi = {
    auth: { JWT: class {} },
    docs: () => ({ documents: {} }),
    calendar: () => ({ events: {} }),
    tasks: () => ({ tasks: { insert: async () => ({ data: {} }) } }),
    drive: () => ({
      files: {
        create: async ({ requestBody, media }) => {
          uploadedMedia = media;
          calls.push(["drive.create", requestBody.name, requestBody.mimeType, requestBody.parents[0], media.mimeType]);
          return { data: { id: "slides-123", webViewLink: "https://docs.google.com/presentation/d/slides-123/edit" } };
        },
        update: async ({ fileId, addParents }) => calls.push(["drive.update", fileId, addParents])
      },
      permissions: { create: async ({ fileId }) => calls.push(["drive.share", fileId]) }
    }),
    sheets: () => ({ spreadsheets: {} }),
    slides: () => ({
      presentations: {
        create: async () => {
          calls.push(["slides.create"]);
          return { data: { presentationId: "unused" } };
        },
        batchUpdate: async () => calls.push(["slides.batchUpdate"])
      }
    })
  };
  const client = createGoogleWorkspaceClient({ config: workspaceConfig(), googleApi });
  const result = await client.createSlideReport({
    title: "Weekly Report",
    subtitle: "CEO Partner",
    slides: [
      {
        layout: "kpi",
        title: "Performance moved through inbox and content",
        metrics: [
          { label: "Leads", value: "12" },
          { label: "Reach", value: "1.2K" }
        ],
        bullets: ["Reply inbox", "Post EV content"]
      },
      {
        layout: "chart",
        title: "Inbox demand concentrates on EV models",
        chartData: {
          title: "Question volume",
          categories: ["BYD", "AION"],
          series: [{ name: "Inbox", values: [8, 4] }]
        },
        bullets: ["Prepare BYD film answer", "Use V-Kool comparison"]
      }
    ]
  });

  assert.equal(result.presentationId, "slides-123");
  assert.equal(result.slideCount, 3);
  assert.equal(result.generatedWith, "pptxgenjs");
  assert.equal(uploadedMedia.mimeType, "application/vnd.openxmlformats-officedocument.presentationml.presentation");
  assert.deepEqual(calls, [
    [
      "drive.create",
      "Weekly Report",
      "application/vnd.google-apps.presentation",
      "folder-1",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    ],
    ["drive.share", "slides-123"]
  ]);
});

test("Google Workspace client explains missing credentials", () => {
  assert.throws(
    () => createGoogleWorkspaceClient({ config: workspaceConfig({ serviceAccountEmail: "", serviceAccountPrivateKey: "" }) }),
    /Google Workspace is not configured/
  );
});
