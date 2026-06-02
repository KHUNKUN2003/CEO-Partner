import { google } from "googleapis";

const GOOGLE_WORKSPACE_SCOPES = [
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/presentations"
];

function normalizePrivateKey(privateKey = "") {
  return privateKey.replace(/\\n/g, "\n");
}

export { GOOGLE_WORKSPACE_SCOPES };

function hasOAuthConfig(workspace = {}) {
  return workspace.oauthClientId && workspace.oauthClientSecret && workspace.oauthRedirectUri && workspace.oauthRefreshToken;
}

function requireWorkspaceConfig(config) {
  const workspace = config.google?.workspace || {};
  if (hasOAuthConfig(workspace)) {
    return workspace;
  }
  if (!workspace.serviceAccountEmail || !workspace.serviceAccountPrivateKey) {
    throw new Error(
      "Google Workspace is not configured. Set Google OAuth refresh token or service account credentials."
    );
  }
  return workspace;
}

function createAuth(config, googleApi = google) {
  const workspace = requireWorkspaceConfig(config);
  if (hasOAuthConfig(workspace)) {
    const auth = new googleApi.auth.OAuth2(
      workspace.oauthClientId,
      workspace.oauthClientSecret,
      workspace.oauthRedirectUri
    );
    auth.setCredentials({ refresh_token: workspace.oauthRefreshToken });
    return auth;
  }

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

function normalizeTableRows(headers = [], rows = []) {
  return [
    headers.map((header) => String(header)),
    ...rows.map((row) =>
      Array.isArray(row) ? row.map((cell) => cell ?? "") : headers.map((header) => row?.[header] ?? "")
    )
  ];
}

function columnLetter(index) {
  let column = "";
  let n = index + 1;
  while (n > 0) {
    const remainder = (n - 1) % 26;
    column = String.fromCharCode(65 + remainder) + column;
    n = Math.floor((n - 1) / 26);
  }
  return column;
}

function buildChartSpec({ chartType = "COLUMN", title, headers, rowCount, sheetId }) {
  if (headers.length < 2 || rowCount < 1) {
    return null;
  }

  return {
    spec: {
      title: title || "CEO Partner Chart",
      basicChart: {
        chartType,
        legendPosition: "BOTTOM_LEGEND",
        axis: [
          { position: "BOTTOM_AXIS", title: headers[0] },
          { position: "LEFT_AXIS", title: headers[1] }
        ],
        domains: [
          {
            domain: {
              sourceRange: {
                sources: [{ sheetId, startRowIndex: 1, endRowIndex: rowCount + 1, startColumnIndex: 0, endColumnIndex: 1 }]
              }
            }
          }
        ],
        series: [
          {
            series: {
              sourceRange: {
                sources: [{ sheetId, startRowIndex: 1, endRowIndex: rowCount + 1, startColumnIndex: 1, endColumnIndex: 2 }]
              }
            },
            targetAxis: "LEFT_AXIS"
          }
        ],
        headerCount: 0
      }
    },
    position: {
      overlayPosition: {
        anchorCell: {
          sheetId,
          rowIndex: 1,
          columnIndex: Math.max(headers.length + 1, 4)
        },
        widthPixels: 720,
        heightPixels: 420
      }
    }
  };
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
  const sheets = googleApi.sheets({ version: "v4", auth });
  const slides = googleApi.slides({ version: "v1", auth });
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
    },

    async createSpreadsheetReport({ title, headers = [], rows = [], chartType = "COLUMN", chartTitle = "" }) {
      if (!title) {
        throw new Error("Spreadsheet title is required.");
      }
      if (!headers.length) {
        throw new Error("Spreadsheet headers are required.");
      }

      const spreadsheetResponse = await sheets.spreadsheets.create({
        requestBody: {
          properties: { title },
          sheets: [{ properties: { title: "Report" } }]
        }
      });
      const spreadsheetId = spreadsheetResponse.data.spreadsheetId;
      const sheetId = spreadsheetResponse.data.sheets?.[0]?.properties?.sheetId;
      if (!spreadsheetId) {
        throw new Error("Google Sheets API did not return spreadsheetId.");
      }
      if (sheetId === undefined || sheetId === null) {
        throw new Error("Google Sheets API did not return a sheetId.");
      }

      const values = normalizeTableRows(headers, rows);
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Report!A1:${columnLetter(headers.length - 1)}${values.length}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values }
      });

      const requests = [
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
            cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.9, green: 0.95, blue: 1 } } },
            fields: "userEnteredFormat(textFormat,backgroundColor)"
          }
        },
        {
          autoResizeDimensions: {
            dimensions: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: headers.length }
          }
        }
      ];
      const chartSpec = buildChartSpec({ chartType, title: chartTitle || title, headers, rowCount: rows.length, sheetId });
      if (chartSpec) {
        requests.push({ addChart: { chart: chartSpec } });
      }
      await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });

      await moveDocumentToFolder({ drive, fileId: spreadsheetId, folderId: workspace.docsFolderId });
      await shareDocument({ drive, fileId: spreadsheetId, email: workspace.shareEmail });

      return {
        spreadsheetId,
        title,
        url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
        chartCreated: Boolean(chartSpec)
      };
    },

    async createSlideReport({ title, subtitle = "", slides: slideItems = [] }) {
      if (!title) {
        throw new Error("Presentation title is required.");
      }

      const presentationResponse = await slides.presentations.create({
        requestBody: { title }
      });
      const presentationId = presentationResponse.data.presentationId;
      if (!presentationId) {
        throw new Error("Google Slides API did not return presentationId.");
      }

      const requests = [];
      requests.push({
        createSlide: {
          objectId: "title_slide",
          insertionIndex: "0",
          slideLayoutReference: { predefinedLayout: "BLANK" }
        }
      });
      requests.push({
        createShape: {
          objectId: "title_box",
          shapeType: "TEXT_BOX",
          elementProperties: {
            pageObjectId: "title_slide",
            size: { width: { magnitude: 620, unit: "PT" }, height: { magnitude: 100, unit: "PT" } },
            transform: { scaleX: 1, scaleY: 1, translateX: 70, translateY: 140, unit: "PT" }
          }
        }
      });
      requests.push({ insertText: { objectId: "title_box", text: title, insertionIndex: 0 } });
      if (subtitle) {
        requests.push({
          createShape: {
            objectId: "subtitle_box",
            shapeType: "TEXT_BOX",
            elementProperties: {
              pageObjectId: "title_slide",
              size: { width: { magnitude: 560, unit: "PT" }, height: { magnitude: 80, unit: "PT" } },
              transform: { scaleX: 1, scaleY: 1, translateX: 80, translateY: 250, unit: "PT" }
            }
          }
        });
        requests.push({ insertText: { objectId: "subtitle_box", text: subtitle, insertionIndex: 0 } });
      }

      slideItems.slice(0, 10).forEach((slide, index) => {
        const slideId = `content_slide_${index + 1}`;
        const titleBoxId = `content_title_${index + 1}`;
        const bodyBoxId = `content_body_${index + 1}`;
        requests.push({
          createSlide: {
            objectId: slideId,
            slideLayoutReference: { predefinedLayout: "BLANK" }
          }
        });
        requests.push({
          createShape: {
            objectId: titleBoxId,
            shapeType: "TEXT_BOX",
            elementProperties: {
              pageObjectId: slideId,
              size: { width: { magnitude: 600, unit: "PT" }, height: { magnitude: 50, unit: "PT" } },
              transform: { scaleX: 1, scaleY: 1, translateX: 50, translateY: 40, unit: "PT" }
            }
          }
        });
        requests.push({ insertText: { objectId: titleBoxId, text: slide.title || `Slide ${index + 1}`, insertionIndex: 0 } });
        requests.push({
          createShape: {
            objectId: bodyBoxId,
            shapeType: "TEXT_BOX",
            elementProperties: {
              pageObjectId: slideId,
              size: { width: { magnitude: 620, unit: "PT" }, height: { magnitude: 300, unit: "PT" } },
              transform: { scaleX: 1, scaleY: 1, translateX: 60, translateY: 120, unit: "PT" }
            }
          }
        });
        const body = Array.isArray(slide.bullets) ? slide.bullets.map((bullet) => `- ${bullet}`).join("\n") : slide.body || "";
        requests.push({ insertText: { objectId: bodyBoxId, text: body, insertionIndex: 0 } });
      });

      if (requests.length) {
        await slides.presentations.batchUpdate({ presentationId, requestBody: { requests } });
      }
      await moveDocumentToFolder({ drive, fileId: presentationId, folderId: workspace.docsFolderId });
      await shareDocument({ drive, fileId: presentationId, email: workspace.shareEmail });

      return {
        presentationId,
        title,
        url: `https://docs.google.com/presentation/d/${presentationId}/edit`,
        slideCount: slideItems.length + 1
      };
    }
  };
}
