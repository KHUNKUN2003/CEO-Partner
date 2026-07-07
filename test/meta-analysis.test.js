import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAdInsightsUrl,
  buildConversationMessagesUrl,
  buildConversationsUrl,
  buildFeedUrl,
  buildMessengerSendUrl,
  buildPostCommentsUrl,
  buildPhotosUrl,
  buildPageUrl,
  buildVideosUrl,
  fetchMetaSnapshot,
  sendFacebookPageMessage
} from "../src/metaClient.js";
import {
  analyzeLeadScores,
  buildChatContext,
  buildChatPrompt,
  buildDailyReportPrompt,
  buildDailyReportSchema,
  formatDailyReportJson,
  summarizeMetaSnapshot
} from "../src/analysis.js";
import { buildGeminiRequest, extractTextWithGroundingSources, generateText } from "../src/aiClient.js";
import { buildCeoPartnerFunctionDeclarations, createCeoPartnerTools } from "../src/aiTools.js";

test("Meta page URL includes requested page fields", () => {
  const url = buildPageUrl({
    graphVersion: "v24.0",
    pageId: "731445173377155",
    accessToken: "token"
  });

  assert.equal(url.origin, "https://graph.facebook.com");
  assert.equal(url.pathname, "/v24.0/731445173377155");
  assert.match(url.searchParams.get("fields"), /name/);
  assert.equal(url.searchParams.get("access_token"), "token");
});

test("Meta ad insights URL requests yesterday performance fields", () => {
  const url = buildAdInsightsUrl({
    graphVersion: "v24.0",
    adAccountId: "act_3587793018144053",
    accessToken: "token",
    since: "2026-05-31",
    until: "2026-05-31"
  });

  assert.equal(url.pathname, "/v24.0/act_3587793018144053/insights");
  assert.equal(url.searchParams.get("time_range"), '{"since":"2026-05-31","until":"2026-05-31"}');
  assert.match(url.searchParams.get("fields"), /spend/);
  assert.match(url.searchParams.get("fields"), /campaign_name/);
});

test("Meta conversations URL requests inbox conversation fields", () => {
  const url = buildConversationsUrl({
    graphVersion: "v24.0",
    pageId: "731445173377155",
    accessToken: "token",
    limit: 10
  });

  assert.equal(url.pathname, "/v24.0/731445173377155/conversations");
  assert.match(url.searchParams.get("fields"), /senders/);
  assert.equal(url.searchParams.get("limit"), "10");
});

test("Meta conversation messages URL requests message snippets", () => {
  const url = buildConversationMessagesUrl({
    graphVersion: "v24.0",
    conversationId: "t_123",
    accessToken: "token",
    limit: 5
  });

  assert.equal(url.pathname, "/v24.0/t_123/messages");
  assert.match(url.searchParams.get("fields"), /message/);
  assert.match(url.searchParams.get("fields"), /from/);
});

test("Meta content URLs request posts photos and videos", () => {
  const feedUrl = buildFeedUrl({
    graphVersion: "v24.0",
    pageId: "731445173377155",
    accessToken: "token",
    limit: 20
  });
  const photosUrl = buildPhotosUrl({
    graphVersion: "v24.0",
    pageId: "731445173377155",
    accessToken: "token",
    limit: 20
  });
  const videosUrl = buildVideosUrl({
    graphVersion: "v24.0",
    pageId: "731445173377155",
    accessToken: "token",
    limit: 20
  });

  assert.equal(feedUrl.pathname, "/v24.0/731445173377155/posts");
  assert.match(feedUrl.searchParams.get("fields"), /message/);
  assert.match(feedUrl.searchParams.get("fields"), /attachments/);
  assert.match(feedUrl.searchParams.get("fields"), /full_picture/);
  assert.equal(photosUrl.pathname, "/v24.0/731445173377155/photos");
  assert.match(photosUrl.searchParams.get("fields"), /images/);
  assert.equal(videosUrl.pathname, "/v24.0/731445173377155/videos");
  assert.match(videosUrl.searchParams.get("fields"), /source/);
});

