import { Readable } from "node:stream";
import { google } from "googleapis";
import { createGraphicDeckBuffer } from "./graphicDeck.js";

const GOOGLE_WORKSPACE_SCOPES = [
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/presentations",
  "https://www.googleapis.com/auth/tasks"
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

function normalizeOptionalDateTime(value, fieldName) {
  if (!value) {
    return undefined;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} must be an ISO date-time string.`);
  }
  return date.toISOString();
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

const SLIDE = {
  width: 720,
  height: 405,
  colors: {
    ink: { red: 0.06, green: 0.09, blue: 0.13 },
    muted: { red: 0.36, green: 0.42, blue: 0.5 },
    paper: { red: 0.97, green: 0.98, blue: 0.96 },
    white: { red: 1, green: 1, blue: 1 },
    blue: { red: 0.12, green: 0.28, blue: 0.62 },
    teal: { red: 0.02, green: 0.48, blue: 0.47 },
    amber: { red: 0.92, green: 0.58, blue: 0.14 },
    green: { red: 0.13, green: 0.52, blue: 0.34 },
    red: { red: 0.82, green: 0.22, blue: 0.22 },
    line: { red: 0.86, green: 0.89, blue: 0.91 }
  }
};

const CHART_COLORS = [
  { red: 0.12, green: 0.28, blue: 0.62 },
  { red: 0.02, green: 0.48, blue: 0.47 },
  { red: 0.92, green: 0.58, blue: 0.14 },
  { red: 0.51, green: 0.22, blue: 0.73 },
  { red: 0.13, green: 0.52, blue: 0.34 }
];

function buildChartSpec({ chartType = "COLUMN", title, headers, rowCount, sheetId }) {
  if (headers.length < 2 || rowCount < 1) {
    return null;
  }

  const series = headers.slice(1).map((_, index) => ({
    series: {
      sourceRange: {
        sources: [
          {
            sheetId,
            startRowIndex: 1,
            endRowIndex: rowCount + 1,
            startColumnIndex: index + 1,
            endColumnIndex: index + 2
          }
        ]
      }
    },
    targetAxis: "LEFT_AXIS",
    color: CHART_COLORS[index % CHART_COLORS.length]
  }));

  return {
    spec: {
      title: title || "CEO Partner Chart",
      basicChart: {
        chartType,
        legendPosition: headers.length > 2 ? "BOTTOM_LEGEND" : "NO_LEGEND",
        axis: [
          { position: "BOTTOM_AXIS", title: headers[0] },
          { position: "LEFT_AXIS", title: headers.slice(1).join(" / ") }
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
        series,
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

function ptSize(width, height) {
  return {
    width: { magnitude: width, unit: "PT" },
    height: { magnitude: height, unit: "PT" }
  };
}

function ptTransform(x, y) {
  return { scaleX: 1, scaleY: 1, translateX: x, translateY: y, unit: "PT" };
}

function solidFill(color) {
  return { solidFill: { color: { rgbColor: color } } };
}

function objectId(prefix, index, suffix = "") {
  return `${prefix}_${index}${suffix ? `_${suffix}` : ""}`.replace(/[^A-Za-z0-9_]/g, "_").slice(0, 45);
}

function textBoxRequests({ pageObjectId, objectId: id, text, x, y, width, height, fontSize = 16, color = SLIDE.colors.ink, bold = false }) {
  const safeText = String(text || "");
  if (!safeText) {
    return [];
  }
  return [
    {
      createShape: {
        objectId: id,
        shapeType: "TEXT_BOX",
        elementProperties: {
          pageObjectId,
          size: ptSize(width, height),
          transform: ptTransform(x, y)
        }
      }
    },
    { insertText: { objectId: id, text: safeText, insertionIndex: 0 } },
    {
      updateTextStyle: {
        objectId: id,
        textRange: { type: "ALL" },
        style: {
          fontSize: { magnitude: fontSize, unit: "PT" },
          foregroundColor: { opaqueColor: { rgbColor: color } },
          bold
        },
        fields: "fontSize,foregroundColor,bold"
      }
    }
  ];
}

function rectangleRequests({ pageObjectId, objectId: id, x, y, width, height, fillColor = SLIDE.colors.white, lineColor = SLIDE.colors.line }) {
  return [
    {
      createShape: {
        objectId: id,
        shapeType: "ROUND_RECTANGLE",
        elementProperties: {
          pageObjectId,
          size: ptSize(width, height),
          transform: ptTransform(x, y)
        }
      }
    },
    {
      updateShapeProperties: {
        objectId: id,
        shapeProperties: {
          shapeBackgroundFill: solidFill(fillColor),
          outline: { outlineFill: solidFill(lineColor), weight: { magnitude: 0.7, unit: "PT" } }
        },
        fields: "shapeBackgroundFill,outline"
      }
    }
  ];
}

function backgroundRequests(pageObjectId, color = SLIDE.colors.paper) {
  return [
    {
      updatePageProperties: {
        objectId: pageObjectId,
        pageProperties: { pageBackgroundFill: solidFill(color) },
        fields: "pageBackgroundFill"
      }
    }
  ];
}

function addFooterRequests(requests, pageObjectId, index) {
  requests.push(
    ...textBoxRequests({
      pageObjectId,
      objectId: objectId("footer", index),
      text: `CEO Partner  |  ${String(index).padStart(2, "0")}`,
      x: 50,
      y: 374,
      width: 620,
      height: 18,
      fontSize: 8,
      color: SLIDE.colors.muted
    })
  );
}

function addKpiCards(requests, pageObjectId, metrics = [], slideIndex) {
  const cards = metrics.slice(0, 4);
  cards.forEach((metric, index) => {
    const x = 50 + index * 155;
    const cardId = objectId("kpi_card", slideIndex, index);
    requests.push(...rectangleRequests({ pageObjectId, objectId: cardId, x, y: 156, width: 136, height: 92 }));
    requests.push(
      ...textBoxRequests({
        pageObjectId,
        objectId: objectId("kpi_value", slideIndex, index),
        text: metric.value || metric.metric || "",
        x: x + 14,
        y: 174,
        width: 108,
        height: 26,
        fontSize: 20,
        color: CHART_COLORS[index % CHART_COLORS.length],
        bold: true
      }),
      ...textBoxRequests({
        pageObjectId,
        objectId: objectId("kpi_label", slideIndex, index),
        text: metric.label || metric.name || "",
        x: x + 14,
        y: 206,
        width: 108,
        height: 32,
        fontSize: 10,
        color: SLIDE.colors.muted
      })
    );
  });
}

function normalizeChartData(chartData = {}) {
  const categories = Array.isArray(chartData.categories) ? chartData.categories : [];
  const series = Array.isArray(chartData.series) ? chartData.series : [];
  return {
    title: chartData.title || "",
    categories: categories.map((category) => String(category)),
    series: series
      .map((item, index) => ({
        name: item.name || `Series ${index + 1}`,
        values: Array.isArray(item.values) ? item.values.map((value) => Number(value) || 0) : [],
        color: CHART_COLORS[index % CHART_COLORS.length]
      }))
      .filter((item) => item.values.length)
  };
}

function addBarChartRequests(requests, pageObjectId, chartData = {}, slideIndex) {
  const chart = normalizeChartData(chartData);
  const values = chart.series[0]?.values || [];
  if (!chart.categories.length || !values.length) {
    return;
  }
  const max = Math.max(...values, 1);
  const chartX = 60;
  const chartY = 150;
  const chartW = 390;
  const rowH = Math.min(34, 180 / values.length);
  requests.push(
    ...textBoxRequests({
      pageObjectId,
      objectId: objectId("chart_title", slideIndex),
      text: chart.title || "Trend",
      x: chartX,
      y: 118,
      width: chartW,
      height: 24,
      fontSize: 13,
      color: SLIDE.colors.ink,
      bold: true
    })
  );
  values.slice(0, 6).forEach((value, index) => {
    const y = chartY + index * rowH;
    const barWidth = Math.max(8, Math.round((value / max) * 245));
    requests.push(
      ...textBoxRequests({
        pageObjectId,
        objectId: objectId("bar_label", slideIndex, index),
        text: chart.categories[index] || `Item ${index + 1}`,
        x: chartX,
        y: y - 1,
        width: 110,
        height: 18,
        fontSize: 9,
        color: SLIDE.colors.muted
      }),
      ...rectangleRequests({
        pageObjectId,
        objectId: objectId("bar", slideIndex, index),
        x: chartX + 118,
        y,
        width: barWidth,
        height: 13,
        fillColor: chart.series[0].color,
        lineColor: chart.series[0].color
      }),
      ...textBoxRequests({
        pageObjectId,
        objectId: objectId("bar_value", slideIndex, index),
        text: String(value),
        x: chartX + 128 + barWidth,
        y: y - 2,
        width: 60,
        height: 16,
        fontSize: 9,
        color: SLIDE.colors.ink,
        bold: true
      })
    );
  });
}

function addInsightRail(requests, pageObjectId, slide = {}, slideIndex) {
  const items = Array.isArray(slide.bullets) ? slide.bullets : String(slide.body || "").split("\n").filter(Boolean);
  requests.push(...rectangleRequests({ pageObjectId, objectId: objectId("rail", slideIndex), x: 485, y: 116, width: 174, height: 214, fillColor: SLIDE.colors.ink, lineColor: SLIDE.colors.ink }));
  requests.push(
    ...textBoxRequests({
      pageObjectId,
      objectId: objectId("rail_title", slideIndex),
      text: "Key moves",
      x: 504,
      y: 134,
      width: 138,
      height: 24,
      fontSize: 13,
      color: SLIDE.colors.white,
      bold: true
    })
  );
  items.slice(0, 4).forEach((item, index) => {
    requests.push(
      ...textBoxRequests({
        pageObjectId,
        objectId: objectId("rail_item", slideIndex, index),
        text: `${index + 1}. ${item}`,
        x: 504,
        y: 170 + index * 38,
        width: 132,
        height: 32,
        fontSize: 9,
        color: SLIDE.colors.white
      })
    );
  });
}

function addActionList(requests, pageObjectId, slide = {}, slideIndex) {
  const items = Array.isArray(slide.bullets) ? slide.bullets : String(slide.body || "").split("\n").filter(Boolean);
  items.slice(0, 5).forEach((item, index) => {
    const y = 128 + index * 43;
    requests.push(...rectangleRequests({ pageObjectId, objectId: objectId("step_box", slideIndex, index), x: 70, y, width: 540, height: 30, fillColor: SLIDE.colors.white, lineColor: SLIDE.colors.line }));
    requests.push(
      ...textBoxRequests({
        pageObjectId,
        objectId: objectId("step_num", slideIndex, index),
        text: String(index + 1),
        x: 84,
        y: y + 6,
        width: 20,
        height: 18,
        fontSize: 11,
        color: CHART_COLORS[index % CHART_COLORS.length],
        bold: true
      }),
      ...textBoxRequests({
        pageObjectId,
        objectId: objectId("step_text", slideIndex, index),
        text: item,
        x: 112,
        y: y + 6,
        width: 470,
        height: 18,
        fontSize: 10,
        color: SLIDE.colors.ink
      })
    );
  });
}

function inferSlideLayout(slide = {}, index = 0) {
  if (Array.isArray(slide.metrics) && slide.metrics.length) {
    return "kpi";
  }
  if (slide.chartData?.categories?.length && slide.chartData?.series?.length) {
    return "chart";
  }
  if (index >= 2 || /action|plan|next|todo|recommend/i.test(`${slide.title || ""} ${slide.body || ""}`)) {
    return "action";
  }
  return "insight";
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

async function createPresentationFromPptx({ drive, title, folderId, buffer }) {
  const createResponse = await drive.files.create({
    requestBody: {
      name: title,
      mimeType: "application/vnd.google-apps.presentation",
      ...(folderId ? { parents: [folderId] } : {})
    },
    media: {
      mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      body: Readable.from(buffer)
    },
    fields: "id,name,webViewLink"
  });
  const presentationId = createResponse.data.id;
  if (!presentationId) {
    throw new Error("Google Drive API did not return a presentation id.");
  }
  return {
    presentationId,
    url: createResponse.data.webViewLink || `https://docs.google.com/presentation/d/${presentationId}/edit`
  };
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
  const tasks = googleApi.tasks({ version: "v1", auth });
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

    async createTask({ title, notes = "", dueDateTime, taskListId } = {}) {
      if (!title) {
        throw new Error("Task title is required.");
      }

      const resolvedTaskListId = taskListId || workspace.tasksListId || "@default";
      const taskResponse = await tasks.tasks.insert({
        tasklist: resolvedTaskListId,
        requestBody: {
          title,
          notes,
          ...(dueDateTime ? { due: normalizeOptionalDateTime(dueDateTime, "dueDateTime") } : {})
        }
      });

      return {
        taskId: taskResponse.data.id,
        title: taskResponse.data.title || title,
        notes: taskResponse.data.notes || notes,
        due: taskResponse.data.due || "",
        status: taskResponse.data.status || "",
        url: taskResponse.data.webViewLink || "",
        taskListId: resolvedTaskListId
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
            cell: {
              userEnteredFormat: {
                textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
                backgroundColor: SLIDE.colors.blue
              }
            },
            fields: "userEnteredFormat(textFormat,backgroundColor)"
          }
        },
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 1, endRowIndex: rows.length + 1, startColumnIndex: 0, endColumnIndex: headers.length },
            cell: {
              userEnteredFormat: {
                borders: {
                  bottom: { style: "SOLID", width: 1, color: SLIDE.colors.line }
                }
              }
            },
            fields: "userEnteredFormat.borders"
          }
        },
        {
          addBanding: {
            bandedRange: {
              range: { sheetId, startRowIndex: 0, endRowIndex: rows.length + 1, startColumnIndex: 0, endColumnIndex: headers.length },
              rowProperties: {
                headerColor: SLIDE.colors.blue,
                firstBandColor: SLIDE.colors.white,
                secondBandColor: { red: 0.94, green: 0.97, blue: 0.98 }
              }
            }
          }
        },
        {
          updateSheetProperties: {
            properties: {
              sheetId,
              gridProperties: { frozenRowCount: 1 }
            },
            fields: "gridProperties.frozenRowCount"
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

      const deckBuffer = await createGraphicDeckBuffer({ title, subtitle, slides: slideItems });
      const { presentationId, url } = await createPresentationFromPptx({
        drive,
        title,
        folderId: workspace.docsFolderId,
        buffer: deckBuffer
      });
      await shareDocument({ drive, fileId: presentationId, email: workspace.shareEmail });

      return {
        presentationId,
        title,
        url,
        slideCount: Math.min(slideItems.length, 10) + 1,
        generatedWith: "pptxgenjs"
      };
    }
  };
}
