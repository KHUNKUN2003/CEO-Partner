const META_BASE = "https://graph.facebook.com";

export function buildPageUrl({ graphVersion, pageId, accessToken }) {
  const url = new URL(`${META_BASE}/${graphVersion}/${pageId}`);
  url.searchParams.set("fields", "id,name,category,fan_count,followers_count,instagram_business_account");
  url.searchParams.set("access_token", accessToken);
  return url;
}

export function buildAdInsightsUrl({ graphVersion, adAccountId, accessToken, since, until }) {
  const url = new URL(`${META_BASE}/${graphVersion}/${adAccountId}/insights`);
  url.searchParams.set(
    "fields",
    [
      "account_id",
      "campaign_id",
      "campaign_name",
      "adset_id",
      "adset_name",
      "ad_id",
      "ad_name",
      "impressions",
      "reach",
      "clicks",
      "spend",
      "cpc",
      "cpm",
      "ctr",
      "actions",
      "date_start",
      "date_stop"
    ].join(",")
  );
  url.searchParams.set("level", "ad");
  url.searchParams.set("time_range", JSON.stringify({ since, until }));
  url.searchParams.set("access_token", accessToken);
  return url;
}

export function buildConversationsUrl({ graphVersion, pageId, accessToken, limit = 10 }) {
  const url = new URL(`${META_BASE}/${graphVersion}/${pageId}/conversations`);
  url.searchParams.set("fields", "id,updated_time,senders,message_count,unread_count");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("access_token", accessToken);
  return url;
}

export function buildConversationMessagesUrl({ graphVersion, conversationId, accessToken, limit = 5 }) {
  const url = new URL(`${META_BASE}/${graphVersion}/${conversationId}/messages`);
  url.searchParams.set("fields", "id,created_time,from,to,message");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("access_token", accessToken);
  return url;
}

export function buildFeedUrl({ graphVersion, pageId, accessToken, limit = 20 }) {
  const url = new URL(`${META_BASE}/${graphVersion}/${pageId}/posts`);
  url.searchParams.set(
    "fields",
    [
      "id",
      "message",
      "story",
      "created_time",
      "updated_time",
      "permalink_url",
      "full_picture",
      "status_type",
      "shares",
      "attachments{media,type,url,target,title,description}"
    ].join(",")
  );
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("access_token", accessToken);
  return url;
}

export function buildPhotosUrl({ graphVersion, pageId, accessToken, limit = 20 }) {
  const url = new URL(`${META_BASE}/${graphVersion}/${pageId}/photos`);
  url.searchParams.set("fields", "id,name,created_time,updated_time,picture,images,link,album");
  url.searchParams.set("type", "uploaded");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("access_token", accessToken);
  return url;
}

export function buildVideosUrl({ graphVersion, pageId, accessToken, limit = 20 }) {
  const url = new URL(`${META_BASE}/${graphVersion}/${pageId}/videos`);
  url.searchParams.set("fields", "id,title,description,created_time,updated_time,permalink_url,picture,source,length");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("access_token", accessToken);
  return url;
}

export function buildPostCommentsUrl({ graphVersion, postId, accessToken, limit = 5 }) {
  const url = new URL(`${META_BASE}/${graphVersion}/${postId}/comments`);
  url.searchParams.set("fields", "id,created_time,from,message,comment_count,like_count");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("access_token", accessToken);
  return url;
}

async function getJson(url, fetchImpl = fetch) {
  const response = await fetchImpl(url);
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`Meta API failed: ${response.status} ${JSON.stringify(body)}`);
  }
  return body;
}

async function fetchOptionalEdge(name, url, fetchImpl) {
  try {
    return await getJson(url, fetchImpl);
  } catch (error) {
    return {
      data: [],
      error: error.message,
      edge: name
    };
  }
}

