function buildTools({ enableGoogleSearch, functionDeclarations }) {
  const tools = [];
  if (enableGoogleSearch) {
    tools.push({ google_search: {} });
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
  { enableGoogleSearch = false, functionDeclarations = [], responseSchema } = {}
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

  const tools = buildTools({ enableGoogleSearch, functionDeclarations });
  if (tools.length) {
    body.tools = tools;
  }
  if (enableGoogleSearch && functionDeclarations.length) {
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
          response: await handler(functionCall.args || {})
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

export async function generateText({
  apiKey,
  model,
  prompt,
  enableGoogleSearch = false,
  functionDeclarations = [],
  functionHandlers = {},
  responseSchema,
  fetchImpl = fetch
}) {
  const request = buildGeminiRequest(prompt, { enableGoogleSearch, functionDeclarations, responseSchema });
  let body = await postGemini({ apiKey, model, requestBody: request, fetchImpl });

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
