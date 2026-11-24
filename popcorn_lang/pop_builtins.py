import asyncio
import datetime
from decimal import Decimal, ROUND_HALF_UP
import json
import math
import os
import random
import re
import sys
import time
import urllib.error
import urllib.request

from .evaluator import (
    BreakException,
    PopCornError,
    ReturnException,
    _as_whole_int,
    _contains_value,
    _is_number,
    _to_num,
    _values_equal,
    format_popcorn_str,
    popcorn_type_name,
)

BUILTIN_REGISTRY = {}


def _type_error(msg: str):
    raise PopCornError("TypeError", msg)


def _wrap_unexpected(fn_name: str, exc: Exception):
    if isinstance(exc, (PopCornError, ReturnException, BreakException)):
        raise exc
    raise PopCornError("RuntimeError", f"Error in {fn_name}: {exc}")


def _to_json_ready(value):
    if value is None or isinstance(value, (bool, str)):
        return value
    if _is_number(value):
        num = _to_num(value)
        if num == 0.0:
            return 0
        if num.is_integer() and abs(num) < 1e21:
            return int(num)
        return num
    if isinstance(value, list):
        return [_to_json_ready(v) for v in value]
    if isinstance(value, tuple):
        return [_to_json_ready(v) for v in value]
    if isinstance(value, dict):
        return {k: _to_json_ready(v) for k, v in value.items()}
    _type_error(f"Cannot convert {popcorn_type_name(value)} to JSON")


def _from_json_normalize(value):
    if value is None or isinstance(value, (bool, str)):
        return value
    if _is_number(value):
        return _to_num(value)
    if isinstance(value, list):
        return [_from_json_normalize(v) for v in value]
    if isinstance(value, dict):
        return {k: _from_json_normalize(v) for k, v in value.items()}
    return value


# --- Type built-ins ---


def builtin_Type(current, env, evaluator):
    return popcorn_type_name(current)


BUILTIN_REGISTRY["Type"] = builtin_Type


def builtin_Num(current, env, evaluator):
    if _is_number(current):
        return _to_num(current)
    if isinstance(current, str):
        if re.fullmatch(r"[+-]?(?:\d+(?:\.\d*)?|\.\d+)", current):
            return _to_num(float(current))
    _type_error(f"Cannot cast '{current}' to Num")


BUILTIN_REGISTRY["Num"] = builtin_Num


def builtin_Str(current, env, evaluator):
    return format_popcorn_str(current)


BUILTIN_REGISTRY["Str"] = builtin_Str


def builtin_List(current, env, evaluator):
    if isinstance(current, list):
        return current
    if isinstance(current, tuple):
        return list(current)
    _type_error(f"Expected List or Tuple, got {popcorn_type_name(current)}")


BUILTIN_REGISTRY["List"] = builtin_List


def builtin_Dict(current, env, evaluator):
    if isinstance(current, dict):
        return current
    _type_error(f"Expected Dict, got {popcorn_type_name(current)}")


BUILTIN_REGISTRY["Dict"] = builtin_Dict


def builtin_Bool(current, env, evaluator):
    if isinstance(current, bool):
        return current
    if _is_number(current):
        num = _to_num(current)
        if num == 1.0:
            return True
        if num == 0.0:
            return False
    _type_error("Bool accepts only true, false, 1, or 0")


BUILTIN_REGISTRY["Bool"] = builtin_Bool


# --- Numeric built-ins ---


def builtin_Add(current, env, evaluator):
    if isinstance(current, tuple) and len(current) == 2:
        left, right = current
        if _is_number(left) and _is_number(right):
            return _to_num(float(left) + float(right))
        if isinstance(left, str) and isinstance(right, str):
            return left + right
        if isinstance(left, list) and isinstance(right, list):
            return left + right
    _type_error("Add requires (left, right) of Num values, Str values, or List values")


BUILTIN_REGISTRY["Add"] = builtin_Add


def builtin_Div(current, env, evaluator):
    if isinstance(current, tuple) and len(current) == 2:
        left = _as_whole_int(current[0], "Div requires two whole Num values")
        right = _as_whole_int(current[1], "Div requires two whole Num values")
        if right == 0:
            raise PopCornError("RuntimeError", "Division by zero")
        q = abs(left) // abs(right)
        res = -q if (left < 0) ^ (right < 0) else q
        return _to_num(res)
    _type_error("Div requires (left, right) of two whole Num values")