test("Meta post comments URL requests comment messages", () => {
  const url = buildPostCommentsUrl({
    graphVersion: "v24.0",
    postId: "post_1",
    accessToken: "token",
    limit: 5
  });

  assert.equal(url.pathname, "/v24.0/post_1/comments");
  assert.match(url.searchParams.get("fields"), /message/);
  assert.match(url.searchParams.get("fields"), /from/);
});

test("Meta Messenger send URL targets the page messages endpoint", () => {
  const url = buildMessengerSendUrl({
    graphVersion: "v24.0",
    pageId: "731445173377155",
    accessToken: "page-token"
  });

  assert.equal(url.pathname, "/v24.0/731445173377155/messages");
  assert.equal(url.searchParams.get("access_token"), "page-token");
});

test("Meta Messenger sender posts text to a customer PSID", async () => {
  let request;
  const result = await sendFacebookPageMessage({
    config: {
      meta: {
        graphVersion: "v24.0",
        pageId: "731445173377155",
        pageAccessToken: "page-token"
      }
    },
    recipientId: "psid-1",
    text: "Hello",
    fetchImpl: async (url, options) => {
      request = { url: String(url), options, body: JSON.parse(options.body) };
      return Response.json({ recipient_id: "psid-1", message_id: "mid-1" });
    }
  });

  assert.match(request.url, /731445173377155\/messages/);
  assert.equal(request.options.method, "POST");
  assert.deepEqual(request.body, {
    recipient: { id: "psid-1" },
    message_type: "RESPONSE",
    message: { text: "Hello" }
  });
  assert.equal(result.messageId, "mid-1");
});

test("Meta snapshot includes inbox posts photos and videos", async () => {
  const seenPaths = [];
  const seenUrls = [];
  const snapshot = await fetchMetaSnapshot({
    config: {
      meta: {
        graphVersion: "v24.0",
        pageId: "731445173377155",
        adAccountId: "act_1",
        accessToken: "user-token",
        pageAccessToken: "page-token",
        contentMaxItems: 100
      }
    },
    dateRange: { date: "2026-05-31", since: "2026-05-31", until: "2026-05-31" },
    fetchImpl: async (url) => {
      const parsedUrl = new URL(url);
      const path = parsedUrl.pathname;
      seenUrls.push(String(url));
      seenPaths.push(path);
      if (path.endsWith("/conversations")) {
        return Response.json({ data: [{ id: "t_1", updated_time: "2026-05-31T10:00:00+0000" }] });
      }
      if (path.endsWith("/messages")) {
        return Response.json({ data: [{ id: "m_1", message: "price?", from: { name: "Customer" } }] });
      }
      if (path.endsWith("/posts")) {
        if (!parsedUrl.searchParams.get("after")) {
          return Response.json({
            data: [{ id: "post_1", message: "New film promo", full_picture: "https://example.com/p.jpg" }],
            paging: { next: "https://graph.facebook.com/v24.0/731445173377155/posts?after=page2" }
          });
        }
        return Response.json({ data: [{ id: "post_2", message: "Second promo" }] });
      }
      if (path.endsWith("/comments")) {
        if (!parsedUrl.searchParams.get("after")) {
          return Response.json({
            data: [{ id: "comment_1", message: "Interested" }],
            paging: { next: "https://graph.facebook.com/v24.0/post_1/comments?after=comment2" }
          });
        }
        return Response.json({ data: [{ id: "comment_2", message: "How much?" }] });
      }
      if (path.endsWith("/photos")) {
        if (!parsedUrl.searchParams.get("after")) {
          return Response.json({
            data: [{ id: "photo_1", images: [{ source: "https://example.com/photo.jpg" }] }],
            paging: { next: "https://graph.facebook.com/v24.0/731445173377155/photos?after=photo2" }
          });
        }
        return Response.json({ data: [{ id: "photo_2" }] });
      }
      if (path.endsWith("/videos")) {
        return Response.json({ data: [{ id: "video_1", source: "https://example.com/video.mp4" }] });
      }
      if (path.includes("/insights")) {
        return Response.json({ data: [] });
      }
      return Response.json({ id: "731445173377155", name: "Fulltank Garage" });
    }
  });

  assert.deepEqual(seenPaths.filter((path) => path.includes("conversations") || path.includes("messages")), [
    "/v24.0/731445173377155/conversations",
    "/v24.0/t_1/messages"
  ]);
  assert.equal(snapshot.inbox.conversations[0].messages.data[0].message, "price?");
  assert.equal(snapshot.content.feed.data[0].message, "New film promo");
  assert.equal(snapshot.content.feed.data[1].message, "Second promo");
  assert.equal(snapshot.content.feed.data[0].comments.data[0].message, "Interested");
  assert.equal(snapshot.content.feed.data[0].comments.data[1].message, "How much?");
  assert.equal(snapshot.content.photos.data[0].id, "photo_1");
  assert.equal(snapshot.content.photos.data[1].id, "photo_2");
  assert.equal(snapshot.content.videos.data[0].id, "video_1");
  assert.ok(seenUrls.some((url) => url.includes("after=page2")));
  assert.ok(seenUrls.some((url) => url.includes("after=photo2")));
});

