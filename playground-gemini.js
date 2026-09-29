((root, factory) => {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PopPopGemini = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  "use strict";

  // Talks to the /api/gemini proxy. Requests are queued and spaced out so a
  // burst of tutor actions stays under Gemini's free-tier rate limit.
  function createClient({ endpoint = "/api/gemini", minimumInterval = 6500 } = {}) {
    let geminiRequestQueue = Promise.resolve();
    let lastGeminiRequestAt = 0;

    function wait(milliseconds) {
      return new Promise((resolve) => setTimeout(resolve, milliseconds));
    }

    async function callGeminiOnce(promptText, jsonMode = false, task = "chat") {
      const proxyResponse = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: promptText, json: jsonMode, task }),
      }).catch(() => null);
      if (proxyResponse?.ok) {
        const payload = await proxyResponse.json();
        return payload.text?.trim() || null;
      }
      const detail = await proxyResponse?.json().catch(() => ({}));
      const error = new Error(detail?.error || "Gemini先生に接続できませんでした");
      error.status = proxyResponse?.status || 0;
      error.retryAfter = Number(proxyResponse?.headers.get("retry-after")) || 0;
      throw error;
    }

    async function callGeminiStreamOnce(
      promptText,
      jsonMode = false,
      task = "chat",
      onText = () => {},
    ) {
      const proxyResponse = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: promptText,
          json: jsonMode,
          task,
          stream: true,
        }),
      }).catch(() => null);
      if (!proxyResponse?.ok) {
        const detail = await proxyResponse?.json().catch(() => ({}));
        const error = new Error(detail?.error || "Gemini先生に接続できませんでした");
        error.status = proxyResponse?.status || 0;
        error.retryAfter = Number(proxyResponse?.headers.get("retry-after")) || 0;
        throw error;
      }

      const reader = proxyResponse.body?.getReader();
      if (!reader) throw new Error("ストリーミング応答を受信できませんでした");
      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";

      const consumeEvent = (eventText) => {
        const data = eventText
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("");
        if (!data || data === "[DONE]") return;
        const payload = JSON.parse(data);
        const delta = (payload.candidates?.[0]?.content?.parts || [])
          .map((part) => part.text || "")
          .join("");
        if (!delta) return;
        fullText += delta;
        onText(fullText);
      };

      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const events = buffer.split(/\r?\n\r?\n/);
        buffer = events.pop() || "";
        events.forEach(consumeEvent);
        if (done) break;
      }
      if (buffer.trim()) consumeEvent(buffer);
      return fullText.trim();
    }

    function queueGeminiRequest(runOnce) {
      const run = async () => {
        const remaining = minimumInterval - (Date.now() - lastGeminiRequestAt);
        if (remaining > 0) await wait(remaining);
        lastGeminiRequestAt = Date.now();
        try {
          return await runOnce();
        } catch (error) {
          if (error.status !== 429) throw error;
          const retryDelay = Math.max(12000, error.retryAfter * 1000);
          await wait(retryDelay);
          lastGeminiRequestAt = Date.now();
          return runOnce();
        }
      };
      const request = geminiRequestQueue.then(run, run);
      geminiRequestQueue = request.catch(() => null);
      return request;
    }

    function callGemini(promptText, jsonMode = false, task = "chat") {
      return queueGeminiRequest(
        () => callGeminiOnce(promptText, jsonMode, task),
      );
    }

    function callGeminiStream(
      promptText,
      jsonMode = false,
      task = "chat",
      onText = () => {},
    ) {
      return queueGeminiRequest(
        () => callGeminiStreamOnce(promptText, jsonMode, task, onText),
      );
    }

    return {
      call: callGemini,
      stream: callGeminiStream,
    };
  }

  function extractPartialJsonString(text, key) {
    const source = String(text || "");
    const keyIndex = source.indexOf(`"${key}"`);
    if (keyIndex < 0) return "";
    const colonIndex = source.indexOf(":", keyIndex + key.length + 2);
    const quoteIndex = source.indexOf('"', colonIndex + 1);
    if (colonIndex < 0 || quoteIndex < 0) return "";
    let result = "";
    for (let index = quoteIndex + 1; index < source.length; index += 1) {
      const character = source[index];
      if (character === '"') break;
      if (character !== "\\") {
        result += character;
        continue;
      }
      index += 1;
      if (index >= source.length) break;
      const escaped = source[index];
      const escapes = {
        '"': '"',
        "\\": "\\",
        "/": "/",
        b: "\b",
        f: "\f",
        n: "\n",
        r: "\r",
        t: "\t",
      };
      if (escaped === "u") {
        const hex = source.slice(index + 1, index + 5);
        if (!/^[0-9a-f]{4}$/i.test(hex)) break;
        result += String.fromCharCode(Number.parseInt(hex, 16));
        index += 4;
      } else {
        result += escapes[escaped] ?? escaped;
      }
    }
    return result;
  }

  function parseJsonText(text) {
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      return match ? JSON.parse(match[0]) : null;
    }
  }

  return Object.freeze({ createClient, extractPartialJsonString, parseJsonText });
});
