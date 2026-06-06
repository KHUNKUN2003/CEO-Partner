import { summarizeMetaSnapshot } from "./analysis.js";
import { createGoogleWorkspaceClient } from "./googleWorkspaceClient.js";
import { sendFacebookPageMessage } from "./metaClient.js";

export function buildCeoPartnerFunctionDeclarations() {
  return [
    {
      name: "get_latest_meta_snapshot",
      description:
        "Get the latest available Meta API data for the business, including page, ads, inbox, posts, photos, videos, and comments where permissions allow.",
      parameters: {
        type: "object",
        properties: {
          area: {
            type: "string",
            description: "Optional focused area to return.",
            enum: ["all", "page", "ads", "inbox", "content"]
          }
        }
      }
    },
    {
      name: "get_latest_business_report",
      description: "Get the latest CEO Partner daily business report stored in Neon.",
      parameters: {
        type: "object",
        properties: {}
      }
    },
    {
      name: "send_facebook_page_message",
      description:
        "Send a text reply from the Facebook Page to a customer in Messenger only when the owner explicitly asks to send/reply to a Facebook inbox customer. Requires a recipient PSID, or enough inbox context such as conversationId or customerName to resolve the PSID.",
      parameters: {
        type: "object",
        properties: {
          recipientId: {
            type: "string",
            description: "Facebook Page-scoped user ID (PSID) of the customer. Prefer this when available."
          },
          conversationId: {
            type: "string",
            description: "Optional Facebook conversation/thread id from the latest inbox snapshot."
          },
          customerName: {
            type: "string",
            description: "Optional customer display name from the latest inbox snapshot, used only to resolve recipientId."
          },
          text: {
            type: "string",
            description: "The exact Thai or requested-language message text to send to the customer."
          },
          messageType: {
            type: "string",
            description: "Messenger message type. RESPONSE is for replies inside the normal customer messaging window.",
            enum: ["RESPONSE", "UPDATE"]
          }
        },
        required: ["text"]
      }
    },
    {
      name: "create_google_doc",
      description:
        "Create a Google Doc only when the user explicitly asks to create, draft, save, or write a document.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Google Doc title."
          },
          content: {
            type: "string",
            description: "Plain text or markdown-like document body to insert into the new Google Doc."
          }
        },
        required: ["title", "content"]
      }
    },
    {
      name: "create_calendar_event",
      description:
        "Create a Google Calendar event only when the user explicitly asks to schedule, book, reserve, or add an appointment.",
      parameters: {
        type: "object",
        properties: {
          summary: {
            type: "string",
            description: "Event title."
          },
          description: {
            type: "string",
            description: "Optional event description."
          },
          startDateTime: {
            type: "string",
            description: "Event start as an ISO 8601 date-time string, preferably with timezone offset."
          },
          endDateTime: {
            type: "string",
            description: "Optional event end as an ISO 8601 date-time string."
          },
          durationMinutes: {
            type: "number",
            description: "Optional event duration in minutes when endDateTime is omitted."
          },
          timeZone: {
            type: "string",
            description: "IANA timezone such as Asia/Bangkok."
          },
          location: {
            type: "string",
            description: "Optional event location."
          },
          attendees: {
            type: "array",
            description: "Optional attendee email addresses.",
            items: { type: "string" }
          }
        },
        required: ["summary", "startDateTime"]
      }
    },
    {
      name: "create_google_task",
      description:
        "Create a Google Tasks task only when the user explicitly asks to add a task, to-do, reminder-style action item, follow-up item, or checklist item. Use Calendar instead when the user asks for a meeting or appointment with a start time.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Task title."
          },
          notes: {
            type: "string",
            description: "Optional task notes or context."
          },
          dueDateTime: {
            type: "string",
            description: "Optional task due date as an ISO 8601 date-time string, preferably with timezone offset."
          },
          taskListId: {
            type: "string",
            description: "Optional Google Tasks task list id. Omit to use the configured default task list."
          }
        },
        required: ["title"]
      }
    },
    {
      name: "create_google_sheet_report",
      description:
        "Create a polished Google Sheets report with tabular data and native Google Sheets charts when the user asks for a spreadsheet, chart, graph, dashboard table, or visual data report.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Spreadsheet title."
          },
          headers: {
            type: "array",
            description: "Column headers.",
            items: { type: "string" }
          },
          rows: {
            type: "array",
            description: "Rows as arrays matching the headers.",
            items: {
              type: "array",
              items: { type: "string" }
            }
          },
          chartType: {
            type: "string",
            description: "Native Google Sheets chart type. Use COLUMN or BAR for comparisons, LINE for trends, PIE for share/mix.",
            enum: ["COLUMN", "BAR", "LINE", "AREA", "PIE"]
          },
          chartTitle: {
            type: "string",
            description: "Optional chart title."
          }
        },
        required: ["title", "headers", "rows"]
      }
    },
    {
      name: "create_google_slides_report",
      description:
        "Create a visually designed Google Slides presentation with executive layouts, KPI cards, chart pages, and action-plan pages when the user asks for slides, deck, presentation, pitch, or a visual executive report.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Presentation title."
          },
          subtitle: {
            type: "string",
            description: "Optional subtitle."
          },
          slides: {
            type: "array",
            description: "Presentation slides. Prefer a mix of kpi, chart, insight, and action layouts instead of plain text-only slides.",
            items: {
              type: "object",
              properties: {
                layout: {
                  type: "string",
                  description: "Visual layout for the slide.",
                  enum: ["kpi", "chart", "insight", "action"]
                },
                kicker: {
                  type: "string",
                  description: "Short section label, such as PERFORMANCE, INBOX, CONTENT, or NEXT MOVES."
                },
                title: { type: "string" },
                bullets: {
                  type: "array",
                  items: { type: "string" }
                },
                body: { type: "string" },
                metrics: {
                  type: "array",
                  description: "KPI cards for kpi layout.",
                  items: {
                    type: "object",
                    properties: {
                      label: { type: "string" },
                      value: { type: "string" }
                    }
                  }
                },
                chartData: {
                  type: "object",
                  description: "Simple chart data for chart layout.",
                  properties: {
                    title: { type: "string" },
                    categories: {
                      type: "array",
                      items: { type: "string" }
                    },
                    series: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          name: { type: "string" },
                          values: {
                            type: "array",
                            items: { type: "number" }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        required: ["title", "slides"]
      }
    }
  ];
}

function pickMetaArea(snapshot, area = "all") {
  const summary = summarizeMetaSnapshot(snapshot || {});
  if (area === "all") {
    return summary;
  }

  const page = summary.page ? { page: summary.page } : {};
  if (area === "page") {
    return page;
  }
  if (area === "ads") {
    return { ...page, adInsights: summary.adInsights };
  }
  if (area === "inbox") {
    return { ...page, inbox: summary.inbox };
  }
  if (area === "content") {
    return { ...page, content: summary.content };
  }
  return summary;
}

function normalizeName(value = "") {
  return String(value).replace(/\s+/g, " ").trim().toLowerCase();
}

function senderEntries(conversation) {
  const senders = conversation?.senders?.data || conversation?.senders || [];
  return Array.isArray(senders) ? senders : [];
}

function findCustomerRecipientId(snapshot = {}, { recipientId, conversationId, customerName } = {}) {
  if (recipientId) {
    return recipientId;
  }

  const pageId = snapshot.page?.id || snapshot.pageId;
  const conversations = snapshot.inbox?.conversations || [];
  const customerNeedle = normalizeName(customerName);
  const conversation = conversations.find((item) => {
    if (conversationId && item.id === conversationId) {
      return true;
    }
    if (!customerNeedle) {
      return false;
    }
    return senderEntries(item).some((sender) => normalizeName(sender.name).includes(customerNeedle));
  });

  if (!conversation) {
    return "";
  }

  const sender = senderEntries(conversation).find((entry) => entry.id && entry.id !== pageId);
  if (sender?.id) {
    return sender.id;
  }

  const messages = conversation.messages?.data || [];
  const messageSender = messages.find((message) => message.from?.id && message.from.id !== pageId);
  return messageSender?.from?.id || "";
}

export function createCeoPartnerTools({ config, storage, getFreshSnapshot, workspaceClient, messengerSender = sendFacebookPageMessage }) {
  const getWorkspaceClient = () => workspaceClient || createGoogleWorkspaceClient({ config });
  const getMetaSnapshot = async () => (await getFreshSnapshot?.()) ?? (await storage.getLatestSnapshot?.()) ?? {};
  return {
    declarations: buildCeoPartnerFunctionDeclarations(),
    handlers: {
      get_latest_meta_snapshot: async ({ area = "all" } = {}) => {
        const snapshot = await getMetaSnapshot();
        return pickMetaArea(snapshot, area);
      },
      get_latest_business_report: async () => (await storage.getLatestReport?.()) || "No report has been generated yet.",
      send_facebook_page_message: async ({ recipientId, conversationId, customerName, text, messageType = "RESPONSE" } = {}) => {
        const snapshot = await getMetaSnapshot();
        const resolvedRecipientId = findCustomerRecipientId(snapshot, { recipientId, conversationId, customerName });
        if (!resolvedRecipientId) {
          throw new Error("Could not resolve the Facebook customer recipient ID from the latest inbox data.");
        }
        return messengerSender({
          config,
          recipientId: resolvedRecipientId,
          text,
          messageType
        });
      },
      create_google_doc: async ({ title, content } = {}) => getWorkspaceClient().createDocument({ title, content }),
      create_calendar_event: async (event = {}) => getWorkspaceClient().createCalendarEvent(event),
      create_google_task: async (task = {}) => getWorkspaceClient().createTask(task),
      create_google_sheet_report: async (report = {}) => getWorkspaceClient().createSpreadsheetReport(report),
      create_google_slides_report: async (report = {}) => getWorkspaceClient().createSlideReport(report)
    }
  };
}