BUILTIN_REGISTRY["Div"] = builtin_Div


def builtin_Sum(current, env, evaluator):
    if not isinstance(current, list) or not all(_is_number(item) for item in current):
        _type_error("Sum requires a List of Num values")
    total = 0.0
    for item in current:
        total = _to_num(total + float(item))
    return total


BUILTIN_REGISTRY["Sum"] = builtin_Sum


def builtin_Average(current, env, evaluator):
    if not isinstance(current, list) or not all(_is_number(item) for item in current):
        _type_error("Average requires a List of Num values")
    if not current:
        raise PopCornError("RuntimeError", "Average requires a non-empty List")
    total = 0.0
    for item in current:
        total = _to_num(total + float(item))
    return _to_num(total / len(current))


BUILTIN_REGISTRY["Average"] = builtin_Average


def builtin_Max(current, env, evaluator):
    if not isinstance(current, list):
        _type_error("Max requires a List of Num or Str values")
    if not current:
        raise PopCornError("RuntimeError", "Max requires a non-empty List")
    if all(_is_number(item) for item in current):
        return _to_num(max(current))
    if all(isinstance(item, str) for item in current):
        return max(current)
    _type_error("Max requires a List of Num or Str values")


BUILTIN_REGISTRY["Max"] = builtin_Max


def builtin_Min(current, env, evaluator):
    if not isinstance(current, list):
        _type_error("Min requires a List of Num or Str values")
    if not current:
        raise PopCornError("RuntimeError", "Min requires a non-empty List")
    if all(_is_number(item) for item in current):
        return _to_num(min(current))
    if all(isinstance(item, str) for item in current):
        return min(current)
    _type_error("Min requires a List of Num or Str values")


BUILTIN_REGISTRY["Min"] = builtin_Min


