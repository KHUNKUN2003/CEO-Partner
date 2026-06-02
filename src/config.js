import "dotenv/config";

const DEFAULTS = {
  APP_TIMEZONE: "Asia/Bangkok",
  DAILY_REPORT_CRON: "0 8 * * *",
  GOOGLE_AI_MODEL: "gemini-3.5-flash",
  GOOGLE_CODE_EXECUTION: "true",
  GOOGLE_CONTEXT_CACHE: "true",
  GOOGLE_CONTEXT_CACHE_MIN_CHARS: "4000",
  GOOGLE_CONTEXT_CACHE_TTL_SECONDS: "3600",
  GOOGLE_CALENDAR_ID: "primary",
  GOOGLE_DOCS_FOLDER_ID: "",
  GOOGLE_IMPERSONATED_USER: "",
  GOOGLE_SERVICE_ACCOUNT_EMAIL: "",
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: "",
  GOOGLE_WORKSPACE_SHARE_EMAIL: "",
  GOOGLE_SEARCH_GROUNDING: "true",
  META_CONTENT_MAX_ITEMS: "5000",
  META_GRAPH_VERSION: "v24.0",
  PORT: "3000"
};

const REQUIRED = [
  "NEON_DATABASE_URL",
  "META_ACCESS_TOKEN",
  "META_PAGE_ID",
  "META_AD_ACCOUNT_ID",
  "GOOGLE_AI_API_KEY",
  "LINE_CHANNEL_SECRET",
  "LINE_CHANNEL_ACCESS_TOKEN"
];

function valueFrom(env, key) {
  return env[key] ?? DEFAULTS[key] ?? "";
}

export function loadConfig(env = process.env) {
  const missing = REQUIRED.filter((key) => !valueFrom(env, key));
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  return {
    nodeEnv: valueFrom(env, "NODE_ENV") || "development",
    port: Number(valueFrom(env, "PORT")),
    timezone: valueFrom(env, "APP_TIMEZONE"),
    dailyReportCron: valueFrom(env, "DAILY_REPORT_CRON"),
    neon: {
      databaseUrl: valueFrom(env, "NEON_DATABASE_URL")
    },
    meta: {
      graphVersion: valueFrom(env, "META_GRAPH_VERSION"),
      accessToken: valueFrom(env, "META_ACCESS_TOKEN"),
      pageAccessToken: valueFrom(env, "META_PAGE_ACCESS_TOKEN") || valueFrom(env, "META_ACCESS_TOKEN"),
      pageId: valueFrom(env, "META_PAGE_ID"),
      adAccountId: valueFrom(env, "META_AD_ACCOUNT_ID"),
      contentMaxItems: Number(valueFrom(env, "META_CONTENT_MAX_ITEMS"))
    },
    google: {
      apiKey: valueFrom(env, "GOOGLE_AI_API_KEY"),
      model: valueFrom(env, "GOOGLE_AI_MODEL"),
      searchGrounding: valueFrom(env, "GOOGLE_SEARCH_GROUNDING").toLowerCase() !== "false",
      codeExecution: valueFrom(env, "GOOGLE_CODE_EXECUTION").toLowerCase() !== "false",
      contextCache: valueFrom(env, "GOOGLE_CONTEXT_CACHE").toLowerCase() !== "false",
      contextCacheTtlSeconds: Number(valueFrom(env, "GOOGLE_CONTEXT_CACHE_TTL_SECONDS")),
      contextCacheMinChars: Number(valueFrom(env, "GOOGLE_CONTEXT_CACHE_MIN_CHARS")),
      workspace: {
        serviceAccountEmail: valueFrom(env, "GOOGLE_SERVICE_ACCOUNT_EMAIL"),
        serviceAccountPrivateKey: valueFrom(env, "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY"),
        impersonatedUser: valueFrom(env, "GOOGLE_IMPERSONATED_USER"),
        calendarId: valueFrom(env, "GOOGLE_CALENDAR_ID"),
        docsFolderId: valueFrom(env, "GOOGLE_DOCS_FOLDER_ID"),
        shareEmail: valueFrom(env, "GOOGLE_WORKSPACE_SHARE_EMAIL")
      }
    },
    line: {
      channelSecret: valueFrom(env, "LINE_CHANNEL_SECRET"),
      channelAccessToken: valueFrom(env, "LINE_CHANNEL_ACCESS_TOKEN"),
      targetId: valueFrom(env, "LINE_TARGET_ID")
    }
  };
}