async function fetchPaginatedOptionalEdge(name, firstUrl, fetchImpl, { maxItems = 5000 } = {}) {
  try {
    const data = [];
    let nextUrl = firstUrl;
    let lastPage = null;

    while (nextUrl && data.length < maxItems) {
      const page = await getJson(nextUrl, fetchImpl);
      lastPage = page;
      const remaining = maxItems - data.length;
      data.push(...(page.data ?? []).slice(0, remaining));
      nextUrl = page.paging?.next && data.length < maxItems ? page.paging.next : null;
    }

    return {
      ...lastPage,
      data,
      paging: {
        ...(lastPage?.paging ?? {}),
        truncated: Boolean(nextUrl)
      }
    };
  } catch (error) {
    return {
      data: [],
      error: error.message,
      edge: name
    };
  }
}

async function fetchInbox({ config, fetchImpl }) {
  try {
    const conversations = await getJson(
      buildConversationsUrl({
        graphVersion: config.meta.graphVersion,
        pageId: config.meta.pageId,
        accessToken: config.meta.pageAccessToken,
        limit: 10
      }),
      fetchImpl
    );

    const conversationDetails = await Promise.all(
      (conversations.data ?? []).slice(0, 10).map(async (conversation) => {
        try {
          const messages = await getJson(
            buildConversationMessagesUrl({
              graphVersion: config.meta.graphVersion,
              conversationId: conversation.id,
              accessToken: config.meta.pageAccessToken,
              limit: 8
            }),
            fetchImpl
          );
          return { ...conversation, messages };
        } catch (error) {
          return { ...conversation, messagesError: error.message };
        }
      })
    );

    return {
      conversations: conversationDetails,
      fetchedAt: new Date().toISOString()
    };
  } catch (error) {
    return {
      conversations: [],
      error: error.message,
      fetchedAt: new Date().toISOString()
    };
  }
}

async function fetchPageContent({ config, fetchImpl }) {
  const maxItems = config.meta.contentMaxItems || 5000;
  const common = {
    graphVersion: config.meta.graphVersion,
    pageId: config.meta.pageId,
    accessToken: config.meta.pageAccessToken
  };
  const [feedBase, photos, videos] = await Promise.all([
    fetchPaginatedOptionalEdge("feed", buildFeedUrl({ ...common, limit: 100 }), fetchImpl, { maxItems }),
    fetchPaginatedOptionalEdge("photos", buildPhotosUrl({ ...common, limit: 100 }), fetchImpl, { maxItems }),
    fetchPaginatedOptionalEdge("videos", buildVideosUrl({ ...common, limit: 100 }), fetchImpl, { maxItems })
  ]);
  const feed = {
    ...feedBase,
    data: await Promise.all(
      (feedBase.data ?? []).map(async (post) => {
        const comments = await fetchPaginatedOptionalEdge(
          "post_comments",
          buildPostCommentsUrl({
            graphVersion: config.meta.graphVersion,
            postId: post.id,
            accessToken: config.meta.pageAccessToken,
            limit: 100
          }),
          fetchImpl,
          { maxItems }
        );
        return { ...post, comments };
      })
    )
  };

  return {
    feed,
    photos,
    videos,
    fetchedAt: new Date().toISOString()
  };
}

export async function fetchMetaSnapshot({ config, dateRange, fetchImpl }) {
  const pageUrl = buildPageUrl({
    graphVersion: config.meta.graphVersion,
    pageId: config.meta.pageId,
    accessToken: config.meta.pageAccessToken
  });
  const adInsightsUrl = buildAdInsightsUrl({
    graphVersion: config.meta.graphVersion,
    adAccountId: config.meta.adAccountId,
    accessToken: config.meta.accessToken,
    since: dateRange.since,
    until: dateRange.until
  });

  const [page, adInsights, inbox, content] = await Promise.all([
    getJson(pageUrl, fetchImpl),
    getJson(adInsightsUrl, fetchImpl),
    fetchInbox({ config, fetchImpl }),
    fetchPageContent({ config, fetchImpl })
  ]);

  return {
    reportDate: dateRange.date,
    page,
    adInsights,
    inbox,
    content
  };
}
