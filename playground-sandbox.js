((root, factory) => {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PopPopSandbox = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  "use strict";

  // AI-generated lessons are checked in their own worker, so a runaway
  // program there can be terminated without touching the user's runtime.
  function create(workerUrl) {
    let sandboxWorker = null;
    let sandboxReady = null;
    let sandboxSequence = 0;
    const sandboxRequests = new Map();

    function resetSandboxWorker(error) {
      sandboxWorker?.terminate();
      sandboxWorker = null;
      sandboxReady = null;
      sandboxRequests.forEach(({ resolve, timeout, fallback }) => {
        clearTimeout(timeout);
        resolve({ ...fallback, error });
      });
      sandboxRequests.clear();
    }

    function ensureSandboxWorker() {
      if (sandboxReady) return sandboxReady;
      sandboxReady = new Promise((resolve, reject) => {
        sandboxWorker = new Worker(workerUrl);
        sandboxWorker.addEventListener("message", (event) => {
          const message = event.data ?? {};
          if (message.type === "ready") {
            resolve();
            return;
          }
          if (message.type === "boot-error") {
            reject(new Error(message.message));
            resetSandboxWorker("検査用の実行環境を準備できませんでした");
            return;
          }
          const pending = sandboxRequests.get(message.requestId);
          if (!pending) return;
          sandboxRequests.delete(message.requestId);
          clearTimeout(pending.timeout);
          pending.resolve({
            ok: message.ok === true,
            result: message.result,
            output: String(message.output || ""),
            error: message.error || "",
          });
        });
        sandboxWorker.addEventListener("error", () => {
          reject(new Error("検査用の実行環境を開始できません"));
          resetSandboxWorker("検査用の実行環境を開始できません");
        });
      });
      sandboxReady.catch(() => {});
      return sandboxReady;
    }

    async function sandboxRequest(type, source, timeoutMs, timeoutError) {
      const fallback = { ok: false, result: null, output: "" };
      try {
        await ensureSandboxWorker();
      } catch (error) {
        return { ...fallback, error: error.message };
      }
      const requestId = ++sandboxSequence;
      return new Promise((resolve) => {
        // The timer starts after boot, so a slow first Pyodide load is not
        // mistaken for a runaway program. On timeout the worker is discarded.
        const timeout = setTimeout(() => {
          sandboxRequests.delete(requestId);
          resolve({ ...fallback, error: timeoutError });
          resetSandboxWorker(timeoutError);
        }, timeoutMs);
        sandboxRequests.set(requestId, { resolve, timeout, fallback });
        sandboxWorker.postMessage({ type, requestId, source: String(source || "") });
      });
    }

    function validate(source) {
      return sandboxRequest(
        "validate-source",
        source,
        10000,
        "構文検査が時間切れになりました",
      );
    }

    function preflight(source) {
      return sandboxRequest(
        "preflight-program",
        source,
        12000,
        "事前実行が時間切れになりました",
      );
    }

    return { validate, preflight, reset: resetSandboxWorker };
  }

  return Object.freeze({ create });
});
