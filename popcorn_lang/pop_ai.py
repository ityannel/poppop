"""AI に聞く処理（Ask、AskJson）。特定の会社やサービスには依存しません。

つなぎ先は、環境変数で決めます（ソースに URL や鍵を書かない）。
  POPCORN_AI_URL       送り先の URL（必須。サービスの既定値は持ちません）
  POPCORN_AI_KEY       鍵（なくてもよい。ローカルの AI などは不要）
  POPCORN_AI_MODEL     モデル名（`model` オプションで上書きできる）
  POPCORN_AI_PROTOCOL  `openai`（既定。多くのサービスとローカルの AI が話せる形）か `anthropic`
"""

import json
import os
import sys
import urllib.error
import urllib.request

from .evaluator import PopCornError, _is_number, _to_num
from .pop_builtins import _type_error
from .pop_stdlib import _fail, std

_PROTOCOLS = ("openai", "anthropic")
_DEFAULT_TIMEOUT = 60.0
_DEFAULT_MAX_TOKENS = 1024
_OPTION_NAMES = ("model", "system", "temperature", "max_tokens", "timeout")


def _read_input(current, name):
    if isinstance(current, tuple):
        if len(current) != 2:
            _type_error(f"{name} requires Str or (Str, options)")
        prompt, options = current
    else:
        prompt, options = current, {}
    if not isinstance(prompt, str):
        _type_error(f"{name} requires Str or (Str, options)")
    if not isinstance(options, dict):
        _type_error(f"{name} options must be a Dict")
    for key in options:
        if key not in _OPTION_NAMES:
            _type_error(f"{name} option '{key}' is not known")
    return prompt, options


def _settings(options, name):
    if sys.platform == "emscripten":
        _fail(f"{name} is not available in the browser Playground yet")
    url = os.environ.get("POPCORN_AI_URL", "").strip()
    if not url:
        _fail(f"{name} needs the environment variable POPCORN_AI_URL")
    if not (url.startswith("http://") or url.startswith("https://")):
        _fail("POPCORN_AI_URL must start with http:// or https://")
    protocol = os.environ.get("POPCORN_AI_PROTOCOL", "openai").strip().lower() or "openai"
    if protocol not in _PROTOCOLS:
        _fail(f"POPCORN_AI_PROTOCOL must be one of: {', '.join(_PROTOCOLS)}")
    model = options.get("model", os.environ.get("POPCORN_AI_MODEL", "")) or ""
    if not isinstance(model, str) or not model.strip():
        _fail(f"{name} needs a model: set the environment variable POPCORN_AI_MODEL or the option model")
    system = options.get("system")
    if system is not None and not isinstance(system, str):
        _type_error(f"{name} option system must be Str")
    temperature = options.get("temperature")
    if temperature is not None and not _is_number(temperature):
        _type_error(f"{name} option temperature must be Num")
    max_tokens = options.get("max_tokens", _DEFAULT_MAX_TOKENS)
    if not _is_number(max_tokens) or _to_num(max_tokens) < 1:
        _type_error(f"{name} option max_tokens must be a Num of 1 or more")
    timeout = options.get("timeout", _DEFAULT_TIMEOUT)
    if not _is_number(timeout) or _to_num(timeout) <= 0:
        _type_error(f"{name} option timeout must be a Num greater than 0")
    return {
        "url": url, "protocol": protocol, "key": os.environ.get("POPCORN_AI_KEY", "").strip(),
        "model": model.strip(), "system": system,
        "temperature": None if temperature is None else float(_to_num(temperature)),
        "max_tokens": int(_to_num(max_tokens)), "timeout": float(_to_num(timeout)),
    }


def _build_request(prompt, cfg):
    headers = {"Content-Type": "application/json", "User-Agent": "PopCorn/1"}
    if cfg["protocol"] == "anthropic":
        body = {"model": cfg["model"], "max_tokens": cfg["max_tokens"], "messages": [{"role": "user", "content": prompt}]}
        if cfg["system"]:
            body["system"] = cfg["system"]
        if cfg["key"]:
            headers["x-api-key"] = cfg["key"]
        headers["anthropic-version"] = "2023-06-01"
    else:
        messages = ([{"role": "system", "content": cfg["system"]}] if cfg["system"] else []) + [{"role": "user", "content": prompt}]
        body = {"model": cfg["model"], "messages": messages, "max_tokens": cfg["max_tokens"]}
        if cfg["key"]:
            headers["Authorization"] = f"Bearer {cfg['key']}"
    if cfg["temperature"] is not None:
        body["temperature"] = cfg["temperature"]
    return headers, json.dumps(body).encode("utf-8")


