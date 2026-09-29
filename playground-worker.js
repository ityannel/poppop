/* PopPop's browser runtime.
 *
 * The worker deliberately loads the repository's Python sources instead of
 * carrying a JavaScript copy of the language. A fresh worker also gives the
 * Stop button a reliable way to interrupt an infinite Loop.
 */

const PYODIDE_URL = "https://cdn.jsdelivr.net/pyodide/v0.27.7/full/pyodide.js";
const SOURCE_FILES = [
  "__init__.py",
  "__main__.py",
  "version.py",
  "language_meta.py",
  "lessons.py",
  "gallery.py",
  "ast_nodes.py",
  "environment.py",
  "lexer.py",
  "parser.py",
  "evaluator.py",
  "pop_builtins.py",
  "cli.py",
];

let pyodide = null;
let readyPromise = null;
let inputSequence = 0;
let inputDisabled = false;
const pendingInputs = new Map();

self.waitForTerminalInput = (prompt) => new Promise((resolve) => {
  // Preflight runs have no terminal; answer Input with an empty line
  // instead of opening the user's input box.
  if (inputDisabled) {
    resolve("");
    return;
  }
  const id = ++inputSequence;
  pendingInputs.set(id, resolve);
  self.postMessage({ type: "input", id, prompt: String(prompt ?? "") });
});

function sourceUrl(file) {
  return new URL(`poppop_lang/${file}`, self.location.href);
}

async function installCurrentSources(runtime) {
  // "no-cache" always revalidates, so a new deployment is picked up at once
  // while an unchanged runtime is answered with a cheap 304.
  const archiveUrl = new URL("poppop-runtime.zip", self.location.href);
  const archiveResponse = await fetch(archiveUrl, { cache: "no-cache" });
  if (archiveResponse.ok) {
    runtime.unpackArchive(
      new Uint8Array(await archiveResponse.arrayBuffer()),
      "zip",
      { extractDir: "/home/pyodide" },
    );
    runtime.runPython(`
import importlib
import sys
if "/home/pyodide" not in sys.path:
    sys.path.insert(0, "/home/pyodide")
importlib.invalidate_caches()
`);
    return;
  }

  // A source checkout normally has no generated archive. Load the known core
  // modules directly so `python -m http.server` works without a build step.
  // tests/test_playground.py checks that SOURCE_FILES lists every module.
  runtime.FS.mkdirTree("/home/pyodide/poppop_lang");
  await Promise.all(SOURCE_FILES.map(async (file) => {
    const response = await fetch(sourceUrl(file), { cache: "no-cache" });
    if (!response.ok) {
      throw new Error(`${file} を取得できませんでした (${response.status})`);
    }
    runtime.FS.writeFile(
      `/home/pyodide/poppop_lang/${file}`,
      await response.text(),
      { encoding: "utf8" },
    );
  }));
  runtime.runPython(`
import importlib
import sys
if "/home/pyodide" not in sys.path:
    sys.path.insert(0, "/home/pyodide")
importlib.invalidate_caches()
`);
}