def builtin_Round(current, env, evaluator):
    if _is_number(current):
        num = _to_num(current)
        rounded = int(Decimal(str(num)).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
        return _to_num(rounded)
    _type_error("Round requires Num")


BUILTIN_REGISTRY["Round"] = builtin_Round


def builtin_Abs(current, env, evaluator):
    if _is_number(current):
        return _to_num(abs(float(current)))
    _type_error("Abs requires Num")


BUILTIN_REGISTRY["Abs"] = builtin_Abs


def builtin_Random(current, env, evaluator):
    if isinstance(current, tuple) and len(current) == 2:
        minimum = _as_whole_int(current[0], "Random requires two whole Num values")
        maximum = _as_whole_int(current[1], "Random requires two whole Num values")
        if minimum > maximum:
            raise PopCornError("RuntimeError", "Random requires minimum <= maximum")
        return _to_num(random.randint(minimum, maximum))
    _type_error("Random requires (minimum, maximum) of two whole Num values")


BUILTIN_REGISTRY["Random"] = builtin_Random


def builtin_Range(current, env, evaluator):
    if isinstance(current, tuple) and len(current) == 2:
        start = _as_whole_int(current[0], "Range requires two whole Num values")
        end = _as_whole_int(current[1], "Range requires two whole Num values")
        if start > end:
            return []
        return [float(x) for x in range(start, end + 1)]
    _type_error("Range requires (start, end) of two whole Num values")


BUILTIN_REGISTRY["Range"] = builtin_Range


# --- String built-ins ---


def builtin_Uppercase(current, env, evaluator):
    if isinstance(current, str):
        return current.upper()
    _type_error("Uppercase requires Str")


BUILTIN_REGISTRY["Uppercase"] = builtin_Uppercase


def builtin_Lowercase(current, env, evaluator):
    if isinstance(current, str):
        return current.lower()
    _type_error("Lowercase requires Str")


BUILTIN_REGISTRY["Lowercase"] = builtin_Lowercase


def builtin_Split(current, env, evaluator):
    if isinstance(current, tuple) and len(current) == 2:
        text, delimiter = current
        if isinstance(text, str) and isinstance(delimiter, str):
            if delimiter == "":
                return list(text)
            return text.split(delimiter)
    _type_error("Split requires (Str, Str)")


BUILTIN_REGISTRY["Split"] = builtin_Split


def builtin_Replace(current, env, evaluator):
    if isinstance(current, tuple) and len(current) == 3:
        target, old, new = current
        if isinstance(target, str) and isinstance(old, str) and isinstance(new, str):
            return target.replace(old, new)
    _type_error("Replace requires (Str, Str, Str)")


BUILTIN_REGISTRY["Replace"] = builtin_Replace


def builtin_Join(current, env, evaluator):
    if isinstance(current, tuple) and len(current) == 2:
        items, delimiter = current
        if isinstance(items, list) and isinstance(delimiter, str):
            return delimiter.join(format_popcorn_str(x) for x in items)
    _type_error("Join requires (List, Str)")


BUILTIN_REGISTRY["Join"] = builtin_Join


def builtin_Format(current, env, evaluator):
    if isinstance(current, tuple) and len(current) >= 2:
        template = current[0]
        values = current[1:]
        if isinstance(template, str):
            try:
                formatted_values = [format_popcorn_str(v) for v in values]
                return template.format(*formatted_values)
            except Exception as exc:
                raise PopCornError("RuntimeError", f"Format failed: {exc}")
    _type_error("Format requires (template, value, ...)")


BUILTIN_REGISTRY["Format"] = builtin_Format


# --- Collection built-ins ---


def builtin_Length(current, env, evaluator):
    if isinstance(current, (list, dict, str, tuple)):
        return _to_num(len(current))
    _type_error(f"Cannot get length of {popcorn_type_name(current)}")


BUILTIN_REGISTRY["Length"] = builtin_Length


def builtin_Reverse(current, env, evaluator):
    if isinstance(current, list):
        return list(reversed(current))
    if isinstance(current, str):
        return current[::-1]
    _type_error("Reverse requires List or Str")


BUILTIN_REGISTRY["Reverse"] = builtin_Reverse


def builtin_Get(current, env, evaluator):
    if isinstance(current, tuple) and len(current) in (2, 3):
        target = current[0]
        key = current[1]
        has_default = len(current) == 3
        default = current[2] if has_default else None

        if isinstance(target, (list, tuple)):
            whole_key = _as_whole_int(key, "List indices must be whole Num values")
            if 0 <= whole_key < len(target):
                return target[whole_key]
            if has_default:
                return default
            raise PopCornError("IndexError", f"Index {whole_key} out of bounds")

        if isinstance(target, dict):
            if not isinstance(key, str):
                _type_error("Dict keys must be Str")
            if key in target:
                return target[key]
            if has_default:
                return default
            raise PopCornError("KeyError", f"Key '{key}' not found in dict")

        _type_error(f"Cannot get '{key}' from {popcorn_type_name(target)}")
    _type_error("Get requires (target, key) or (target, key, default)")


BUILTIN_REGISTRY["Get"] = builtin_Get


def builtin_Set(current, env, evaluator):
    if isinstance(current, tuple) and len(current) == 3:
        target, key, value = current
        if isinstance(target, dict):
            if not isinstance(key, str):
                _type_error("Dict keys must be Str")
            res = dict(target)
            res[key] = value
            return res
        if isinstance(target, list):
            whole_key = _as_whole_int(key, "List indices must be whole Num values")
            if whole_key < 0 or whole_key >= len(target):
                raise PopCornError("IndexError", f"Index {whole_key} out of bounds")
            res = list(target)
            res[whole_key] = value
            return res
        _type_error("Set target must be List or Dict")
    _type_error("Set requires (target, key, value)")


BUILTIN_REGISTRY["Set"] = builtin_Set


def builtin_Remove(current, env, evaluator):
    if isinstance(current, tuple) and len(current) == 2:
        target, key = current
        if isinstance(target, dict) and isinstance(key, str):
            res = dict(target)
            res.pop(key, None)
            return res
    _type_error("Remove requires (Dict, Str)")


BUILTIN_REGISTRY["Remove"] = builtin_Remove


def builtin_Keys(current, env, evaluator):
    if isinstance(current, dict):
        return list(current.keys())
    _type_error("Keys requires Dict")


BUILTIN_REGISTRY["Keys"] = builtin_Keys


def builtin_Values(current, env, evaluator):
    if isinstance(current, dict):
        return list(current.values())
    _type_error("Values requires Dict")


BUILTIN_REGISTRY["Values"] = builtin_Values


def builtin_Entries(current, env, evaluator):
    if isinstance(current, dict):
        return [[k, v] for k, v in current.items()]
    _type_error("Entries requires Dict")


BUILTIN_REGISTRY["Entries"] = builtin_Entries


def builtin_Merge(current, env, evaluator):
    if isinstance(current, tuple) and len(current) == 2:
        d1, d2 = current
        if isinstance(d1, dict) and isinstance(d2, dict):
            res = dict(d1)
            res.update(d2)
            return res
    _type_error("Merge requires (Dict, Dict)")


BUILTIN_REGISTRY["Merge"] = builtin_Merge


def builtin_Contains(current, env, evaluator):
    if isinstance(current, tuple) and len(current) == 2:
        target, item = current
        return _contains_value(target, item)
    _type_error("Contains requires (target, item)")


BUILTIN_REGISTRY["Contains"] = builtin_Contains


def builtin_Append(current, env, evaluator):
    if isinstance(current, tuple) and len(current) == 2:
        target_list, item = current
        if isinstance(target_list, list):
            new_list = list(target_list)
            new_list.append(item)
            return new_list
    _type_error("Append requires (List, item)")


BUILTIN_REGISTRY["Append"] = builtin_Append


def builtin_Slice(current, env, evaluator):
    if isinstance(current, tuple) and len(current) in (2, 3):
        target = current[0]
        if not isinstance(target, (list, str)):
            _type_error("Slice target must be List or Str")
        if len(current) == 2:
            start = 0
            end = _as_whole_int(current[1], "Slice indices must be whole Num values")
        else:
            start = _as_whole_int(current[1], "Slice indices must be whole Num values")
            end = _as_whole_int(current[2], "Slice indices must be whole Num values")
        # 負の添字は、うしろから数える（-1 は最後の要素の位置）。xs >> Slice(-1) は、最後の 1 つを除いたもの
        size = len(target)
        norm_start = start + size if start < 0 else start
        norm_end = end + size if end < 0 else end
        if norm_start < 0 or norm_end < 0 or norm_start > norm_end or norm_end > size:
            raise PopCornError(
                "IndexError",
                f"Invalid Slice range ({start}, {end}) for length {size}",
            )
        return target[norm_start:norm_end]
    _type_error("Slice requires (target, end) or (target, start, end)")


BUILTIN_REGISTRY["Slice"] = builtin_Slice


def builtin_Array(current, env, evaluator):
    if _is_number(current):
        dims = [_as_whole_int(current, "Array dimensions must be whole Num values")]
    elif isinstance(current, list):
        dims = [
            _as_whole_int(d, "Array dimensions must be whole Num values")
            for d in current
        ]
    else:
        _type_error("Array requires a non-negative whole Num or List of whole Nums")
    if not dims or any(dimension < 0 for dimension in dims):
        _type_error("Array dimensions must be non-negative whole Num values")

    def make_array(dimensions):
        if len(dimensions) == 1:
            return [0.0 for _ in range(dimensions[0])]
        return [make_array(dimensions[1:]) for _ in range(dimensions[0])]

    return make_array(dims)


BUILTIN_REGISTRY["Array"] = builtin_Array


def builtin_Zip(current, env, evaluator):
    if (
        isinstance(current, tuple)
        and len(current) >= 1
        and all(isinstance(item, list) for item in current)
    ):
        return [list(row) for row in zip(*current)]
    _type_error("Zip requires a non-empty Tuple of Lists")


BUILTIN_REGISTRY["Zip"] = builtin_Zip


# --- JSON built-ins ---


def builtin_ToJson(current, env, evaluator):
    try:
        return json.dumps(_to_json_ready(current), ensure_ascii=False, allow_nan=False)
    except PopCornError:
        raise
    except Exception as exc:
        raise PopCornError("TypeError", f"ToJson failed: {exc}")


BUILTIN_REGISTRY["ToJson"] = builtin_ToJson


def builtin_FromJson(current, env, evaluator):
    if not isinstance(current, str):
        _type_error("FromJson requires Str")
    try:
        return _from_json_normalize(json.loads(current))
    except PopCornError:
        raise
    except Exception as exc:
        raise PopCornError("RuntimeError", f"FromJson failed: {exc}")


BUILTIN_REGISTRY["FromJson"] = builtin_FromJson


# --- Time built-ins ---


def builtin_Now(current, env, evaluator):
    now = datetime.datetime.now()
    return {
        "year": float(now.year),
        "month": float(now.month),
        "day": float(now.day),
        "hour": float(now.hour),
        "minute": float(now.minute),
        "second": float(now.second),
    }


BUILTIN_REGISTRY["Now"] = builtin_Now


def builtin_Sleep(current, env, evaluator):
    if not _is_number(current):
        _type_error("Sleep requires Num")
    seconds = _to_num(current)
    if seconds < 0:
        raise PopCornError("RuntimeError", "Sleep requires a non-negative number of seconds")
    time.sleep(seconds)
    return seconds


BUILTIN_REGISTRY["Sleep"] = builtin_Sleep


# --- I/O & Network built-ins ---


def builtin_Display(current, env, evaluator):
    print(format_popcorn_str(current))
    return current


BUILTIN_REGISTRY["Display"] = builtin_Display


async def builtin_Input(current, env, evaluator):
    if not isinstance(current, str):
        _type_error("Input requires a Str prompt")
    try:
        if "pyodide" in sys.modules:
            from js import globalThis

            return await globalThis.waitForTerminalInput(current)
        return await asyncio.to_thread(input, current)
    except Exception as exc:
        _wrap_unexpected("Input", exc)


BUILTIN_REGISTRY["Input"] = builtin_Input


def builtin_Debug(current, env, evaluator):
    print(f"[DEBUG] ({popcorn_type_name(current)}) {format_popcorn_str(current)}")
    return current


BUILTIN_REGISTRY["Debug"] = builtin_Debug


def builtin_ReadFile(current, env, evaluator):
    if not isinstance(current, str):
        _type_error("ReadFile requires a Str file path")
    try:
        with open(current, "r", encoding="utf-8") as f:
            return f.read()
    except Exception as exc:
        raise PopCornError("IOError", f"ReadFile failed for '{current}': {exc}")


BUILTIN_REGISTRY["ReadFile"] = builtin_ReadFile


def builtin_WriteFile(current, env, evaluator):
    if isinstance(current, tuple) and len(current) == 2:
        content, path = current
        if not isinstance(path, str):
            _type_error("WriteFile path must be Str")
        try:
            text = content if isinstance(content, str) else format_popcorn_str(content)
            with open(path, "w", encoding="utf-8") as f:
                f.write(text)
            return content
        except Exception as exc:
            raise PopCornError("IOError", f"WriteFile failed for '{path}': {exc}")
    _type_error("WriteFile requires (content, path)")


BUILTIN_REGISTRY["WriteFile"] = builtin_WriteFile


def _validate_headers(headers) -> dict[str, str]:
    if not isinstance(headers, dict) or not all(
        isinstance(k, str) and isinstance(v, str) for k, v in headers.items()
    ):
        _type_error("HTTP headers must be a Dict with Str keys and Str values")
    return dict(headers)


def builtin_Fetch(current, env, evaluator):
    if not isinstance(current, str):
        _type_error("Fetch requires a URL Str")
    if not (current.startswith("http://") or current.startswith("https://")):
        raise PopCornError("NetworkError", f"Fetch requires an http:// or https:// URL: '{current}'")
    try:
        req = urllib.request.Request(current, headers={"User-Agent": "PopCorn/1"})
        with urllib.request.urlopen(req) as response:
            return response.read().decode("utf-8", errors="replace")
    except Exception as exc:
        raise PopCornError("NetworkError", f"Fetch failed for '{current}': {exc}")


BUILTIN_REGISTRY["Fetch"] = builtin_Fetch


def builtin_PostFetch(current, env, evaluator):
    if isinstance(current, tuple) and len(current) in (2, 3):
        body = current[0]
        url = current[1]
        headers = _validate_headers(current[2]) if len(current) == 3 else {}
        if not isinstance(url, str):
            _type_error("PostFetch URL must be Str")
        if not isinstance(body, str):
            _type_error("PostFetch body must be Str")
        if not (url.startswith("http://") or url.startswith("https://")):
            raise PopCornError("NetworkError", f"PostFetch requires an http:// or https:// URL: '{url}'")
        try:
            req = urllib.request.Request(
                url,
                data=body.encode("utf-8"),
                headers=headers,
                method="POST",
            )
            with urllib.request.urlopen(req) as response:
                return response.read().decode("utf-8", errors="replace")
        except Exception as exc:
            raise PopCornError("NetworkError", f"PostFetch failed: {exc}")
    _type_error("PostFetch requires (body, url) or (body, url, headers)")


BUILTIN_REGISTRY["PostFetch"] = builtin_PostFetch


def builtin_HttpRequest(current, env, evaluator):
    if isinstance(current, tuple) and len(current) == 4:
        method, url, headers, body = current
        if not isinstance(method, str):
            _type_error("HttpRequest method must be Str")
        if not isinstance(url, str):
            _type_error("HttpRequest URL must be Str")
        hdrs = _validate_headers(headers)
        if body is not None and not isinstance(body, str):
            _type_error("HttpRequest body must be Str or Null")
        if not (url.startswith("http://") or url.startswith("https://")):
            raise PopCornError("NetworkError", f"HttpRequest requires an http:// or https:// URL: '{url}'")
        data = body.encode("utf-8") if isinstance(body, str) and body != "" else None
        req = urllib.request.Request(url, data=data, headers=hdrs, method=method.upper())
        try:
            with urllib.request.urlopen(req) as response:
                resp_headers = {k: v for k, v in response.headers.items()}
                return {
                    "status": float(response.status),
                    "headers": resp_headers,
                    "body": response.read().decode("utf-8", errors="replace"),
                }
        except urllib.error.HTTPError as err:
            resp_headers = {k: v for k, v in err.headers.items()} if err.headers else {}
            return {
                "status": float(err.code),
                "headers": resp_headers,
                "body": err.read().decode("utf-8", errors="replace"),
            }
        except Exception as exc:
            raise PopCornError("NetworkError", f"HttpRequest failed: {exc}")
    _type_error("HttpRequest requires (method, url, headers, body)")


BUILTIN_REGISTRY["HttpRequest"] = builtin_HttpRequest


# --- Control & Error built-ins ---


def builtin_Return(current, env, evaluator):
    scope = env
    while scope:
        if scope.function_scope:
            raise ReturnException(current)
        scope = scope.parent
    raise PopCornError("RuntimeError", "Return can only be used inside a pop function")


BUILTIN_REGISTRY["Return"] = builtin_Return


def builtin_Break(current, env, evaluator):
    scope = env
    while scope:
        if scope.loop_scope:
            raise BreakException(current)
        scope = scope.parent
    raise PopCornError("RuntimeError", "Break can only be used inside Loop")


BUILTIN_REGISTRY["Break"] = builtin_Break


def builtin_Throw(current, env, evaluator):
    raise PopCornError("UserError", format_popcorn_str(current))


BUILTIN_REGISTRY["Throw"] = builtin_Throw
# ================================================================
# 数学・文字列・コレクション・環境の標準関数（PopCorn 1 の追加分）
# ================================================================

def _num_input(current, name: str) -> float:
    if not _is_number(current):
        _type_error(f"{name} requires Num")
    return _to_num(current)


def _math_result(name: str, compute):
    """計算が定まらない・大きすぎるときは、RuntimeError にする。"""
    try:
        return _to_num(compute())
    except OverflowError:
        raise PopCornError("RuntimeError", "Numeric result is NaN or Infinity")
    except (ValueError, ZeroDivisionError):
        raise PopCornError("RuntimeError", f"{name} is undefined for this value")


def builtin_Floor(current, env, evaluator):
    return _to_num(math.floor(_num_input(current, "Floor")))


def builtin_Ceil(current, env, evaluator):
    return _to_num(math.ceil(_num_input(current, "Ceil")))


def builtin_Sqrt(current, env, evaluator):
    x = _num_input(current, "Sqrt")
    if x < 0:
        raise PopCornError("RuntimeError", "Sqrt requires a non-negative Num")
    return _to_num(math.sqrt(x))


def builtin_Pow(current, env, evaluator):
    if isinstance(current, tuple) and len(current) == 2 and all(_is_number(v) for v in current):
        base, exponent = (_to_num(v) for v in current)
        return _math_result("Pow", lambda: math.pow(base, exponent))
    _type_error("Pow requires (base, exponent) of two Num values")


def builtin_Exp(current, env, evaluator):
    x = _num_input(current, "Exp")
    return _math_result("Exp", lambda: math.exp(x))


def builtin_Log(current, env, evaluator):
    if isinstance(current, tuple) and len(current) == 2 and all(_is_number(v) for v in current):
        x, base = (_to_num(v) for v in current)
        if x <= 0:
            raise PopCornError("RuntimeError", "Log requires a positive Num")
        if base <= 0 or base == 1:
            raise PopCornError("RuntimeError", "Log base must be positive and not 1")
        return _to_num(math.log(x) / math.log(base))
    x = _num_input(current, "Log")
    if x <= 0:
        raise PopCornError("RuntimeError", "Log requires a positive Num")
    return _to_num(math.log(x))


def builtin_Sin(current, env, evaluator):
    return _to_num(math.sin(_num_input(current, "Sin")))


def builtin_Cos(current, env, evaluator):
    return _to_num(math.cos(_num_input(current, "Cos")))


def builtin_Tan(current, env, evaluator):
    return _to_num(math.tan(_num_input(current, "Tan")))


def builtin_Pi(current, env, evaluator):
    return math.pi  # 入力は使わない


def builtin_E(current, env, evaluator):
    return math.e  # 入力は使わない


def builtin_Trim(current, env, evaluator):
    if isinstance(current, str):
        return current.strip()  # 全角の空白も取り除く
    _type_error("Trim requires Str")


def builtin_Unique(current, env, evaluator):
    if isinstance(current, (list, tuple)):
        result = []
        for item in current:
            if not any(_values_equal(item, seen) for seen in result):
                result.append(item)
        return result
    _type_error("Unique requires List")


def builtin_Flatten(current, env, evaluator):
    if isinstance(current, (list, tuple)):
        result = []
        for item in current:
            if isinstance(item, (list, tuple)):
                result.extend(item)
            else:
                result.append(item)
        return result
    _type_error("Flatten requires List")


def builtin_Enumerate(current, env, evaluator):
    if isinstance(current, (list, tuple)):
        return [[_to_num(index), item] for index, item in enumerate(current)]
    _type_error("Enumerate requires List")


def builtin_FromEntries(current, env, evaluator):
    if isinstance(current, (list, tuple)):
        result = {}
        for entry in current:
            if not (isinstance(entry, (list, tuple)) and len(entry) == 2):
                _type_error("FromEntries requires a List of [key, value] pairs")
            key, value = entry
            if not isinstance(key, str):
                _type_error("FromEntries keys must be Str")
            result[key] = value
        return result
    _type_error("FromEntries requires a List of [key, value] pairs")


def builtin_GetPath(current, env, evaluator):
    if isinstance(current, tuple) and len(current) in (2, 3):
        target, path = current[0], current[1]
        default = current[2] if len(current) == 3 else None
        if not isinstance(path, (list, tuple)):
            _type_error("GetPath requires (target, path) where path is a List of keys and indices")
        node = target
        for key in path:
            if isinstance(node, dict) and isinstance(key, str) and key in node:
                node = node[key]
            elif isinstance(node, (list, tuple)) and _is_number(key):
                index = _to_num(key)
                if index.is_integer() and 0 <= index < len(node):
                    node = node[int(index)]
                else:
                    return default
            else:
                return default
        return node
    _type_error("GetPath requires (target, path) or (target, path, default)")


def builtin_Env(current, env, evaluator):
    if not isinstance(current, str):
        _type_error("Env requires Str (the variable name)")
    if sys.platform == "emscripten":  # ブラウザの Playground には、環境変数がない
        return None
    return os.environ.get(current)


def builtin_Args(current, env, evaluator):
    return list(getattr(evaluator, "script_args", []))  # 入力は使わない


for _name, _fn in (
    ("Floor", builtin_Floor), ("Ceil", builtin_Ceil), ("Sqrt", builtin_Sqrt), ("Pow", builtin_Pow),
    ("Exp", builtin_Exp), ("Log", builtin_Log), ("Sin", builtin_Sin), ("Cos", builtin_Cos),
    ("Tan", builtin_Tan), ("Pi", builtin_Pi), ("E", builtin_E), ("Trim", builtin_Trim),
    ("Unique", builtin_Unique), ("Flatten", builtin_Flatten), ("Enumerate", builtin_Enumerate),
    ("FromEntries", builtin_FromEntries), ("GetPath", builtin_GetPath), ("Env", builtin_Env),
    ("Args", builtin_Args),
):
    BUILTIN_REGISTRY[_name] = _fn