test("daily report prompt includes business context and broad AI instruction", () => {
  const prompt = buildDailyReportPrompt({
    reportDate: "2026-05-31",
    snapshot: {
      page: { name: "Fulltank Garage" },
      adInsights: { data: [{ campaign_name: "Film Promo", spend: "100" }] }
    }
  });

  assert.match(prompt, /Fulltank Garage/);
  assert.match(prompt, /2026-05-31/);
  assert.match(prompt, /elite Business Strategist/i);
  assert.match(prompt, /senior business partner/i);
  assert.match(prompt, /do not limit yourself to a narrow template/i);
  assert.match(prompt, /leadScoring/);
});

test("daily report schema and formatter produce stable LINE text", () => {
  const schema = buildDailyReportSchema();
  const text = formatDailyReportJson({
    yesterday_summary: "แชทสนใจราคาเพิ่มขึ้น",
    lead_scores: [
      {
        customer: "Customer A",
        score: 86,
        temperature: "hot",
        reason: "asked price and car model",
        next_action: "Send exact package price"
      }
    ],
    action_priority: [
      {
        rank: 1,
        action: "Reply to Customer A",
        owner: "Admin",
        urgency: "high",
        expected_impact: "increase close rate"
      }
    ],
    today_actions: ["ตอบลูกค้าที่ค้าง", "เปิดโพสต์โปรโมชัน"],
    content_ideas: ["รีวิวรถก่อนหลังติดฟิล์ม"],
    ad_recommendations: ["ดูแคมเปญที่ CTR สูง"],
    inbox_trend: "ลูกค้าถามเรื่องราคาและคิวติดตั้ง",
    priority: "ปิดลูกค้าที่ถามราคาแล้ว"
  });

  assert.match(schema.required.join(","), /priority/);
  assert.match(schema.required.join(","), /lead_scores/);
  assert.match(schema.required.join(","), /action_priority/);
  assert.match(text, /Lead Scoring/);
  assert.match(text, /86\/100/);
  assert.match(text, /Action Priority/);
  assert.match(text, /CEO Partner รายงานประจำวัน/);
  assert.match(text, /ตอบลูกค้าที่ค้าง/);
  assert.match(text, /Priority: ปิดลูกค้าที่ถามราคาแล้ว/);
});

