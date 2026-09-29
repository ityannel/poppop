"use strict";

import assert from "node:assert/strict";

await import("./playground-specification.js");
await import("./playground-gemini.js");
await import("./playground-sandbox.js");
const {
  parseSpecification,
  friendlySpecificationExamples,
  encodeSource,
  decodeSource,
} = globalThis.PopPopSpecification;
const { createClient, extractPartialJsonString, parseJsonText } = globalThis.PopPopGemini;

// Specification parsing
const markdown = [
  "## 2. パイプライン",
  "```poppop",
  "1 >> Display.",
  "```",
  "## 3. 標準関数一覧",
  "| 分類 | 名前 | 入力 | 説明 |",
  "|---|---|---|---|",
  "| 数値 | `Sum` | List | 合計を返す。 |",
  "## 4. 次の節",
  "| 数値 | `NotAReference` | List | 無視される。 |",
].join("\n");
const parsed = parseSpecification(markdown);
assert.deepEqual(parsed.examples, [{ title: "2. パイプライン", code: "1 >> Display." }]);
assert.deepEqual(parsed.references, [
  { category: "数値", name: "Sum", input: "List", description: "合計を返す。" },
]);
assert.equal(friendlySpecificationExamples(parsed.examples)[0].title, "仕様の例｜パイプライン");

// Share URLs round-trip Unicode source code
const source = "\"こんにちは🍿\" >> Display.";
assert.equal(decodeSource(encodeSource(source)), source);
assert.match(encodeSource(source), /^[A-Za-z0-9_-]+$/);
assert.equal(decodeSource("%%%"), null);

// Streaming JSON helpers
assert.equal(extractPartialJsonString('{"message":"行1\\n行2', "message"), "行1\n行2");
assert.equal(extractPartialJsonString('{"other":"x"}', "message"), "");
assert.deepEqual(parseJsonText('先頭の文 {"a": 1} 末尾'), { a: 1 });
assert.equal(parseJsonText(""), null);

// The Gemini client retries once after a 429
{
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push([url, JSON.parse(init.body)]);
    if (calls.length === 1) {
      return new Response(JSON.stringify({ error: "busy" }), { status: 429, headers: { "retry-after": "0" } });
    }
    return new Response(JSON.stringify({ text: " ok " }), { status: 200 });
  };
  const originalSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (callback) => originalSetTimeout(callback, 0);
  try {
    const client = createClient({ endpoint: "/test", minimumInterval: 0 });
    assert.equal(await client.call("hi", false, "chat"), "ok");
    assert.equal(calls.length, 2);
    assert.equal(calls[0][0], "/test");
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
  }
}

// The sandbox discards a worker that does not answer in time
{
  const workers = [];
  class FakeWorker {
    constructor() {
      this.listeners = {};
      this.terminated = false;
      workers.push(this);
      queueMicrotask(() => this.emit({ type: "ready" }));
    }
    addEventListener(type, listener) { this.listeners[type] = listener; }
    emit(data) { this.listeners.message?.({ data }); }
    terminate() { this.terminated = true; }
    postMessage(message) {
      if (message.source === "fast") {
        queueMicrotask(() => this.emit({ type: "program-preflight", requestId: message.requestId, ok: true, result: 1, output: "1" }));
      }
    }
  }
  const originalWorker = globalThis.Worker;
  const originalSetTimeout = globalThis.setTimeout;
  globalThis.Worker = FakeWorker;
  globalThis.setTimeout = (callback, delay) => originalSetTimeout(callback, delay > 1000 ? 5 : delay);
  try {
    const sandbox = globalThis.PopPopSandbox.create("worker.js");
    assert.deepEqual(await sandbox.preflight("fast"), { ok: true, result: 1, output: "1", error: "" });
    const slow = await sandbox.preflight("slow");
    assert.equal(slow.ok, false);
    assert.match(slow.error, /時間切れ/);
    assert.equal(workers[0].terminated, true);
    assert.deepEqual(await sandbox.preflight("fast"), { ok: true, result: 1, output: "1", error: "" });
    assert.equal(workers.length, 2);
  } finally {
    globalThis.Worker = originalWorker;
    globalThis.setTimeout = originalSetTimeout;
  }
}

console.log("playground modules: ok");
