import { google } from "googleapis";

const GOOGLE_WORKSPACE_SCOPES = [
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/drive.file"
];

function normalizePrivateKey(privateKey = "") {
  return privateKey.replace(/\\n/g, "\n");
}

function requireWorkspaceConfig(config) {
  const workspace = config.google?.workspace || {};
  if (!workspace.serviceAccountEmail || !workspace.serviceAccountPrivateKey) {
    throw new Error(
      "Google Workspace is not configured. Set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY."
    );
  }
  return workspace;
}

function createAuth(config, googleApi = google) {
  const workspace = requireWorkspaceConfig(config);
  return new googleApi.auth.JWT({
    email: workspace.serviceAccountEmail,
    key: normalizePrivateKey(workspace.serviceAccountPrivateKey),
    scopes: GOOGLE_WORKSPACE_SCOPES,
    subject: workspace.impersonatedUser || undefined
  });
}

function addDuration(startDateTime, durationMinutes = 60) {
  const start = new Date(startDateTime);
  if (Number.isNaN(start.getTime())) {
    throw new Error("startDateTime must be an ISO date-time string.");
  }
  return new Date(start.getTime() + Number(durationMinutes || 60) * 60 * 1000).toISOString();
}

async function moveDocumentToFolder({ drive, fileId, folderId }) {
  if (!folderId) {
    return;
  }
  await drive.files.update({
    fileId,
    addParents: folderId,
    fields: "id,parents"
  });
}

async function createDocumentFile({ drive, title, folderId }) {
  const createResponse = await drive.files.create({
    requestBody: {
      name: title,
      mimeType: "application/vnd.google-apps.document",
      ...(folderId ? { parents: [folderId] } : {})
    },
    fields: "id,name"
  });
  const documentId = createResponse.data.id;
  if (!documentId) {
    throw new Error("Google Drive API did not return a document id.");
  }
  return documentId;
}

async function shareDocument({ drive, fileId, email }) {
  if (!email) {
    return;
  }
  await drive.permissions.create({
    fileId,
    sendNotificationEmail: false,
    requestBody: {
      type: "user",
      role: "writer",
      emailAddress: email
    }
  });
}

export function createGoogleWorkspaceClient({ config, googleApi = google } = {}) {
  const auth = createAuth(config, googleApi);
  const docs = googleApi.docs({ version: "v1", auth });
  const calendar = googleApi.calendar({ version: "v3", auth });
  const drive = googleApi.drive({ version: "v3", auth });
  const workspace = config.google.workspace;

  return {
    async createDocument({ title, content = "" }) {
      if (!title) {
        throw new Error("Document title is required.");
      }

      const documentId = await createDocumentFile({ drive, title, folderId: workspace.docsFolderId });

      const trimmedContent = String(content || "").trim();
      if (trimmedContent) {
        await docs.documents.batchUpdate({
          documentId,
          requestBody: {
            requests: [
              {
                insertText: {
                  location: { index: 1 },
                  text: trimmedContent.endsWith("\n") ? trimmedContent : `${trimmedContent}\n`
                }
              }
            ]
          }
        });
      }

      await shareDocument({ drive, fileId: documentId, email: workspace.shareEmail });

      return {
        documentId,
        title,
        url: `https://docs.google.com/document/d/${documentId}/edit`,
        sharedWith: workspace.shareEmail || ""
      };
    },

    async createCalendarEvent({
      summary,
      description = "",
      startDateTime,
      endDateTime,
      durationMinutes = 60,
      timeZone,
      location = "",
      attendees = []
    }) {
      if (!summary) {
        throw new Error("Event summary is required.");
      }
      if (!startDateTime) {
        throw new Error("startDateTime is required.");
      }

      const calendarId = config.google.workspace.calendarId || "primary";
      const resolvedTimeZone = timeZone || config.timezone || "Asia/Bangkok";
      const resolvedEndDateTime = endDateTime || addDuration(startDateTime, durationMinutes);
      const eventResponse = await calendar.events.insert({
        calendarId,
        requestBody: {
          summary,
          description,
          location,
          start: {
            dateTime: startDateTime,
            timeZone: resolvedTimeZone
          },
          end: {
            dateTime: resolvedEndDateTime,
            timeZone: resolvedTimeZone
          },
          attendees: (attendees || []).filter(Boolean).map((email) => ({ email }))
        }
      });

      return {
        eventId: eventResponse.data.id,
        summary: eventResponse.data.summary || summary,
        start: eventResponse.data.start?.dateTime || startDateTime,
        end: eventResponse.data.end?.dateTime || resolvedEndDateTime,
        url: eventResponse.data.htmlLink || "",
        calendarId
      };
    }
  };
}
