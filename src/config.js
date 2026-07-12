import "dotenv/config";

const DEFAULTS = {
  AI_PROVIDER: "deepseek",
  APP_TIMEZONE: "Asia/Bangkok",
  DAILY_REPORT_CRON: "0 8 * * *",
  DEEPSEEK_API_KEY: "",
  DEEPSEEK_BASE_URL: "https://api.deepseek.com",
  DEEPSEEK_MODEL: "deepseek-chat",
  GOOGLE_AI_API_KEY: "",
  GOOGLE_AI_MODEL: "gemini-3.5-flash",
  GOOGLE_CODE_EXECUTION: "true",
  GOOGLE_CONTEXT_CACHE: "true",
  GOOGLE_CONTEXT_CACHE_MIN_CHARS: "4000",
  GOOGLE_CONTEXT_CACHE_TTL_SECONDS: "3600",
  GOOGLE_CALENDAR_ID: "primary",
  GOOGLE_DOCS_FOLDER_ID: "",
  GOOGLE_IMPERSONATED_USER: "",
  GOOGLE_OAUTH_CLIENT_ID: "",
  GOOGLE_OAUTH_CLIENT_SECRET: "",
  GOOGLE_OAUTH_REDIRECT_URI: "http://127.0.0.1:53682/oauth2callback",
  GOOGLE_OAUTH_REFRESH_TOKEN: "",
  GOOGLE_PLACES_API_KEY: "",
  GOOGLE_PLACES_DEFAULT_QUERY: "ร้านติดฟิล์มรถยนต์ใกล้ Fulltank Garage กาญจนาภิเษก บางแค",
  GOOGLE_PLACES_LATITUDE: "",
  GOOGLE_PLACES_LONGITUDE: "",
  GOOGLE_PLACES_RADIUS_METERS: "5000",
  GOOGLE_SERVICE_ACCOUNT_EMAIL: "",
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: "",
  GOOGLE_TASKS_LIST_ID: "@default",
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
  "LINE_CHANNEL_SECRET",
  "LINE_CHANNEL_ACCESS_TOKEN"
];

function valueFrom(env, key) {
  return env[key] ?? DEFAULTS[key] ?? "";
}

function listFrom(value) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function loadConfig(env = process.env) {
  const provider = valueFrom(env, "AI_PROVIDER").toLowerCase();
  const aiApiKey = provider === "deepseek" ? valueFrom(env, "DEEPSEEK_API_KEY") : valueFrom(env, "GOOGLE_AI_API_KEY");
  const aiModel = provider === "deepseek" ? valueFrom(env, "DEEPSEEK_MODEL") : valueFrom(env, "GOOGLE_AI_MODEL");
  const missing = REQUIRED.filter((key) => !valueFrom(env, key));
  if (!aiApiKey) {
    missing.push(provider === "deepseek" ? "DEEPSEEK_API_KEY" : "GOOGLE_AI_API_KEY");
  }
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
    ai: {
      provider,
      apiKey: aiApiKey,
      model: aiModel,
      baseUrl: provider === "deepseek" ? valueFrom(env, "DEEPSEEK_BASE_URL") : ""
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
      provider,
      apiKey: aiApiKey,
      model: aiModel,
      baseUrl: provider === "deepseek" ? valueFrom(env, "DEEPSEEK_BASE_URL") : "",
      searchGrounding: provider !== "deepseek" && valueFrom(env, "GOOGLE_SEARCH_GROUNDING").toLowerCase() !== "false",
      codeExecution: provider !== "deepseek" && valueFrom(env, "GOOGLE_CODE_EXECUTION").toLowerCase() !== "false",
      contextCache: provider !== "deepseek" && valueFrom(env, "GOOGLE_CONTEXT_CACHE").toLowerCase() !== "false",
      contextCacheTtlSeconds: Number(valueFrom(env, "GOOGLE_CONTEXT_CACHE_TTL_SECONDS")),
      contextCacheMinChars: Number(valueFrom(env, "GOOGLE_CONTEXT_CACHE_MIN_CHARS")),
      workspace: {
        serviceAccountEmail: valueFrom(env, "GOOGLE_SERVICE_ACCOUNT_EMAIL"),
        serviceAccountPrivateKey: valueFrom(env, "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY"),
        impersonatedUser: valueFrom(env, "GOOGLE_IMPERSONATED_USER"),
        oauthClientId: valueFrom(env, "GOOGLE_OAUTH_CLIENT_ID"),
        oauthClientSecret: valueFrom(env, "GOOGLE_OAUTH_CLIENT_SECRET"),
        oauthRedirectUri: valueFrom(env, "GOOGLE_OAUTH_REDIRECT_URI"),
        oauthRefreshToken: valueFrom(env, "GOOGLE_OAUTH_REFRESH_TOKEN"),
        calendarId: valueFrom(env, "GOOGLE_CALENDAR_ID"),
        docsFolderId: valueFrom(env, "GOOGLE_DOCS_FOLDER_ID"),
        tasksListId: valueFrom(env, "GOOGLE_TASKS_LIST_ID"),
        shareEmail: valueFrom(env, "GOOGLE_WORKSPACE_SHARE_EMAIL")
      },
      places: {
        apiKey: valueFrom(env, "GOOGLE_PLACES_API_KEY") || valueFrom(env, "GOOGLE_AI_API_KEY"),
        defaultQuery: valueFrom(env, "GOOGLE_PLACES_DEFAULT_QUERY"),
        latitude: valueFrom(env, "GOOGLE_PLACES_LATITUDE"),
        longitude: valueFrom(env, "GOOGLE_PLACES_LONGITUDE"),
        radiusMeters: Number(valueFrom(env, "GOOGLE_PLACES_RADIUS_METERS"))
      }
    },
    line: {
      channelSecret: valueFrom(env, "LINE_CHANNEL_SECRET"),
      channelAccessToken: valueFrom(env, "LINE_CHANNEL_ACCESS_TOKEN"),
      targetId: valueFrom(env, "LINE_TARGET_ID"),
      targetIds: [
        ...new Set([
          ...listFrom(valueFrom(env, "LINE_TARGET_IDS")),
          ...listFrom(valueFrom(env, "LINE_TARGET_ID"))
        ])
      ]
    }
  };
}
