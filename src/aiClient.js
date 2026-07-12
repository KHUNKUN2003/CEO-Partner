import crypto from "node:crypto";

const contextCacheStore = new Map();

function buildTools({ enableGoogleSearch, enableCodeExecution, functionDeclarations }) {
  const tools = [];
  if (enableGoogleSearch) {
    tools.push({ google_search: {} });
  }
  if (enableCodeExecution) {
    tools.push({ code_execution: {} });
  }
  if (functionDeclarations?.length) {
    tools.push({ function_declarations: functionDeclarations });
  }
  return tools;
}

function buildGenerationConfig({ responseSchema } = {}) {
  const generationConfig = {
    temperature: 0.8,
    topP: 0.95
  };

  if (responseSchema) {
    generationConfig.response_mime_type = "application/json";
    generationConfig.response_schema = responseSchema;
  }

  return generationConfig;
}

export function buildGeminiRequest(
  prompt,
  { enableGoogleSearch = false, enableCodeExecution = false, functionDeclarations = [], responseSchema, cachedContent } = {}
) {
  const body = {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }]
      }
    ],
    generationConfig: buildGenerationConfig({ responseSchema })
  };

  if (cachedContent) {
    body.cachedContent = cachedContent;
  }

  const tools = buildTools({ enableGoogleSearch, enableCodeExecution, functionDeclarations });
  if (tools.length) {
    body.tools = tools;
  }
  if ((enableGoogleSearch || enableCodeExecution) && functionDeclarations.length) {
    body.tool_config = {
      include_server_side_tool_invocations: true
    };
  }

  return body;
}

function extractFunctionCalls(body) {
  return (
    body?.candidates?.[0]?.content?.parts
      ?.map((part) => part.functionCall || part.function_call)
      .filter((functionCall) => functionCall?.name) ?? []
  );
}

function parseToolArguments(value) {
  if (!value) {
    return {};
  }
  if (typeof value === "object") {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function convertFunctionDeclarationsToOpenAiTools(functionDeclarations = []) {
  return functionDeclarations.map((declaration) => ({
    type: "function",
    function: {
      name: declaration.name,
      description: declaration.description,
      parameters: declaration.parameters || { type: "object", properties: {} }
    }
  }));
}

function truncateString(value, maxLength = 12000) {
  if (typeof value !== "string" || value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}\n\n[truncated ${value.length - maxLength} characters]`;
}

function normalizeFunctionResponse(value, depth = 0) {
  if (depth > 5) {
    return "[truncated nested object]";
  }
  if (value === null || value === undefined) {
    return { result: null };
  }
  if (typeof value === "string") {
    return { result: truncateString(value) };
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return { result: value };
  }
  if (Array.isArray(value)) {
    return {
      result: value.slice(0, 50).map((item) => normalizeFunctionValue(item, depth + 1)),
      truncatedItems: value.length > 50 ? value.length - 50 : 0
    };
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 80)
        .map(([key, nestedValue]) => [key, normalizeFunctionValue(nestedValue, depth + 1)])
    );
  }
  return { result: String(value) };
}

function normalizeFunctionValue(value, depth = 0) {
  if (depth > 5) {
    return "[truncated nested object]";
  }
  if (typeof value === "string") {
    return truncateString(value);
  }
  if (value === null || value === undefined || typeof value === "number" || typeof value === "boolean") {
    return value ?? null;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => normalizeFunctionValue(item, depth + 1));
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 80)
        .map(([key, nestedValue]) => [key, normalizeFunctionValue(nestedValue, depth + 1)])
    );
  }
  return String(value);
}

async function executeFunctionCalls(functionCalls, functionHandlers) {
  return Promise.all(
    functionCalls.map(async (functionCall) => {
      const handler = functionHandlers?.[functionCall.name];
      if (!handler) {
        return {
          name: functionCall.name,
          response: { error: `No handler registered for function ${functionCall.name}` }
        };
      }
      try {
        return {
          name: functionCall.name,
          response: normalizeFunctionResponse(await handler(functionCall.args || {}))
        };
      } catch (error) {
        return {
          name: functionCall.name,
          response: { error: error.message }
        };
      }
    })
  );
}

export function extractTextWithGroundingSources(body, { includeGroundingSources = true } = {}) {
  const candidate = body?.candidates?.[0];
  const text = candidate?.content?.parts?.map((part) => part.text).filter(Boolean).join("\n").trim();
  if (!text) {
    return "";
  }

  const chunks = candidate?.groundingMetadata?.groundingChunks ?? [];
  const sources = chunks
    .map((chunk) => chunk.web)
    .filter((web) => web?.uri)
    .slice(0, 5)
    .map((web, index) => `${index + 1}. ${web.title || web.uri} - ${web.uri}`);

  if (!includeGroundingSources || sources.length === 0) {
    return text;
  }

  return `${text}\n\nSources:\n${sources.join("\n")}`;
}

async function postGemini({ apiKey, model, requestBody, fetchImpl }) {
  const url = new URL(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`);
  url.searchParams.set("key", apiKey);

  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody)
  });
  const body = await response.json();

  if (!response.ok) {
    throw new Error(`Google AI API failed: ${response.status} ${JSON.stringify(body)}`);
  }

  return body;
}

