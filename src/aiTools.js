import { summarizeMetaSnapshot } from "./analysis.js";

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

export function createCeoPartnerTools({ storage, getFreshSnapshot }) {
  return {
    declarations: buildCeoPartnerFunctionDeclarations(),
    handlers: {
      get_latest_meta_snapshot: async ({ area = "all" } = {}) => {
        const snapshot = (await getFreshSnapshot?.()) ?? (await storage.getLatestSnapshot?.()) ?? {};
        return pickMetaArea(snapshot, area);
      },
      get_latest_business_report: async () => (await storage.getLatestReport?.()) || "No report has been generated yet."
    }
  };
}
