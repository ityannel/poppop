/* PopCorn's browser runtime.
 *
 * The worker deliberately loads the repository's Python sources instead of
 * carrying a JavaScript copy of the language. A fresh worker also gives the
 * Stop button a reliable way to interrupt an infinite Loop.
 */

const PYODIDE_URL = "https://cdn.jsdelivr.net/pyodide/v0.27.7/full/pyodide.js";
const SOURCE_FILES = [
  "__init__.py",
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
  "pop_stdlib.py",
  "cli.py",
  "migrate.py",
  "modules.py",
  "testing.py",
];

let pyodide = null;
let readyPromise = null;
let inputSequence = 0;
const pendingInputs = new Map();

self.waitForTerminalInput = (prompt) => new Promise((resolve) => {
  const id = ++inputSequence;
  pendingInputs.set(id, resolve);
  self.postMessage({ type: "input", id, prompt: String(prompt ?? "") });
});

function sourceUrl(file) {
  const url = new URL(`popcorn_lang/${file}`, self.location.href);
  url.searchParams.set("runtime", String(Date.now()));
  return url;
}

async function installCurrentSources(runtime) {
  const archiveUrl = new URL("popcorn-runtime.zip", self.location.href);
  archiveUrl.searchParams.set("runtime", String(Date.now()));
  const archiveResponse = await fetch(archiveUrl, { cache: "no-store" });
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
  runtime.FS.mkdirTree("/home/pyodide/popcorn_lang");
  await Promise.all(SOURCE_FILES.map(async (file) => {
    const response = await fetch(sourceUrl(file), { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`${file} を取得できませんでした (${response.status})`);
    }
    runtime.FS.writeFile(
      `/home/pyodide/popcorn_lang/${file}`,
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
from popcorn_lang.language_meta import KEYWORDS, SPECIAL_FORMS
from popcorn_lang.gallery import public_gallery
from popcorn_lang.lessons import public_lessons
from popcorn_lang.pop_builtins import BUILTIN_REGISTRY
from popcorn_lang.version import DISPLAY_VERSION
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

async function runProgram(source, lessonId = null, path = null, files = null) {
  const runtime = await boot();
  runtime.setStdout({
    batched: (text) => self.postMessage({ type: "stream", channel: "stdout", text }),
  });
  runtime.setStderr({
    batched: (text) => self.postMessage({ type: "stream", channel: "stderr", text }),
  });
  runtime.globals.set("__popcorn_source", source);
  runtime.globals.set("__popcorn_lesson_id", lessonId);
  runtime.globals.set("__popcorn_path", path);
  runtime.globals.set("__popcorn_files", JSON.stringify(files ?? {}));

  const payload = await runtime.runPythonAsync(`
import json
import time
from popcorn_lang.cli import evaluate, format_error, get_ast_json
from popcorn_lang.evaluator import Evaluator
from popcorn_lang.lessons import validate_lesson
from popcorn_lang.testing import run_tests_after_program

__started = time.perf_counter()
try:
    __evaluator = Evaluator()
    __result = await evaluate(
        __popcorn_source,
        __evaluator,
        path=__popcorn_path,
        files=json.loads(__popcorn_files),
    )
    __payload = {
        "ok": True,
        "result": __result,
        "ast": json.loads(get_ast_json(__popcorn_source)),
    }
    # Test で始まる関数があれば、実行のあとでテストとして呼ぶ（popcorn test と同じ）
    __tests = None if __popcorn_lesson_id else await run_tests_after_program(
        __evaluator, __popcorn_source
    )
    if __tests is not None:
        __payload["tests"] = __tests
        if __tests["error"]:
            __payload["ok"] = False
            __payload["error"] = __tests["error"]
    if __popcorn_lesson_id:
        __payload["lesson"] = validate_lesson(
            __popcorn_lesson_id, __popcorn_source, __result
        )
except Exception as __error:
    __payload = {
        "ok": False,
        "error": format_error(__error),
        "ast": json.loads(get_ast_json(__popcorn_source)),
    }
__payload["elapsedMs"] = round((time.perf_counter() - __started) * 1000, 2)
json.dumps(__payload, ensure_ascii=False, default=str)
`);
  self.postMessage({ type: "result", ...JSON.parse(payload) });
}

async function analyzeProgram(source, requestId) {
  const runtime = await boot();
  runtime.globals.set("__popcorn_source", source);
  const payload = JSON.parse(runtime.runPython(`
import json
from popcorn_lang.cli import get_ast_json, get_warnings
json.dumps({
    "ast": json.loads(get_ast_json(__popcorn_source)),
    "warnings": get_warnings(__popcorn_source),
}, ensure_ascii=False)
`));
  const ast = payload.ast;
  if (ast.error) {
    self.postMessage({
      type: "analysis",
      requestId,
      diagnostics: [ast.error],
      warnings: [],
      ast: null,
    });
  } else {
    self.postMessage({
      type: "analysis",
      requestId,
      diagnostics: [],
      warnings: payload.warnings ?? [],
      ast,
    });
  }
}

async function validateSource(source, requestId) {
  const runtime = await boot();
  runtime.globals.set("__popcorn_source", source);
  const payload = JSON.parse(runtime.runPython(`
import json
from popcorn_lang.cli import get_ast_json
__ast = json.loads(get_ast_json(__popcorn_source))
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
  runtime.globals.set("__popcorn_source", source);
  const payload = await runtime.runPythonAsync(`
import json
from popcorn_lang.cli import evaluate, format_error
try:
    __result = await evaluate(__popcorn_source)
    __payload = {"ok": True, "result": __result}
except Exception as __error:
    __payload = {"ok": False, "error": format_error(__error), "result": None}
json.dumps(__payload, ensure_ascii=False, default=str)
`);
  self.postMessage({
    type: "program-preflight",
    requestId,
    ...JSON.parse(payload),
    output: output.join("\n"),
  });
}

// 保存してあるコードの、旧形式の { } ブロックを、`:` と字下げに書きかえる（意味が変わらないときだけ）
async function migrateFiles(files) {
  const runtime = await readyPromise;
  runtime.globals.set("__popcorn_files", JSON.stringify(files));
  const payload = runtime.runPython(`
import json
from popcorn_lang.migrate import migrate_braces

__changed = {}
for __path, __source in json.loads(__popcorn_files).items():
    if not isinstance(__source, str) or "{" not in __source:
        continue
    try:
        __migrated = migrate_braces(__source)
    except Exception:
        continue
    if __migrated != __source:
        __changed[__path] = __migrated
json.dumps(__changed, ensure_ascii=False)
`);
  self.postMessage({ type: "migrated-files", files: JSON.parse(payload) });
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
      message.path ? String(message.path) : null,
      message.files && typeof message.files === "object" ? message.files : null,
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

  if (message.type === "migrate-files") {
    migrateFiles(message.files ?? {}).catch(() => {
      self.postMessage({ type: "migrated-files", files: {} });
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