async function postOpenAiCompatible({ apiKey, baseUrl, requestBody, fetchImpl }) {
  const response = await fetchImpl(`${String(baseUrl || "https://api.deepseek.com").replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestBody)
  });
  const body = await response.json();

  if (!response.ok) {
    throw new Error(`OpenAI-compatible AI API failed: ${response.status} ${JSON.stringify(body)}`);
  }

  return body;
}

function normalizeModelName(model) {
  return model.startsWith("models/") ? model : `models/${model}`;
}

function hashCacheInput({ model, text, tools, toolConfig }) {
  return crypto
    .createHash("sha256")
    .update(`${model}\n${text}\n${JSON.stringify(tools || [])}\n${JSON.stringify(toolConfig || {})}`)
    .digest("hex");
}

function buildPromptWithCacheContext({ prompt, cacheContext }) {
  if (!cacheContext?.text) {
    return prompt;
  }
  return [cacheContext.text, "", prompt].join("\n");
}

export function buildOpenAiCompatibleRequest(
  prompt,
  { model, functionDeclarations = [], responseSchema, cacheContext } = {}
) {
  const promptWithContext = buildPromptWithCacheContext({ prompt, cacheContext });
  const jsonPrompt = responseSchema
    ? `${promptWithContext}\n\nReturn only valid JSON that matches the requested structure. Do not include markdown fences.`
    : promptWithContext;
  const body = {
    model,
    messages: [{ role: "user", content: jsonPrompt }],
    temperature: 0.8,
    top_p: 0.95
  };

  const tools = convertFunctionDeclarationsToOpenAiTools(functionDeclarations);
  if (tools.length) {
    body.tools = tools;
    body.tool_choice = "auto";
  }
  if (responseSchema) {
    body.response_format = { type: "json_object" };
  }

  return body;
}

function extractOpenAiToolCalls(body) {
  return body?.choices?.[0]?.message?.tool_calls ?? [];
}

function extractOpenAiText(body) {
  return body?.choices?.[0]?.message?.content?.trim() ?? "";
}

async function generateOpenAiCompatibleText({
  apiKey,
  model,
  prompt,
  baseUrl,
  functionDeclarations = [],
  functionHandlers = {},
  responseSchema,
  cacheContext,
  fetchImpl
}) {
  const request = buildOpenAiCompatibleRequest(prompt, {
    model,
    functionDeclarations,
    responseSchema,
    cacheContext
  });

  let body = await postOpenAiCompatible({ apiKey, baseUrl, requestBody: request, fetchImpl });
  for (let round = 0; round < 3; round += 1) {
    const toolCalls = extractOpenAiToolCalls(body);
    if (toolCalls.length === 0) {
      break;
    }

    request.messages.push(body.choices[0].message);
    const functionCalls = toolCalls
      .map((toolCall) => ({
        id: toolCall.id,
        name: toolCall.function?.name,
        args: parseToolArguments(toolCall.function?.arguments)
      }))
      .filter((functionCall) => functionCall.name);
    const functionResults = await executeFunctionCalls(functionCalls, functionHandlers);
    functionResults.forEach((result, index) => {
      request.messages.push({
        role: "tool",
        tool_call_id: functionCalls[index].id,
        name: result.name,
        content: JSON.stringify(result.response)
      });
    });
    body = await postOpenAiCompatible({ apiKey, baseUrl, requestBody: request, fetchImpl });
  }

  const text = extractOpenAiText(body);
  if (!text) {
    throw new Error("AI API returned no text");
  }
  return text;
}

async function createGeminiCache({ apiKey, model, cacheContext, fetchImpl }) {
  const url = new URL("https://generativelanguage.googleapis.com/v1beta/cachedContents");
  url.searchParams.set("key", apiKey);

  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: normalizeModelName(model),
      displayName: cacheContext.displayName || "CEO Partner context",
      contents: [
        {
          role: "user",
          parts: [{ text: cacheContext.text }]
        }
      ],
      ttl: `${cacheContext.ttlSeconds}s`,
      ...(cacheContext.tools?.length ? { tools: cacheContext.tools } : {}),
      ...(cacheContext.toolConfig ? { tool_config: cacheContext.toolConfig } : {})
    })
  });
  const body = await response.json();

  if (!response.ok) {
    throw new Error(`Google AI cache failed: ${response.status} ${JSON.stringify(body)}`);
  }
  if (!body.name) {
    throw new Error("Google AI cache response did not include a cache name");
  }

  return body.name;
}

async function getCachedContentName({ apiKey, model, cacheContext, fetchImpl }) {
  if (!cacheContext?.enabled || !cacheContext.text) {
    return "";
  }

  const minChars = Math.max(Number(cacheContext.minChars || 0), 0);
  if (cacheContext.text.length < minChars) {
    return "";
  }

  const ttlSeconds = Math.max(Number(cacheContext.ttlSeconds || 3600), 60);
  const key = hashCacheInput({
    model,
    text: cacheContext.text,
    tools: cacheContext.tools,
    toolConfig: cacheContext.toolConfig
  });
  const existing = contextCacheStore.get(key);
  const now = Date.now();
  if (existing && existing.expiresAt > now + 5000) {
    return existing.name;
  }

  const name = await createGeminiCache({
    apiKey,
    model,
    cacheContext: { ...cacheContext, ttlSeconds },
    fetchImpl
  });
  contextCacheStore.set(key, {
    name,
    expiresAt: now + ttlSeconds * 1000
  });
  return name;
}

export async function generateText({
  provider = "gemini",
  apiKey,
  model,
  prompt,
  baseUrl,
  enableGoogleSearch = false,
  enableCodeExecution = false,
  functionDeclarations = [],
  functionHandlers = {},
  responseSchema,
  cacheContext,
  fetchImpl = fetch
}) {
  if (provider === "deepseek") {
    return generateOpenAiCompatibleText({
      apiKey,
      model,
      prompt,
      baseUrl,
      functionDeclarations,
      functionHandlers,
      responseSchema,
      cacheContext,
      fetchImpl
    });
  }

  const cacheTools = buildTools({ enableGoogleSearch, enableCodeExecution, functionDeclarations });
  const cacheToolConfig =
    (enableGoogleSearch || enableCodeExecution) && functionDeclarations.length
      ? { include_server_side_tool_invocations: true }
      : undefined;
  let cachedContent = "";
  let promptForRequest = prompt;
  if (cacheContext?.text) {
    try {
      cachedContent = await getCachedContentName({
        apiKey,
        model,
        cacheContext: { ...cacheContext, tools: cacheTools, toolConfig: cacheToolConfig },
        fetchImpl
      });
    } catch (error) {
      console.error(`Gemini context cache unavailable, using inline context: ${error.message}`);
    }
    if (!cachedContent) {
      promptForRequest = buildPromptWithCacheContext({ prompt, cacheContext });
    }
  }

  const request = buildGeminiRequest(promptForRequest, {
    enableGoogleSearch: cachedContent ? false : enableGoogleSearch,
    enableCodeExecution: cachedContent ? false : enableCodeExecution,
    functionDeclarations: cachedContent ? [] : functionDeclarations,
    responseSchema,
    cachedContent
  });
  let body;
  try {
    body = await postGemini({ apiKey, model, requestBody: request, fetchImpl });
  } catch (error) {
    if (!cachedContent || !cacheContext?.text) {
      throw error;
    }
    console.error(`Gemini cached request failed, retrying with inline context: ${error.message}`);
    const fallbackRequest = buildGeminiRequest(buildPromptWithCacheContext({ prompt, cacheContext }), {
      enableGoogleSearch,
      enableCodeExecution,
      functionDeclarations,
      responseSchema
    });
    body = await postGemini({ apiKey, model, requestBody: fallbackRequest, fetchImpl });
    request.contents = fallbackRequest.contents;
    delete request.cachedContent;
  }

  for (let round = 0; round < 3; round += 1) {
    const functionCalls = extractFunctionCalls(body);
    if (functionCalls.length === 0) {
      break;
    }

    request.contents.push(body.candidates[0].content);
    const functionResults = await executeFunctionCalls(functionCalls, functionHandlers);
    request.contents.push({
      role: "user",
      parts: functionResults.map((result) => ({
        functionResponse: {
          name: result.name,
          response: result.response
        }
      }))
    });
    body = await postGemini({ apiKey, model, requestBody: request, fetchImpl });
  }

  const text = extractTextWithGroundingSources(body, { includeGroundingSources: !responseSchema });
  if (!text) {
    throw new Error("Google AI API returned no text");
  }
  return text;
}
