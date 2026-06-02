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
    calendar: () => ({
      events: {
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

test("Google Workspace tools expose document and calendar handlers", async () => {
  const declarations = buildCeoPartnerFunctionDeclarations();
  const workspaceClient = {
    createDocument: async ({ title }) => ({ documentId: "doc-1", title }),
    createCalendarEvent: async ({ summary }) => ({ eventId: "event-1", summary })
  };
  const tools = createCeoPartnerTools({
    config: workspaceConfig(),
    storage: {},
    workspaceClient
  });

  assert.ok(declarations.some((declaration) => declaration.name === "create_google_doc"));
  assert.ok(declarations.some((declaration) => declaration.name === "create_calendar_event"));
  assert.deepEqual(await tools.handlers.create_google_doc({ title: "Doc", content: "Body" }), {
    documentId: "doc-1",
    title: "Doc"
  });
  assert.deepEqual(await tools.handlers.create_calendar_event({ summary: "Meeting", startDateTime: "2026-06-03T10:00:00+07:00" }), {
    eventId: "event-1",
    summary: "Meeting"
  });
});

test("Google Workspace client explains missing credentials", () => {
  assert.throws(
    () => createGoogleWorkspaceClient({ config: workspaceConfig({ serviceAccountEmail: "", serviceAccountPrivateKey: "" }) }),
    /Google Workspace is not configured/
  );
});