test("lead scoring ranks hot inbox leads from buying intent signals", () => {
  const scores = analyzeLeadScores({
    page: { id: "page-1", name: "Fulltank Garage" },
    inbox: {
      conversations: [
        {
          id: "c-hot",
          updated_time: "2026-07-04T10:00:00+0000",
          message_count: 4,
          unread_count: 1,
          senders: { data: [{ id: "page-1", name: "Fulltank Garage" }, { id: "psid-1", name: "Customer Hot" }] },
          messages: {
            data: [
              { message: "Honda City 2018 3M film price? any booking tomorrow?" }
            ]
          }
        },
        {
          id: "c-cold",
          updated_time: "2026-07-04T09:00:00+0000",
          message_count: 1,
          unread_count: 0,
          senders: { data: [{ id: "page-1", name: "Fulltank Garage" }, { id: "psid-2", name: "Customer Cold" }] },
          messages: {
            data: [
              { message: "thanks" }
            ]
          }
        }
      ]
    }
  });

  assert.equal(scores[0].conversationId, "c-hot");
  assert.equal(scores[0].temperature, "hot");
  assert.ok(scores[0].score >= 70);
  assert.match(scores[0].reasons.join(","), /asked price/);
});

test("chat prompt excludes stored reports and includes owner question", () => {
  const prompt = buildChatPrompt({
    latestReport: "Yesterday report",
    latestSnapshot: { page: { name: "Fulltank Garage" } },
    message: "what should we do today?"
  });

  assert.doesNotMatch(prompt, /Yesterday report/);
  assert.match(prompt, /Optional live Meta API context summary/);
  assert.match(prompt, /what should we do today/);
});

test("chat prompt allows general conversation while providing Meta context", () => {
  const prompt = buildChatPrompt({
    latestReport: "Yesterday report",
    latestSnapshot: { page: { name: "Fulltank Garage" } },
    message: "Explain black holes"
  });

  assert.match(prompt, /elite Business Strategist/i);
  assert.match(prompt, /general-purpose AI assistant/i);
  assert.match(prompt, /answer any topic/i);
  assert.match(prompt, /Meta API context/i);
});

test("chat prompt summarizes large Meta snapshots instead of embedding every asset", () => {
  const hugeSnapshot = {
    page: { name: "Fulltank Garage" },
    content: {
      feed: { data: Array.from({ length: 200 }, (_, index) => ({ id: `p${index}`, message: `post ${index}`, full_picture: "x".repeat(10000) })) },
      photos: { data: Array.from({ length: 600 }, (_, index) => ({ id: `ph${index}`, images: [{ source: "y".repeat(10000) }] })) },
      videos: { data: Array.from({ length: 80 }, (_, index) => ({ id: `v${index}`, source: "z".repeat(10000) })) }
    }
  };
  const prompt = buildChatPrompt({
    latestReport: "",
    latestSnapshot: hugeSnapshot,
    message: "วิเคราะห์คอนเทนต์"
  });

  assert.match(prompt, /totalPosts/);
  assert.match(prompt, /totalPhotos/);
  assert.match(prompt, /totalVideos/);
  assert.doesNotMatch(prompt, /xxxxxxxxxxxxxxxxxxxxxxxx/);
  assert.ok(prompt.length < 25000);
});

test("Gemini request body uses the prompt as user content", () => {
  const body = buildGeminiRequest("hello");

  assert.equal(body.contents[0].role, "user");
  assert.equal(body.contents[0].parts[0].text, "hello");
});

test("Gemini request body can enable Google Search grounding", () => {
  const body = buildGeminiRequest("latest news", { enableGoogleSearch: true });

  assert.deepEqual(body.tools, [{ google_search: {} }]);
});

test("Gemini request body can enable Code Execution", () => {
  const body = buildGeminiRequest("calculate ROI", { enableCodeExecution: true });

  assert.deepEqual(body.tools, [{ code_execution: {} }]);
});

