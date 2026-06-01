import crypto from "node:crypto";

const LINE_BOT_API_BASE = "https://api.line.me/v2/bot";
const LINE_MESSAGE_API_BASE = `${LINE_BOT_API_BASE}/message`;

function textMessage(text) {
  return {
    type: "text",
    text: String(text).slice(0, 5000)
  };
}

export function verifyLineSignature(rawBody, signature, channelSecret) {
  if (!signature || !channelSecret) {
    return false;
  }

  const expected = crypto.createHmac("sha256", channelSecret).update(rawBody).digest("base64");
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);
  return expectedBuffer.length === signatureBuffer.length && crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
}

export function extractLineSource(event) {
  if (event?.source?.type === "user" && event.source.userId) {
    return { sourceType: "user", sourceId: event.source.userId };
  }
  if (event?.source?.type === "group" && event.source.groupId) {
    return { sourceType: "group", sourceId: event.source.groupId };
  }
  if (event?.source?.type === "room" && event.source.roomId) {
    return { sourceType: "room", sourceId: event.source.roomId };
  }
  return null;
}

export function buildReplyBody(replyToken, text) {
  return {
    replyToken,
    messages: [textMessage(text)]
  };
}

export function buildPushBody(to, text) {
  return {
    to,
    messages: [textMessage(text)]
  };
}

export function buildLoadingAnimationBody(chatId, loadingSeconds = 30) {
  return {
    chatId,
    loadingSeconds
  };
}

async function postLine(path, channelAccessToken, body, fetchImpl = fetch) {
  const response = await fetchImpl(`${LINE_MESSAGE_API_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${channelAccessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LINE API failed: ${response.status} ${errorText}`);
  }
}

async function postLineBot(path, channelAccessToken, body, fetchImpl = fetch) {
  const response = await fetchImpl(`${LINE_BOT_API_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${channelAccessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LINE API failed: ${response.status} ${errorText}`);
  }
}

export async function replyText({ channelAccessToken, replyToken, text, fetchImpl }) {
  return postLine("/reply", channelAccessToken, buildReplyBody(replyToken, text), fetchImpl);
}

export async function pushText({ channelAccessToken, to, text, fetchImpl }) {
  return postLine("/push", channelAccessToken, buildPushBody(to, text), fetchImpl);
}

export async function showLoadingAnimation({ channelAccessToken, chatId, loadingSeconds = 30, fetchImpl }) {
  return postLineBot(
    "/chat/loading/start",
    channelAccessToken,
    buildLoadingAnimationBody(chatId, loadingSeconds),
    fetchImpl
  );
}