def _reply_text(data, protocol, name):
    try:
        if protocol == "anthropic":
            return "".join(part.get("text", "") for part in data["content"] if part.get("type") == "text")
        content = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError, AttributeError):
        raise PopCornError("NetworkError", f"{name} got a reply in an unexpected shape (protocol: {protocol})")
    if isinstance(content, list):
        return "".join(part.get("text", "") for part in content if isinstance(part, dict))
    if not isinstance(content, str):
        raise PopCornError("NetworkError", f"{name} got a reply in an unexpected shape (protocol: {protocol})")
    return content


def _ask(prompt, options, name):
    cfg = _settings(options, name)
    headers, data = _build_request(prompt, cfg)
    request = urllib.request.Request(cfg["url"], data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=cfg["timeout"]) as response:
            raw = response.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as err:
        detail = err.read().decode("utf-8", errors="replace").strip().replace("\n", " ")[:200]
        raise PopCornError("NetworkError", f"{name} was refused with status {err.code}: {detail}")
    except Exception as exc:
        raise PopCornError("NetworkError", f"{name} could not reach the AI: {exc}")
    try:
        parsed = json.loads(raw)
    except ValueError:
        raise PopCornError("NetworkError", f"{name} got a reply that is not JSON")
    return _reply_text(parsed, cfg["protocol"], name)


_USAGE = "`Str`、または `(Str, options)`"
_OPTIONS_DOC = "`options` は `Dict`（`model`・`system`・`temperature`・`max_tokens`・`timeout`）。つなぎ先は環境変数 `POPCORN_AI_URL`・`POPCORN_AI_KEY`・`POPCORN_AI_MODEL`・`POPCORN_AI_PROTOCOL` で決めます（ソースに鍵を書かない）。"


@std(
    "AI", "Ask", _USAGE,
    "AI に聞いて、答えの `Str` を返します。" + _OPTIONS_DOC + "外部効果あり（結果が毎回ちがうことがあります）。",
    "文字列",
    demo=[('"PopCorn を一言で" >> Ask', "データを >> で流して学べる言語です")],
)
def builtin_Ask(current, env, evaluator):
    prompt, options = _read_input(current, "Ask")
    return _ask(prompt, options, "Ask")


_FENCE = ("```json", "```JSON", "```")


def _strip_fence(text):
    text = text.strip()
    for marker in _FENCE:
        if text.startswith(marker):
            text = text[len(marker):]
            break
    if text.endswith("```"):
        text = text[:-3]
    return text.strip()


@std(
    "AI", "AskJson", _USAGE,
    "AI に「JSON だけで答えて」と頼み、答えを PopCorn の値（`Dict`・`List` など）にして返します。JSON として読めないときは `RuntimeError`。" + _OPTIONS_DOC + "外部効果あり。",
    "要素",
    demo=[('"りんごの色を {\\"color\\": ...} の形で" >> AskJson >> Get("color")', "赤")],
)
def builtin_AskJson(current, env, evaluator):
    prompt, options = _read_input(current, "AskJson")
    options = dict(options)
    guard = "Reply with valid JSON only. No explanation and no code fence."
    options["system"] = f"{options['system']}\n{guard}" if isinstance(options.get("system"), str) and options["system"] else guard
    text = _strip_fence(_ask(prompt, options, "AskJson"))
    try:
        return _from_json(json.loads(text))
    except ValueError:
        _fail("AskJson could not read the reply as JSON")


def _from_json(value):
    if isinstance(value, bool) or value is None or isinstance(value, str):
        return value
    if isinstance(value, (int, float)):
        return _to_num(value)
    if isinstance(value, list):
        return [_from_json(v) for v in value]
    return {str(k): _from_json(v) for k, v in value.items()}