test("Gemini request body can declare CEO Partner function tools", () => {
  const declarations = buildCeoPartnerFunctionDeclarations();
  const body = buildGeminiRequest("check inbox", {
    enableGoogleSearch: true,
    enableCodeExecution: true,
    functionDeclarations: declarations
  });

  assert.equal(body.tools[0].google_search.constructor, Object);
  assert.equal(body.tools[1].code_execution.constructor, Object);
  assert.equal(body.tools[2].function_declarations[0].name, "get_latest_meta_snapshot");
  assert.match(body.tools[2].function_declarations[0].description, /Meta/i);
  assert.equal(body.tool_config.include_server_side_tool_invocations, true);
});

test("Gemini request body can request structured JSON output", () => {
  const body = buildGeminiRequest("daily report", {
    responseSchema: {
      type: "object",
      properties: {
        summary: { type: "string" }
      },
      required: ["summary"]
    }
  });

  assert.equal(body.generationConfig.response_mime_type, "application/json");
  assert.equal(body.generationConfig.response_schema.required[0], "summary");
});

test("Gemini request body can reference cached content", () => {
  const body = buildGeminiRequest("hello", { cachedContent: "cachedContents/abc" });

  assert.equal(body.cachedContent, "cachedContents/abc");
  assert.equal(body.contents[0].parts[0].text, "hello");
});

test("chat context can be separated from the unrestricted chat prompt", () => {
  const context = buildChatContext({
    latestReport: "Yesterday report",
    latestSnapshot: { page: { name: "Fulltank Garage" } }
  });
  const prompt = buildChatPrompt({
    latestReport: "Yesterday report",
    latestSnapshot: { page: { name: "Fulltank Garage" } },
    message: "Explain black holes",
    includeContext: false
  });

  assert.match(context, /Fulltank Garage/);
  assert.match(prompt, /elite Business Strategist/i);
  assert.match(prompt, /general-purpose AI assistant/i);
  assert.match(prompt, /answer any topic/i);
  assert.doesNotMatch(prompt, /Yesterday report/);
});

test("Gemini context caching creates a cache and uses it for generation", async () => {
  const requests = [];
  const answer = await generateText({
    apiKey: "key",
    model: "gemini-3.5-flash",
    prompt: "What is the trend?",
    cacheContext: {
      enabled: true,
      text: "Reusable business context ".repeat(250),
      ttlSeconds: 300,
      minChars: 100
    },
    fetchImpl: async (url, options) => {
      const body = JSON.parse(options.body);
      requests.push({ path: new URL(url).pathname, body });
      if (new URL(url).pathname.endsWith("/cachedContents")) {
        return Response.json({ name: "cachedContents/cache-1" });
      }
      return Response.json({ candidates: [{ content: { parts: [{ text: "cached answer" }] } }] });
    }
  });

  assert.equal(answer, "cached answer");
  assert.equal(requests[0].body.model, "models/gemini-3.5-flash");
  assert.equal(requests[0].body.ttl, "300s");
  assert.equal(requests[1].body.cachedContent, "cachedContents/cache-1");
  assert.equal(requests[1].body.contents[0].parts[0].text, "What is the trend?");
});

test("Gemini context caching stores tools on cached content instead of generation request", async () => {
  const requests = [];
  const answer = await generateText({
    apiKey: "key",
    model: "gemini-3.5-flash",
    prompt: "What is the inbox trend?",
    enableGoogleSearch: true,
    functionDeclarations: buildCeoPartnerFunctionDeclarations(),
    functionHandlers: {
      get_latest_meta_snapshot: async () => ({ inbox: { totalConversations: 1 } })
    },
    cacheContext: {
      enabled: true,
      text: "Reusable business context with tools ".repeat(250),
      ttlSeconds: 300,
      minChars: 100
    },
    fetchImpl: async (url, options) => {
      const body = JSON.parse(options.body);
      requests.push({ path: new URL(url).pathname, body });
      if (new URL(url).pathname.endsWith("/cachedContents")) {
        return Response.json({ name: "cachedContents/cache-with-tools" });
      }
      return Response.json({ candidates: [{ content: { parts: [{ text: "tool cached answer" }] } }] });
    }
  });

  assert.equal(answer, "tool cached answer");
  assert.equal(requests[0].body.tools[0].google_search.constructor, Object);
  assert.equal(requests[0].body.tools[1].function_declarations[0].name, "get_latest_meta_snapshot");
  assert.equal(requests[0].body.tool_config.include_server_side_tool_invocations, true);
  assert.equal(requests[1].body.cachedContent, "cachedContents/cache-with-tools");
  assert.equal(requests[1].body.tools, undefined);
  assert.equal(requests[1].body.tool_config, undefined);
});

