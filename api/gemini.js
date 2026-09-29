const CHAT_MODEL =
  process.env.GEMINI_CHAT_MODEL ||
  process.env.GEMINI_MODEL ||
  "gemini-3.5-flash-lite";
const LESSON_MODEL =
  process.env.GEMINI_LESSON_MODEL ||
  "gemini-3.6-flash";

const MAX_PROMPT_LENGTH = 16000;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = Number(process.env.GEMINI_RATE_LIMIT) || 40;
const SYSTEM_INSTRUCTION =
  "あなたはプログラミング言語 PopPop の学習サイトのチューター「ロボット君」です。" +
  "PopPop の学習、練習問題、コードの説明、エラーの解説にだけ答えてください。" +
  "それ以外の依頼には、PopPop の学習に戻るよう短く案内してください。";

// Best effort: each serverless instance keeps its own window, so this caps
// bursts from one client rather than enforcing an exact global quota.
const recentRequests = new Map();

function sendJson(response, status, payload) {
  response.status(status).json(payload);
}

function allowedOrigins(request) {
  const configured = String(process.env.POPPOP_ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const host = request.headers["x-forwarded-host"] || request.headers.host;
  return new Set([
    ...configured,
    ...(host ? [`https://${host}`] : []),
  ]);
}

export function isAllowedOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return false;
  if (allowedOrigins(request).has(origin)) return true;
  try {
    const { hostname } = new URL(origin);
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

export function takeRateLimitSlot(clientId, now = Date.now()) {
  const recent = (recentRequests.get(clientId) || [])
    .filter((time) => now - time < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX_REQUESTS) {
    recentRequests.set(clientId, recent);
    return Math.ceil((RATE_LIMIT_WINDOW_MS - (now - recent[0])) / 1000);
  }
  recent.push(now);
  recentRequests.set(clientId, recent);
  if (recentRequests.size > 5000) {
    for (const [key, times] of recentRequests) {
      if (!times.some((time) => now - time < RATE_LIMIT_WINDOW_MS)) {
        recentRequests.delete(key);
      }
    }
  }
  return 0;
}

function clientId(request) {
  const forwarded = String(request.headers["x-forwarded-for"] || "");
  return forwarded.split(",")[0].trim() || request.socket?.remoteAddress || "unknown";
}

export default async function handler(request, response) {
  if (request.method === "OPTIONS") {
    response.setHeader("Allow", "POST, OPTIONS");
    response.status(204).end();
    return;
  }

  if (request.method !== "POST") {
    sendJson(response, 405, { error: "POST is required" });
    return;
  }

  if (!isAllowedOrigin(request)) {
    sendJson(response, 403, { error: "This endpoint only serves the PopPop Playground" });
    return;
  }

  const retryAfter = takeRateLimitSlot(clientId(request));
  if (retryAfter) {
    response.setHeader("Retry-After", String(retryAfter));
    sendJson(response, 429, { error: "リクエストが多すぎます。少し待ってからもう一度試してください" });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    sendJson(response, 503, { error: "GEMINI_API_KEY is not set" });
    return;
  }

  const prompt = String(request.body?.prompt || "").trim();
  const task = request.body?.task === "lesson" ? "lesson" : "chat";
  const stream = request.body?.stream === true;
  const model = task === "lesson" ? LESSON_MODEL : CHAT_MODEL;
  if (!prompt) {
    sendJson(response, 400, { error: "prompt is required" });
    return;
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    sendJson(response, 413, { error: "prompt is too long" });
    return;
  }

  const payload = {
    systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      maxOutputTokens: task === "lesson" ? 4096 : 1200,
    },
  };
  if (task === "lesson") {
    payload.generationConfig.thinkingConfig = { thinkingLevel: "low" };
    payload.generationConfig.responseMimeType = "application/json";
    payload.generationConfig.responseJsonSchema = {
      type: "object",
      properties: {
        title: { type: "string" },
        intro: { type: "string" },
        goal: { type: "string" },
        starter: { type: "string" },
        solution: { type: "string" },
        hints: {
          type: "array",
          items: { type: "string" },
          minItems: 2,
          maxItems: 2,
        },
        mood: {
          type: "string",
          enum: ["neutral", "happy", "thinking", "encourage", "surprised"],
        },
      },
      required: ["title", "intro", "goal", "starter", "solution", "hints", "mood"],
      additionalProperties: false,
    };
  } else if (request.body?.json) {
    payload.generationConfig.responseMimeType = "application/json";
  }

  const requestModel = (candidateModel) =>
    fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${candidateModel}:${
        stream ? "streamGenerateContent?alt=sse" : "generateContent"
      }`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify(payload),
      },
    );

  let geminiResponse = await requestModel(model);
  if (task === "lesson" && model !== CHAT_MODEL && geminiResponse.status === 429) {
    geminiResponse = await requestModel(CHAT_MODEL);
  }

  if (!geminiResponse.ok) {
    const geminiPayload = await geminiResponse.json().catch(() => ({}));
    const retryAfter = geminiResponse.headers.get("retry-after");
    if (retryAfter) response.setHeader("Retry-After", retryAfter);
    sendJson(response, geminiResponse.status, {
      error: geminiPayload.error?.message || "Gemini API request failed",
    });
    return;
  }

  if (stream) {
    response.status(200);
    response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("X-Accel-Buffering", "no");
    response.flushHeaders?.();
    const reader = geminiResponse.body?.getReader();
    if (!reader) {
      response.end();
      return;
    }
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      response.write(Buffer.from(value));
    }
    response.end();
    return;
  }

  const geminiPayload = await geminiResponse.json().catch(() => ({}));
  const text = (geminiPayload.candidates?.[0]?.content?.parts || [])
    .map((part) => part.text || "")
    .join("")
    .trim();
  sendJson(response, 200, { text });
}