async function boot() {
  if (readyPromise) return readyPromise;
  readyPromise = (async () => {
    importScripts(PYODIDE_URL);
    pyodide = await loadPyodide();
    await installCurrentSources(pyodide);

    const metadata = JSON.parse(pyodide.runPython(`
import json
from poppop_lang.language_meta import KEYWORDS, SPECIAL_FORMS
from poppop_lang.gallery import public_gallery
from poppop_lang.lessons import public_lessons
from poppop_lang.pop_builtins import BUILTIN_REGISTRY
from poppop_lang.version import DISPLAY_VERSION
json.dumps({
    "displayVersion": DISPLAY_VERSION,
    "builtins": sorted(BUILTIN_REGISTRY.keys()),
    "specialForms": list(SPECIAL_FORMS),
    "keywords": list(KEYWORDS),
    "lessons": public_lessons(),
    "gallery": public_gallery(),
}, ensure_ascii=False)
`));
    self.postMessage({ type: "ready", ...metadata });
    return pyodide;
  })().catch((error) => {
    readyPromise = null;
    self.postMessage({
      type: "boot-error",
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  });
  return readyPromise;
}

async function runProgram(source, lessonId = null) {
  const runtime = await boot();
  runtime.setStdout({
    batched: (text) => self.postMessage({ type: "stream", channel: "stdout", text }),
  });
  runtime.setStderr({
    batched: (text) => self.postMessage({ type: "stream", channel: "stderr", text }),
  });
  runtime.globals.set("__poppop_source", source);
  runtime.globals.set("__poppop_lesson_id", lessonId);

  const payload = await runtime.runPythonAsync(`
import json
import time
from poppop_lang.cli import evaluate, format_error, get_ast_json
from poppop_lang.lessons import validate_lesson

__started = time.perf_counter()
try:
    __result = await evaluate(__poppop_source)
    __payload = {
        "ok": True,
        "result": __result,
        "ast": json.loads(get_ast_json(__poppop_source)),
    }
    if __poppop_lesson_id:
        __payload["lesson"] = validate_lesson(
            __poppop_lesson_id, __poppop_source, __result
        )
except Exception as __error:
    __payload = {
        "ok": False,
        "error": format_error(__error),
        "ast": json.loads(get_ast_json(__poppop_source)),
    }
__payload["elapsedMs"] = round((time.perf_counter() - __started) * 1000, 2)
json.dumps(__payload, ensure_ascii=False, default=str)
`);
  self.postMessage({ type: "result", ...JSON.parse(payload) });
}

async function analyzeProgram(source, requestId) {
  const runtime = await boot();
  runtime.globals.set("__poppop_source", source);
  const payload = JSON.parse(runtime.runPython(`
import json
from poppop_lang.cli import get_ast_json
get_ast_json(__poppop_source)
`));
  if (payload.error) {
    self.postMessage({
      type: "analysis",
      requestId,
      diagnostics: [payload.error],
      ast: null,
    });
  } else {
    self.postMessage({
      type: "analysis",
      requestId,
      diagnostics: [],
      ast: payload,
    });
  }
}

async function validateSource(source, requestId) {
  const runtime = await boot();
  runtime.globals.set("__poppop_source", source);
  const payload = JSON.parse(runtime.runPython(`
import json
from poppop_lang.cli import get_ast_json
__ast = json.loads(get_ast_json(__poppop_source))
json.dumps({
    "ok": not bool(__ast.get("error")),
    "error": __ast.get("error"),
}, ensure_ascii=False)
`));
  self.postMessage({
    type: "source-validation",
    requestId,
    ...payload,
  });
}

async function preflightProgram(source, requestId) {
  const runtime = await boot();
  const output = [];
  runtime.setStdout({ batched: (text) => output.push(String(text)) });
  runtime.setStderr({ batched: () => {} });
  runtime.globals.set("__poppop_source", source);
  inputDisabled = true;
  const payload = await runtime.runPythonAsync(`
import json
from poppop_lang.cli import evaluate, format_error
try:
    __result = await evaluate(__poppop_source)
    __payload = {"ok": True, "result": __result}
except Exception as __error:
    __payload = {"ok": False, "error": format_error(__error), "result": None}
json.dumps(__payload, ensure_ascii=False, default=str)
`).finally(() => {
    inputDisabled = false;
  });
  self.postMessage({
    type: "program-preflight",
    requestId,
    ...JSON.parse(payload),
    output: output.join("\n"),
  });
}

self.addEventListener("message", (event) => {
  const message = event.data ?? {};
  if (message.type === "input-result") {
    const resolve = pendingInputs.get(message.id);
    if (resolve) {
      pendingInputs.delete(message.id);
      resolve(String(message.value ?? ""));
    }
    return;
  }

  if (message.type === "run") {
    runProgram(
      String(message.source ?? ""),
      message.lessonId ? String(message.lessonId) : null,
    ).catch((error) => {
      self.postMessage({
        type: "result",
        ok: false,
        error: `PlaygroundError: ${error instanceof Error ? error.message : String(error)}`,
        elapsedMs: 0,
        ast: null,
      });
    });
    return;
  }

  if (message.type === "analyze") {
    analyzeProgram(String(message.source ?? ""), message.requestId).catch((error) => {
      self.postMessage({
        type: "analysis",
        requestId: message.requestId,
        diagnostics: [error instanceof Error ? error.message : String(error)],
        ast: null,
      });
    });
    return;
  }

  if (message.type === "validate-source") {
    validateSource(String(message.source ?? ""), message.requestId).catch((error) => {
      self.postMessage({
        type: "source-validation",
        requestId: message.requestId,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    });
    return;
  }

  if (message.type === "preflight-program") {
    preflightProgram(String(message.source ?? ""), message.requestId).catch((error) => {
      self.postMessage({
        type: "program-preflight",
        requestId: message.requestId,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        output: "",
      });
    });
  }
});

boot();