test("Gemini context caching falls back to inline context when cache creation fails", async () => {
  const requests = [];
  const answer = await generateText({
    apiKey: "key",
    model: "gemini-3.5-flash",
    prompt: "What is the trend?",
    cacheContext: {
      enabled: true,
      text: "Reusable fallback business context ".repeat(250),
      ttlSeconds: 300,
      minChars: 100
    },
    fetchImpl: async (url, options) => {
      const body = JSON.parse(options.body);
      requests.push({ path: new URL(url).pathname, body });
      if (new URL(url).pathname.endsWith("/cachedContents")) {
        return Response.json({ error: { message: "too short" } }, { status: 400 });
      }
      return Response.json({ candidates: [{ content: { parts: [{ text: "fallback answer" }] } }] });
    }
  });

  assert.equal(answer, "fallback answer");
  assert.equal(requests.length, 2);
  assert.match(requests[1].body.contents[0].parts[0].text, /Reusable fallback business context/);
  assert.doesNotMatch(JSON.stringify(requests[1].body), /cachedContents\/cache/);
});

test("Gemini function calling executes tools and returns final text", async () => {
  const requests = [];
  const answer = await generateText({
    apiKey: "key",
    model: "gemini-3.5-flash",
    prompt: "จาก inbox แนวโน้มเป็นยังไง",
    functionDeclarations: buildCeoPartnerFunctionDeclarations(),
    functionHandlers: {
      get_latest_meta_snapshot: async ({ area }) => ({ area, inbox: { conversations: [{ id: "c1" }] } })
    },
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      requests.push(body);
      if (requests.length === 1) {
        return Response.json({
          candidates: [
            {
              content: {
                role: "model",
                parts: [{ functionCall: { name: "get_latest_meta_snapshot", args: { area: "inbox" } } }]
              }
            }
          ]
        });
      }
      return Response.json({ candidates: [{ content: { parts: [{ text: "Inbox มีบทสนทนาใหม่ให้ติดตาม" }] } }] });
    }
  });

  assert.equal(answer, "Inbox มีบทสนทนาใหม่ให้ติดตาม");
  assert.equal(requests[1].contents.at(-1).parts[0].functionResponse.name, "get_latest_meta_snapshot");
  assert.equal(requests[1].contents.at(-1).parts[0].functionResponse.response.inbox.conversations[0].id, "c1");
});

test("Gemini function calling wraps string tool responses in an object", async () => {
  const requests = [];
  const answer = await generateText({
    apiKey: "key",
    model: "gemini-3.5-flash",
    prompt: "latest meta status",
    functionDeclarations: buildCeoPartnerFunctionDeclarations(),
    functionHandlers: {
      get_latest_meta_snapshot: async () => "latest meta text"
    },
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      requests.push(body);
      if (requests.length === 1) {
        return Response.json({
          candidates: [
            {
              content: {
                role: "model",
                parts: [{ functionCall: { name: "get_latest_meta_snapshot", args: {} } }]
              }
            }
          ]
        });
      }
      return Response.json({ candidates: [{ content: { parts: [{ text: "final answer" }] } }] });
    }
  });

  assert.equal(answer, "final answer");
  assert.deepEqual(requests[1].contents.at(-1).parts[0].functionResponse.response, {
    result: "latest meta text"
  });
});

