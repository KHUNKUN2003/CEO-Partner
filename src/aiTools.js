import { summarizeMetaSnapshot } from "./analysis.js";
import { createGoogleWorkspaceClient } from "./googleWorkspaceClient.js";

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

export function createCeoPartnerTools({ config, storage, getFreshSnapshot, workspaceClient }) {
  const getWorkspaceClient = () => workspaceClient || createGoogleWorkspaceClient({ config });
  return {
    declarations: buildCeoPartnerFunctionDeclarations(),
    handlers: {
      get_latest_meta_snapshot: async ({ area = "all" } = {}) => {
        const snapshot = (await getFreshSnapshot?.()) ?? (await storage.getLatestSnapshot?.()) ?? {};
        return pickMetaArea(snapshot, area);
      },
      get_latest_business_report: async () => (await storage.getLatestReport?.()) || "No report has been generated yet.",
      create_google_doc: async ({ title, content } = {}) => getWorkspaceClient().createDocument({ title, content }),
      create_calendar_event: async (event = {}) => getWorkspaceClient().createCalendarEvent(event)
    }
  };
}