test("CEO Partner tools read filtered fresh Meta snapshot without stored reports", async () => {
  const tools = createCeoPartnerTools({
    storage: {
      getLatestReport: async () => {
        throw new Error("stored reports should not be read");
      },
      getLatestSnapshot: async () => ({
        page: { name: "Fulltank Garage" },
        inbox: { conversations: [] },
        content: { feed: { data: [] } }
      })
    },
    getFreshSnapshot: async () => ({
      page: { name: "Fresh Fulltank" },
      inbox: { conversations: [{ id: "c1" }] },
      content: { feed: { data: [{ id: "p1", full_picture: "x".repeat(10000) }] } }
    })
  });

  assert.equal("get_latest_business_report" in tools.handlers, false);
  assert.deepEqual(await tools.handlers.get_latest_meta_snapshot({ area: "inbox" }), {
    page: { name: "Fresh Fulltank" },
    inbox: { totalConversations: 1, recentConversations: [{ id: "c1", messages: [] }] }
  });
  assert.equal((await tools.handlers.get_latest_meta_snapshot({ area: "content" })).content.totalPosts, 1);
});

test("CEO Partner tools can send a Facebook message by resolving a customer name", async () => {
  let sendRequest;
  const tools = createCeoPartnerTools({
    config: {
      meta: {
        graphVersion: "v24.0",
        pageId: "page-1",
        pageAccessToken: "page-token"
      }
    },
    storage: {
      getLatestSnapshot: async () => ({
        page: { id: "page-1", name: "Fulltank Garage" },
        inbox: {
          conversations: [
            {
              id: "t_1",
              senders: {
                data: [
                  { id: "page-1", name: "Fulltank Garage" },
                  { id: "psid-1", name: "Chananun Thongplengrasmee" }
                ]
              }
            }
          ]
        }
      })
    },
    messengerSender: async (request) => {
      sendRequest = request;
      return { ok: true, messageId: "mid-1" };
    }
  });

  const result = await tools.handlers.send_facebook_page_message({
    customerName: "Chananun",
    text: "ส่งพิกัดร้านให้แล้วนะคะ"
  });

  assert.equal(sendRequest.recipientId, "psid-1");
  assert.equal(sendRequest.text, "ส่งพิกัดร้านให้แล้วนะคะ");
  assert.equal(result.messageId, "mid-1");
});

test("Meta snapshot summary keeps counts while dropping oversized media payloads", () => {
  const summary = summarizeMetaSnapshot({
    page: { name: "Fulltank Garage" },
    content: {
      feed: { data: [{ id: "p1", message: "promo", full_picture: "x".repeat(1000) }] },
      photos: { data: [{ id: "ph1", images: [{ source: "y".repeat(1000) }] }] },
      videos: { data: [{ id: "v1", source: "z".repeat(1000) }] }
    }
  });

  assert.equal(summary.content.totalPosts, 1);
  assert.equal(summary.content.totalPhotos, 1);
  assert.equal(summary.content.totalVideos, 1);
  assert.equal(summary.content.recentPosts[0].message, "promo");
  assert.equal(summary.content.recentPhotos[0].images, undefined);
});

test("Gemini response text includes grounding sources when available", () => {
  const text = extractTextWithGroundingSources({
    candidates: [
      {
        content: { parts: [{ text: "Answer" }] },
        groundingMetadata: {
          groundingChunks: [
            { web: { title: "Source One", uri: "https://example.com/one" } },
            { web: { title: "Source Two", uri: "https://example.com/two" } }
          ]
        }
      }
    ]
  });

  assert.match(text, /Answer/);
  assert.match(text, /Sources:/);
  assert.match(text, /Source One/);
  assert.match(text, /https:\/\/example.com\/one/);
});
