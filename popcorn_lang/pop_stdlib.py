"""標準ライブラリの追加分（数・文字・リスト・辞書・日付・変換）。

関数は `std(...)` で登録します。説明（DOCS）は、仕様書の一覧・エディターのホバー・テストの元になります。
`ex` の例は、tests/test_stdlib.py が本物の処理系で動かして、答えを確かめます。
"""

import base64
import calendar
import csv
import datetime
import hashlib
import html
import io
import itertools
import math
import random
import re
import textwrap
import urllib.parse
import uuid

from .evaluator import (
    PopCornError,
    _as_whole_int,
    _is_number,
    _to_num,
    _values_equal,
    format_popcorn_str,
)
from .pop_builtins import BUILTIN_REGISTRY, _type_error

DOCS = []
_MAX_ITEMS = 100000


def std(category, name, usage, doc, output, ex=()):
    def register(fn):
        BUILTIN_REGISTRY[name] = fn
        DOCS.append({"category": category, "name": name, "usage": usage, "doc": doc, "output": output, "ex": list(ex)})
        return fn

    return register


# ---------- 引数の取り出し ----------


def _args(current, name, usage, minimum, maximum=None):
    items = list(current) if isinstance(current, tuple) else [current]
    maximum = minimum if maximum is None else maximum
    if not minimum <= len(items) <= maximum:
        _type_error(f"{name} requires {usage}")
    return items


def _num(value, name, usage):
    if not _is_number(value):
        _type_error(f"{name} requires {usage}")
    return _to_num(value)


def _whole(value, name, usage):
    return _as_whole_int(value, f"{name} requires {usage}")


def _text(value, name, usage):
    if not isinstance(value, str):
        _type_error(f"{name} requires {usage}")
    return value


def _items(value, name, usage):
    if not isinstance(value, (list, tuple)):
        _type_error(f"{name} requires {usage}")
    return list(value)


def _numbers(value, name, usage):
    return [_num(v, name, usage) for v in _items(value, name, usage)]


def _fail(message):
    raise PopCornError("RuntimeError", message)


def _unique(items):
    result = []
    for item in items:
        if not any(_values_equal(item, seen) for seen in result):
            result.append(item)
    return result


# ================================================================
# 数値
# ================================================================

N = "数値"


@std(N, "Sign", "`Num`", "正なら `1`、負なら `-1`、`0` なら `0` を返します。", "数値", [("-8 >> Sign.", -1), ("0 >> Sign.", 0)])
def builtin_Sign(current, env, evaluator):
    x = _num(current, "Sign", "Num")
    return 1.0 if x > 0 else -1.0 if x < 0 else 0.0


@std(N, "Trunc", "`Num`", "小数点以下を 0 に近い方向へ切り捨てた、整数値の `Num` を返します（`-3.7` は `-3`）。", "数値", [("-3.7 >> Trunc.", -3), ("3.7 >> Trunc.", 3)])
def builtin_Trunc(current, env, evaluator):
    return _to_num(math.trunc(_num(current, "Trunc", "Num")))


@std(N, "Clamp", "`(x, min, max)`", "`x` を `min` 以上 `max` 以下に収めた `Num` を返します。`min > max` は `RuntimeError`。", "数値", [("15 >> Clamp(0, 10).", 10), ("-2 >> Clamp(0, 10).", 0), ("4 >> Clamp(0, 10).", 4)])
def builtin_Clamp(current, env, evaluator):
    x, low, high = (_num(v, "Clamp", "(Num, min, max)") for v in _args(current, "Clamp", "(Num, min, max)", 3))
    if low > high:
        _fail("Clamp requires min <= max")
    return min(max(x, low), high)


@std(N, "Between", "`(x, min, max)`", "`x` が `min` 以上 `max` 以下なら `true` を返します。", "真偽値", [("5 >> Between(1, 10).", True), ("11 >> Between(1, 10).", False)])
def builtin_Between(current, env, evaluator):
    x, low, high = (_num(v, "Between", "(Num, min, max)") for v in _args(current, "Between", "(Num, min, max)", 3))
    return low <= x <= high


@std(N, "Mod", "`(a, b)`", "`a` を `b` で割った余りを、`b` が正なら 0 以上で返します（`-1 >> Mod(5)` は `4`）。`b` が 0 は `RuntimeError`。", "数値", [("-1 >> Mod(5).", 4), ("17 >> Mod(5).", 2)])
def builtin_Mod(current, env, evaluator):
    a, b = (_num(v, "Mod", "(Num, Num)") for v in _args(current, "Mod", "(Num, Num)", 2))
    if b == 0:
        _fail("Mod divisor must not be 0")
    return _to_num(a % b)


def _two_whole(current, name):
    a, b = _args(current, name, "(whole Num, whole Num)", 2)
    return abs(_whole(a, name, "(whole Num, whole Num)")), abs(_whole(b, name, "(whole Num, whole Num)"))


@std(N, "Gcd", "`(a, b)` の 2つの整数値", "最大公約数の `Num` を返します。", "数値", [("(12, 18) >> Gcd.", 6)])
def builtin_Gcd(current, env, evaluator):
    a, b = _two_whole(current, "Gcd")
    return _to_num(math.gcd(a, b))


@std(N, "Lcm", "`(a, b)` の 2つの整数値", "最小公倍数の `Num` を返します。どちらかが `0` なら `0`。", "数値", [("(4, 6) >> Lcm.", 12)])
def builtin_Lcm(current, env, evaluator):
    a, b = _two_whole(current, "Lcm")
    return _to_num(math.lcm(a, b))


@std(N, "Factorial", "0 から 170 までの整数値", "階乗の `Num` を返します（`5 >> Factorial` は `120`）。範囲の外は `RuntimeError`。", "数値", [("5 >> Factorial.", 120), ("0 >> Factorial.", 1)])
def builtin_Factorial(current, env, evaluator):
    n = _whole(current, "Factorial", "a whole Num")
    if not 0 <= n <= 170:
        _fail("Factorial requires a whole Num from 0 to 170")
    return _to_num(math.factorial(n))


@std(N, "Product", "`Num` の `List`", "すべてを掛けた `Num` を返します。空の `List` は `1`。", "数値", [("[2, 3, 4] >> Product.", 24), ("[] >> Product.", 1)])
def builtin_Product(current, env, evaluator):
    result = 1.0
    for x in _numbers(current, "Product", "List of Num"):
        result = _to_num(result * x)
    return result


@std(N, "Median", "空でない `Num` の `List`", "中央値の `Num` を返します。個数が偶数なら、まん中 2つの平均です。", "数値", [("[5, 1, 3] >> Median.", 3), ("[1, 2, 3, 4] >> Median.", 2.5)])
def builtin_Median(current, env, evaluator):
    values = sorted(_numbers(current, "Median", "non-empty List of Num"))
    if not values:
        _fail("Median requires a non-empty List")
    mid = len(values) // 2
    return values[mid] if len(values) % 2 else _to_num((values[mid - 1] + values[mid]) / 2)


@std(N, "Mode", "空でない `List`", "いちばん多く現れる要素を返します。同数なら、先に現れた方です。", "要素", [("[1, 2, 2, 3, 3] >> Mode.", 2), ('["a", "b", "b"] >> Mode.', "b")])
def builtin_Mode(current, env, evaluator):
    items = _items(current, "Mode", "non-empty List")
    if not items:
        _fail("Mode requires a non-empty List")
    best, best_count = items[0], 0
    for item in items:
        count = sum(1 for other in items if _values_equal(item, other))
        if count > best_count:
            best, best_count = item, count
    return best


def _variance(current, name):
    values = _numbers(current, name, "non-empty List of Num")
    if not values:
        _fail(f"{name} requires a non-empty List")
    mean = sum(values) / len(values)
    return sum((v - mean) ** 2 for v in values) / len(values)


@std(N, "Variance", "空でない `Num` の `List`", "分散（母集団。平均からのずれの 2 乗の平均）の `Num` を返します。", "数値", [("[1, 2, 3, 4, 5] >> Variance.", 2)])
def builtin_Variance(current, env, evaluator):
    return _to_num(_variance(current, "Variance"))


@std(N, "StdDev", "空でない `Num` の `List`", "標準偏差（母集団。`Variance` の平方根）の `Num` を返します。", "数値", [("[2, 4, 4, 4, 5, 5, 7, 9] >> StdDev.", 2)])
def builtin_StdDev(current, env, evaluator):
    return _to_num(math.sqrt(_variance(current, "StdDev")))


@std(N, "Cumulative", "`Num` の `List`", "ここまでの合計を並べた `List` を返します（`[1, 2, 3]` は `[1, 3, 6]`）。", "配列", [("[1, 2, 3, 4] >> Cumulative.", [1, 3, 6, 10])])
def builtin_Cumulative(current, env, evaluator):
    total, result = 0.0, []
    for x in _numbers(current, "Cumulative", "List of Num"):
        total = _to_num(total + x)
        result.append(total)
    return result


@std(N, "Atan", "`Num`", "逆正接（ラジアン）の `Num` を返します。", "数値", [("1 >> Atan >> Degrees >> Round.", 45)])
def builtin_Atan(current, env, evaluator):
    return _to_num(math.atan(_num(current, "Atan", "Num")))


@std(N, "Asin", "-1 から 1 の `Num`", "逆正弦（ラジアン）の `Num` を返します。範囲の外は `RuntimeError`。", "数値", [("1 >> Asin >> Degrees.", 90)])
def builtin_Asin(current, env, evaluator):
    x = _num(current, "Asin", "Num from -1 to 1")
    if not -1 <= x <= 1:
        _fail("Asin requires a Num from -1 to 1")
    return _to_num(math.asin(x))


@std(N, "Acos", "-1 から 1 の `Num`", "逆余弦（ラジアン）の `Num` を返します。範囲の外は `RuntimeError`。", "数値", [("0 >> Acos >> Degrees.", 90)])
def builtin_Acos(current, env, evaluator):
    x = _num(current, "Acos", "Num from -1 to 1")
    if not -1 <= x <= 1:
        _fail("Acos requires a Num from -1 to 1")
    return _to_num(math.acos(x))


@std(N, "Atan2", "`(y, x)`", "原点から `(x, y)` への角度（ラジアン）の `Num` を返します。", "数値", [("(1, 1) >> Atan2 >> Degrees >> Round.", 45)])
def builtin_Atan2(current, env, evaluator):
    y, x = (_num(v, "Atan2", "(y, x)") for v in _args(current, "Atan2", "(y, x)", 2))
    return _to_num(math.atan2(y, x))


@std(N, "Degrees", "`Num`（ラジアン）", "ラジアンを度にした `Num` を返します。", "数値", [("Pi >> Degrees.", 180)])
def builtin_Degrees(current, env, evaluator):
    return _to_num(math.degrees(_num(current, "Degrees", "Num")))


@std(N, "Radians", "`Num`（度）", "度をラジアンにした `Num` を返します。", "数値", [("180 >> Radians >> Round(5).", 3.14159)])
def builtin_Radians(current, env, evaluator):
    return _to_num(math.radians(_num(current, "Radians", "Num")))


@std(N, "Hypot", "`(a, b)`", "直角三角形の斜辺（`a` と `b` の 2 乗の和の平方根）の `Num` を返します。", "数値", [("(3, 4) >> Hypot.", 5)])
def builtin_Hypot(current, env, evaluator):
    a, b = (_num(v, "Hypot", "(Num, Num)") for v in _args(current, "Hypot", "(Num, Num)", 2))
    return _to_num(math.hypot(a, b))


@std(N, "Cbrt", "`Num`", "立方根の `Num` を返します。負の数も使えます（`-8` は `-2`）。", "数値", [("27 >> Cbrt >> Round.", 3), ("-8 >> Cbrt >> Round.", -2)])
def builtin_Cbrt(current, env, evaluator):
    x = _num(current, "Cbrt", "Num")
    return _to_num(math.copysign(abs(x) ** (1 / 3), x))


@std(N, "IsPrime", "0 以上の整数値（10^12 まで）", "素数なら `true` を返します。", "真偽値", [("97 >> IsPrime.", True), ("91 >> IsPrime.", False)])
def builtin_IsPrime(current, env, evaluator):
    n = _whole(current, "IsPrime", "a whole Num")
    if n < 0 or n > 10**12:
        _fail("IsPrime requires a whole Num from 0 to 1000000000000")
    if n < 2:
        return False
    for d in range(2, math.isqrt(n) + 1):
        if n % d == 0:
            return False
    return True


@std(N, "ToBase", "`(n, base)`", "整数値 `n` を `base` 進数（2 から 36）の `Str` にします（`255 >> ToBase(16)` は `\"ff\"`）。", "文字列", [("255 >> ToBase(16).", "ff"), ("5 >> ToBase(2).", "101")])
def builtin_ToBase(current, env, evaluator):
    n, base = _args(current, "ToBase", "(whole Num, base from 2 to 36)", 2)
    n = _whole(n, "ToBase", "(whole Num, base from 2 to 36)")
    base = _whole(base, "ToBase", "(whole Num, base from 2 to 36)")
    if not 2 <= base <= 36:
        _fail("ToBase base must be from 2 to 36")
    digits, value = "0123456789abcdefghijklmnopqrstuvwxyz", abs(n)
    out = ""
    while True:
        value, rest = divmod(value, base)
        out = digits[rest] + out
        if value == 0:
            break
    return ("-" if n < 0 else "") + out


@std(N, "FromBase", "`(text, base)`", "`base` 進数（2 から 36）で書かれた `Str` を、`Num` にします。読めないときは `RuntimeError`。", "数値", [('"ff" >> FromBase(16).', 255), ('"101" >> FromBase(2).', 5)])
def builtin_FromBase(current, env, evaluator):
    text, base = _args(current, "FromBase", "(Str, base from 2 to 36)", 2)
    text = _text(text, "FromBase", "(Str, base from 2 to 36)")
    base = _whole(base, "FromBase", "(Str, base from 2 to 36)")
    if not 2 <= base <= 36:
        _fail("FromBase base must be from 2 to 36")
    try:
        return _to_num(int(text.strip(), base))
    except ValueError:
        _fail(f"FromBase cannot read '{text}' in base {base}")


# ================================================================
# 文字列
# ================================================================

S = "文字列"


@std(S, "Capitalize", "`Str`", "最初の 1 文字を大文字、残りを小文字にした `Str` を返します。", "文字列", [('"pOPCORN" >> Capitalize.', "Popcorn")])
def builtin_Capitalize(current, env, evaluator):
    text = _text(current, "Capitalize", "Str")
    return text[:1].upper() + text[1:].lower()


@std(S, "TitleCase", "`Str`", "英単語の先頭を大文字、残りを小文字にした `Str` を返します。", "文字列", [('"hello big world" >> TitleCase.', "Hello Big World")])
def builtin_TitleCase(current, env, evaluator):
    text = _text(current, "TitleCase", "Str")
    return re.sub(r"[A-Za-z][A-Za-z']*", lambda m: m.group(0)[0].upper() + m.group(0)[1:].lower(), text)


@std(S, "SwapCase", "`Str`", "大文字と小文字を入れ替えた `Str` を返します。", "文字列", [('"Pop" >> SwapCase.', "pOP")])
def builtin_SwapCase(current, env, evaluator):
    return _text(current, "SwapCase", "Str").swapcase()


@std(S, "TrimStart", "`Str`", "前の空白（全角の空白も）だけを取り除いた `Str` を返します。", "文字列", [('"  hi  " >> TrimStart.', "hi  ")])
def builtin_TrimStart(current, env, evaluator):
    return _text(current, "TrimStart", "Str").lstrip()


@std(S, "TrimEnd", "`Str`", "うしろの空白（全角の空白も）だけを取り除いた `Str` を返します。", "文字列", [('"  hi  " >> TrimEnd.', "  hi")])
def builtin_TrimEnd(current, env, evaluator):
    return _text(current, "TrimEnd", "Str").rstrip()


@std(S, "TrimPrefix", "`(text, prefix)`", "`text` が `prefix` で始まるなら、それを取り除いた `Str` を返します。", "文字列", [('"v1.2" >> TrimPrefix("v").', "1.2")])
def builtin_TrimPrefix(current, env, evaluator):
    text, prefix = (_text(v, "TrimPrefix", "(Str, Str)") for v in _args(current, "TrimPrefix", "(Str, Str)", 2))
    return text[len(prefix):] if prefix and text.startswith(prefix) else text


@std(S, "TrimSuffix", "`(text, suffix)`", "`text` が `suffix` で終わるなら、それを取り除いた `Str` を返します。", "文字列", [('"main.pop" >> TrimSuffix(".pop").', "main")])
def builtin_TrimSuffix(current, env, evaluator):
    text, suffix = (_text(v, "TrimSuffix", "(Str, Str)") for v in _args(current, "TrimSuffix", "(Str, Str)", 2))
    return text[: -len(suffix)] if suffix and text.endswith(suffix) else text


@std(S, "Lines", "`Str`", "行ごとに分けた `Str` の `List` を返します。", "配列", [('"a\\nb\\nc" >> Lines.', ["a", "b", "c"])])
def builtin_Lines(current, env, evaluator):
    return _text(current, "Lines", "Str").splitlines()


@std(S, "Words", "`Str`", "空白（全角の空白も）で区切った単語の `List` を返します。続く空白は 1 つとして扱います。", "配列", [('"  pop  corn  " >> Words.', ["pop", "corn"])])
def builtin_Words(current, env, evaluator):
    return _text(current, "Words", "Str").split()


@std(S, "Chars", "`Str`", "1 文字ずつの `Str` の `List` を返します（コードポイント単位）。", "配列", [('"pop" >> Chars.', ["p", "o", "p"])])
def builtin_Chars(current, env, evaluator):
    return list(_text(current, "Chars", "Str"))


@std(S, "Center", "`(text, width)` または `(text, width, fill)`", "`text` の両側を `fill`（1 文字。省くと空白）で埋めて、長さ `width` にした `Str` を返します。", "文字列", [('"pop" >> Center(7, "*").', "**pop**")])
def builtin_Center(current, env, evaluator):
    items = _args(current, "Center", "(Str, width) or (Str, width, fill)", 2, 3)
    text = _text(items[0], "Center", "(Str, width) or (Str, width, fill)")
    width = _whole(items[1], "Center", "(Str, width) or (Str, width, fill)")
    fill = _text(items[2], "Center", "(Str, width) or (Str, width, fill)") if len(items) == 3 else " "
    if len(fill) != 1:
        _type_error("Center fill must be one character")
    pad = max(width - len(text), 0)
    left = pad // 2
    return fill * left + text + fill * (pad - left)


@std(S, "Truncate", "`(text, length)` または `(text, length, suffix)`", "`length` 文字までに切り詰めます。切ったときは、うしろに `suffix`（省くと `…`）を付けて、全体を `length` 文字に収めます。", "文字列", [('"popcorn" >> Truncate(5).', "popc…"), ('"pop" >> Truncate(5).', "pop")])
def builtin_Truncate(current, env, evaluator):
    items = _args(current, "Truncate", "(Str, length) or (Str, length, suffix)", 2, 3)
    text = _text(items[0], "Truncate", "(Str, length) or (Str, length, suffix)")
    length = _whole(items[1], "Truncate", "(Str, length) or (Str, length, suffix)")
    suffix = _text(items[2], "Truncate", "(Str, length) or (Str, length, suffix)") if len(items) == 3 else "…"
    if length < 0:
        _fail("Truncate length must not be negative")
    if len(text) <= length:
        return text
    if length <= len(suffix):
        return suffix[:length]
    return text[: length - len(suffix)] + suffix


@std(S, "Wrap", "`(text, width)`", "英語の文を、1 行が `width` 文字までになるように折り返して、行の `List` を返します。", "配列", [('"the quick brown fox" >> Wrap(10).', ["the quick", "brown fox"])])
def builtin_Wrap(current, env, evaluator):
    text, width = _args(current, "Wrap", "(Str, width)", 2)
    text = _text(text, "Wrap", "(Str, width)")
    width = _whole(width, "Wrap", "(Str, width)")
    if width < 1:
        _fail("Wrap width must be at least 1")
    return textwrap.wrap(text, width)


@std(S, "IsBlank", "`Str`", "空、または空白（全角の空白も）だけなら `true` を返します。", "真偽値", [('"  " >> IsBlank.', True), ('"a" >> IsBlank.', False)])
def builtin_IsBlank(current, env, evaluator):
    return not _text(current, "IsBlank", "Str").strip()


@std(S, "Occurrences", "`(text, part)`", "`part` が `text` に、重ならずに何回現れるかを `Num` で返します。`part` は空でない `Str`。", "数値", [('"banana" >> Occurrences("an").', 2)])
def builtin_Occurrences(current, env, evaluator):
    text, part = (_text(v, "Occurrences", "(Str, Str)") for v in _args(current, "Occurrences", "(Str, Str)", 2))
    if not part:
        _fail("Occurrences part must not be empty")
    return _to_num(text.count(part))


@std(S, "CodePoint", "1 文字の `Str`", "その文字のコードポイントの `Num` を返します（`\"A\"` は `65`）。", "数値", [('"A" >> CodePoint.', 65), ('"あ" >> CodePoint.', 12354)])
def builtin_CodePoint(current, env, evaluator):
    text = _text(current, "CodePoint", "a one-character Str")
    if len(text) != 1:
        _type_error("CodePoint requires a one-character Str")
    return _to_num(ord(text))


@std(S, "FromCodePoint", "整数値", "コードポイントの文字 1 つの `Str` を返します（`65` は `\"A\"`）。", "文字列", [("65 >> FromCodePoint.", "A")])
def builtin_FromCodePoint(current, env, evaluator):
    n = _whole(current, "FromCodePoint", "a whole Num")
    if not 0 <= n <= 0x10FFFF or 0xD800 <= n <= 0xDFFF:
        _fail("FromCodePoint requires a valid code point")
    return chr(n)


def _words_of(text):
    spaced = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", text)
    return [w for w in re.split(r"[\s_\-]+", spaced) if w]


@std(S, "SnakeCase", "`Str`", "`snake_case`（小文字を `_` でつなぐ書き方）にした `Str` を返します。", "文字列", [('"helloBigWorld" >> SnakeCase.', "hello_big_world"), ('"Hello big-world" >> SnakeCase.', "hello_big_world")])
def builtin_SnakeCase(current, env, evaluator):
    return "_".join(w.lower() for w in _words_of(_text(current, "SnakeCase", "Str")))


@std(S, "KebabCase", "`Str`", "`kebab-case`（小文字を `-` でつなぐ書き方）にした `Str` を返します。", "文字列", [('"helloBigWorld" >> KebabCase.', "hello-big-world")])
def builtin_KebabCase(current, env, evaluator):
    return "-".join(w.lower() for w in _words_of(_text(current, "KebabCase", "Str")))


@std(S, "CamelCase", "`Str`", "`camelCase`（2 語目から先頭を大文字にしてつなぐ書き方）にした `Str` を返します。", "文字列", [('"hello big_world" >> CamelCase.', "helloBigWorld")])
def builtin_CamelCase(current, env, evaluator):
    words = [w.lower() for w in _words_of(_text(current, "CamelCase", "Str"))]
    return "".join(w if i == 0 else w[:1].upper() + w[1:] for i, w in enumerate(words))


@std(S, "Distance", "`(a, b)` の 2つの `Str`", "2つの文字列が何文字ちがうかを表す、編集距離（レーベンシュタイン距離）の `Num` を返します。", "数値", [('("kitten", "sitting") >> Distance.', 3)])
def builtin_Distance(current, env, evaluator):
    a, b = (_text(v, "Distance", "(Str, Str)") for v in _args(current, "Distance", "(Str, Str)", 2))
    if len(a) * len(b) > 4_000_000:
        _fail("Distance inputs are too long")
    previous = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        row = [i]
        for j, cb in enumerate(b, 1):
            row.append(min(previous[j] + 1, row[j - 1] + 1, previous[j - 1] + (ca != cb)))
        previous = row
    return _to_num(previous[-1])


# ================================================================
# コレクション（リスト）
# ================================================================

C = "コレクション"


def _count(value, name, usage):
    n = _whole(value, name, usage)
    if n < 0:
        _fail(f"{name} count must not be negative")
    return n


@std(C, "Take", "`(target, n)`", "`List` または `Str` の、前から `n` 個を返します。足りなければ全部です。", "same", [("[1, 2, 3, 4] >> Take(2).", [1, 2]), ('"popcorn" >> Take(3).', "pop")])
def builtin_Take(current, env, evaluator):
    target, n = _args(current, "Take", "(List or Str, n)", 2)
    if not isinstance(target, (list, tuple, str)):
        _type_error("Take requires (List or Str, n)")
    count = _count(n, "Take", "(List or Str, n)")
    return target[:count] if isinstance(target, str) else list(target[:count])


@std(C, "Drop", "`(target, n)`", "`List` または `Str` の、前から `n` 個を除いた残りを返します。", "same", [("[1, 2, 3, 4] >> Drop(2).", [3, 4]), ('"popcorn" >> Drop(3).', "corn")])
def builtin_Drop(current, env, evaluator):
    target, n = _args(current, "Drop", "(List or Str, n)", 2)
    if not isinstance(target, (list, tuple, str)):
        _type_error("Drop requires (List or Str, n)")
    count = _count(n, "Drop", "(List or Str, n)")
    return target[count:] if isinstance(target, str) else list(target[count:])


@std(C, "TakeLast", "`(target, n)`", "`List` または `Str` の、うしろから `n` 個を返します。", "same", [("[1, 2, 3, 4] >> TakeLast(2).", [3, 4])])
def builtin_TakeLast(current, env, evaluator):
    target, n = _args(current, "TakeLast", "(List or Str, n)", 2)
    if not isinstance(target, (list, tuple, str)):
        _type_error("TakeLast requires (List or Str, n)")
    count = _count(n, "TakeLast", "(List or Str, n)")
    part = target[len(target) - count:] if count else target[:0]
    return part if isinstance(target, str) else list(part)


@std(C, "Chunk", "`(items, size)`", "`size` 個ずつに区切った `List` の `List` を返します。最後は短くなることがあります。", "配列", [("[1, 2, 3, 4, 5] >> Chunk(2).", [[1, 2], [3, 4], [5]])])
def builtin_Chunk(current, env, evaluator):
    items, size = _args(current, "Chunk", "(List, size)", 2)
    items = _items(items, "Chunk", "(List, size)")
    size = _whole(size, "Chunk", "(List, size)")
    if size < 1:
        _fail("Chunk size must be at least 1")
    return [items[i:i + size] for i in range(0, len(items), size)]


@std(C, "Sliding", "`(items, size)`", "`size` 個ぶんの窓を 1 つずつずらして並べた、`List` の `List` を返します。", "配列", [("[1, 2, 3, 4] >> Sliding(2).", [[1, 2], [2, 3], [3, 4]])])
def builtin_Sliding(current, env, evaluator):
    items, size = _args(current, "Sliding", "(List, size)", 2)
    items = _items(items, "Sliding", "(List, size)")
    size = _whole(size, "Sliding", "(List, size)")
    if size < 1:
        _fail("Sliding size must be at least 1")
    return [items[i:i + size] for i in range(0, len(items) - size + 1)]


@std(C, "Rotate", "`(items, n)`", "前から `n` 個を、うしろへ回した `List` を返します。負の数は逆向きです。", "配列", [("[1, 2, 3, 4] >> Rotate(1).", [2, 3, 4, 1]), ("[1, 2, 3, 4] >> Rotate(-1).", [4, 1, 2, 3])])
def builtin_Rotate(current, env, evaluator):
    items, n = _args(current, "Rotate", "(List, n)", 2)
    items = _items(items, "Rotate", "(List, n)")
    n = _whole(n, "Rotate", "(List, n)")
    if not items:
        return []
    k = n % len(items)
    return items[k:] + items[:k]


@std(C, "Compact", "`List`", "`null` を取り除いた新しい `List` を返します。", "配列", [("[1, null, 2, null] >> Compact.", [1, 2])])
def builtin_Compact(current, env, evaluator):
    return [x for x in _items(current, "Compact", "List") if x is not None]


@std(C, "Union", "`(a, b)` の 2つの `List`", "どちらかにある要素を、重ならないように並べた `List` を返します。", "配列", [("([1, 2], [2, 3]) >> Union.", [1, 2, 3])])
def builtin_Union(current, env, evaluator):
    a, b = (_items(v, "Union", "(List, List)") for v in _args(current, "Union", "(List, List)", 2))
    return _unique(a + b)


@std(C, "Intersect", "`(a, b)` の 2つの `List`", "両方にある要素を、重ならないように並べた `List` を返します。", "配列", [("([1, 2, 3], [2, 3, 4]) >> Intersect.", [2, 3])])
def builtin_Intersect(current, env, evaluator):
    a, b = (_items(v, "Intersect", "(List, List)") for v in _args(current, "Intersect", "(List, List)", 2))
    return [x for x in _unique(a) if any(_values_equal(x, y) for y in b)]


@std(C, "Difference", "`(a, b)` の 2つの `List`", "`a` にあって `b` にない要素の `List` を返します。", "配列", [("([1, 2, 3, 4], [2, 4]) >> Difference.", [1, 3])])
def builtin_Difference(current, env, evaluator):
    a, b = (_items(v, "Difference", "(List, List)") for v in _args(current, "Difference", "(List, List)", 2))
    return [x for x in a if not any(_values_equal(x, y) for y in b)]


@std(C, "Transpose", "同じ長さの `List` の `List`", "行と列を入れ替えた `List` の `List` を返します。", "配列", [("[[1, 2, 3], [4, 5, 6]] >> Transpose.", [[1, 4], [2, 5], [3, 6]])])
def builtin_Transpose(current, env, evaluator):
    rows = [_items(r, "Transpose", "List of Lists") for r in _items(current, "Transpose", "List of Lists")]
    if rows and any(len(r) != len(rows[0]) for r in rows):
        _fail("Transpose requires Lists of the same length")
    return [list(col) for col in zip(*rows)] if rows else []


@std(C, "Cartesian", "`(a, b)` の 2つの `List`", "`a` と `b` のすべての組み合わせ `[x, y]` を並べた `List` を返します。", "配列", [("([1, 2], [\"a\", \"b\"]) >> Cartesian.", [[1, "a"], [1, "b"], [2, "a"], [2, "b"]])])
def builtin_Cartesian(current, env, evaluator):
    a, b = (_items(v, "Cartesian", "(List, List)") for v in _args(current, "Cartesian", "(List, List)", 2))
    if len(a) * len(b) > _MAX_ITEMS:
        _fail("Cartesian would create too many items")
    return [[x, y] for x in a for y in b]


@std(C, "Combinations", "`(items, k)`", "`items` から `k` 個を選ぶ組み合わせ（順番は区別しない）を、すべて並べた `List` を返します。10 万通りまで。", "配列", [("[1, 2, 3] >> Combinations(2).", [[1, 2], [1, 3], [2, 3]])])
def builtin_Combinations(current, env, evaluator):
    items, k = _args(current, "Combinations", "(List, k)", 2)
    items = _items(items, "Combinations", "(List, k)")
    k = _count(k, "Combinations", "(List, k)")
    if k > len(items):
        return []
    if math.comb(len(items), k) > _MAX_ITEMS:
        _fail("Combinations would create too many items")
    return [list(c) for c in itertools.combinations(items, k)]


@std(C, "Shuffle", "`List`", "ランダムに並べかえた新しい `List` を返します。外部効果あり（結果が毎回ちがう）。", "配列", [("[1, 2, 3, 4] >> Shuffle >> Sort.", [1, 2, 3, 4])])
def builtin_Shuffle(current, env, evaluator):
    items = _items(current, "Shuffle", "List")
    random.shuffle(items)
    return items


@std(C, "Sample", "`(items, n)`", "`items` から、重ならないように `n` 個をランダムに選んだ `List` を返します。外部効果あり。", "配列", [("[1, 2, 3, 4] >> Sample(2) >> Length.", 2)])
def builtin_Sample(current, env, evaluator):
    items, n = _args(current, "Sample", "(List, n)", 2)
    items = _items(items, "Sample", "(List, n)")
    n = _count(n, "Sample", "(List, n)")
    if n > len(items):
        _fail("Sample n must not be larger than the List")
    return random.sample(items, n)


@std(C, "Tally", "`List`", "同じ値が何個あるかを数えた `Dict`（キーは `Str` 変換した値）を返します。", "辞書", [('["a", "b", "a"] >> Tally.', {"a": 2, "b": 1})])
def builtin_Tally(current, env, evaluator):
    counts = {}
    for item in _items(current, "Tally", "List of Str, Num, Bool or null"):
        if isinstance(item, (list, tuple, dict)):
            _type_error("Tally requires List of Str, Num, Bool or null")
        key = format_popcorn_str(item)
        counts[key] = counts.get(key, 0.0) + 1.0
    return counts


@std(C, "CountOf", "`(items, item)`", "`items` の中に `item`（`==` で等しい値）が何個あるかを `Num` で返します。", "数値", [("[1, 2, 1, 1] >> CountOf(1).", 3)])
def builtin_CountOf(current, env, evaluator):
    items, item = _args(current, "CountOf", "(List, item)", 2)
    return _to_num(sum(1 for x in _items(items, "CountOf", "(List, item)") if _values_equal(x, item)))


@std(C, "IsEmpty", "`List`、`Dict`、`Str`、または `null`", "空（または `null`）なら `true` を返します。", "真偽値", [("[] >> IsEmpty.", True), ('"a" >> IsEmpty.', False), ("null >> IsEmpty.", True)])
def builtin_IsEmpty(current, env, evaluator):
    if current is None:
        return True
    if isinstance(current, (list, tuple, dict, str)):
        return len(current) == 0
    _type_error("IsEmpty requires List, Dict, Str, or null")


# ================================================================
# コレクション（辞書）
# ================================================================


@std(C, "Pick", "`(dict, keys)`", "`keys`（`Str` の `List`）にあるキーだけを残した新しい `Dict` を返します。", "辞書", [('{"a": 1, "b": 2, "c": 3} >> Pick(["a", "c"]).', {"a": 1, "c": 3})])
def builtin_Pick(current, env, evaluator):
    target, keys = _args(current, "Pick", "(Dict, List of Str)", 2)
    if not isinstance(target, dict):
        _type_error("Pick requires (Dict, List of Str)")
    keys = [_text(k, "Pick", "(Dict, List of Str)") for k in _items(keys, "Pick", "(Dict, List of Str)")]
    return {k: target[k] for k in target if k in keys}


@std(C, "Omit", "`(dict, keys)`", "`keys`（`Str` の `List`）にあるキーを除いた新しい `Dict` を返します。", "辞書", [('{"a": 1, "b": 2, "c": 3} >> Omit(["b"]).', {"a": 1, "c": 3})])
def builtin_Omit(current, env, evaluator):
    target, keys = _args(current, "Omit", "(Dict, List of Str)", 2)
    if not isinstance(target, dict):
        _type_error("Omit requires (Dict, List of Str)")
    keys = [_text(k, "Omit", "(Dict, List of Str)") for k in _items(keys, "Omit", "(Dict, List of Str)")]
    return {k: v for k, v in target.items() if k not in keys}


@std(C, "Invert", "`Dict`（値が `Str`・`Num`・`Bool`）", "キーと値を入れ替えた `Dict` を返します。同じ値が複数あるときは、後のキーが勝ちます。", "辞書", [('{"a": "x", "b": "y"} >> Invert.', {"x": "a", "y": "b"})])
def builtin_Invert(current, env, evaluator):
    if not isinstance(current, dict):
        _type_error("Invert requires Dict")
    result = {}
    for key, value in current.items():
        if value is None or isinstance(value, (list, tuple, dict)):
            _type_error("Invert requires a Dict whose values are Str, Num or Bool")
        result[format_popcorn_str(value)] = key
    return result


def _deep_merge(left, right):
    result = dict(left)
    for key, value in right.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = _deep_merge(result[key], value)
        else:
            result[key] = value
    return result


@std(C, "DeepMerge", "`(left, right)` の 2つの `Dict`", "中の `Dict` まで、再帰的に合わせた新しい `Dict` を返します。同じキーは右側が優先されます。", "辞書", [('({"a": {"x": 1, "y": 2}}, {"a": {"y": 3}}) >> DeepMerge.', {"a": {"x": 1, "y": 3}})])
def builtin_DeepMerge(current, env, evaluator):
    a, b = _args(current, "DeepMerge", "(Dict, Dict)", 2)
    if not (isinstance(a, dict) and isinstance(b, dict)):
        _type_error("DeepMerge requires (Dict, Dict)")
    return _deep_merge(a, b)


def _set_path(target, path, value):
    key = path[0]
    last = len(path) == 1
    if isinstance(target, dict):
        if not isinstance(key, str):
            _type_error("SetPath keys for a Dict must be Str")
        if not last and key not in target:
            raise PopCornError("KeyError", f"Key '{key}' is not found in dict")
        copy = dict(target)
        copy[key] = value if last else _set_path(target[key], path[1:], value)
        return copy
    if isinstance(target, (list, tuple)):
        index = _whole(key, "SetPath", "(target, path, value)")
        pos = index + len(target) if index < 0 else index
        if not 0 <= pos < len(target):
            raise PopCornError("IndexError", f"Index {index} out of bounds")
        copy = list(target)
        copy[pos] = value if last else _set_path(target[pos], path[1:], value)
        return copy
    _type_error("SetPath can only go inside Dict or List")


@std(C, "SetPath", "`(target, path, value)`", "`GetPath` と同じ `path`（`Str` のキーと整数値の添字の `List`）の先を `value` に替えた、新しい値を返します。最後のキーだけは、新しくてもかまいません。", "same", [('{"a": {"b": 1}} >> SetPath(["a", "c"], 2).', {"a": {"b": 1, "c": 2}}), ("[[1, 2], [3]] >> SetPath([0, 1], 9).", [[1, 9], [3]])])
def builtin_SetPath(current, env, evaluator):
    target, path, value = _args(current, "SetPath", "(target, path, value)", 3)
    path = _items(path, "SetPath", "(target, path, value)")
    if not path:
        _fail("SetPath requires a non-empty path")
    return _set_path(target, path, value)


# ================================================================
# 値
# ================================================================

V = "値"


@std(V, "Default", "`(value, fallback)`", "`value` が `null` のときだけ `fallback` を返します。それ以外は `value` のままです（`0` や `\"\"` もそのまま）。", "要素", [("null >> Default(5).", 5), ("0 >> Default(5).", 0)])
def builtin_Default(current, env, evaluator):
    value, fallback = _args(current, "Default", "(value, fallback)", 2)
    return fallback if value is None else value


@std(V, "Coalesce", "値リスト `(a, b, ...)` または `List`", "最初の `null` でない値を返します。すべて `null` なら `null`。", "要素", [("(null, null, 3, 4) >> Coalesce.", 3), ("[null, 7] >> Coalesce.", 7)])
def builtin_Coalesce(current, env, evaluator):
    items = list(current) if isinstance(current, (list, tuple)) else [current]
    return next((x for x in items if x is not None), None)


@std(V, "IsNull", "任意の値", "`null` なら `true` を返します。", "真偽値", [("null >> IsNull.", True), ("0 >> IsNull.", False)])
def builtin_IsNull(current, env, evaluator):
    return current is None


@std(V, "Compare", "`(a, b)` の、どちらも `Num` か、どちらも `Str`", "`a < b` なら `-1`、等しければ `0`、`a > b` なら `1` を返します。", "数値", [("(1, 2) >> Compare.", -1), ('("b", "a") >> Compare.', 1), ("(3, 3) >> Compare.", 0)])
def builtin_Compare(current, env, evaluator):
    a, b = _args(current, "Compare", "(Num, Num) or (Str, Str)", 2)
    if _is_number(a) and _is_number(b):
        a, b = _to_num(a), _to_num(b)
    elif not (isinstance(a, str) and isinstance(b, str)):
        _type_error("Compare requires (Num, Num) or (Str, Str)")
    return -1.0 if a < b else 1.0 if a > b else 0.0


# ================================================================
# 時間（すべて UTC。`Now` の `timestamp` と同じ「1970-01-01 00:00 UTC からの秒数」で扱う）
# ================================================================

T = "時間"
_UTC = datetime.timezone.utc


def _to_datetime(value, name):
    ts = _num(value, name, "a timestamp (Num)")
    try:
        return datetime.datetime.fromtimestamp(ts, _UTC)
    except (OverflowError, ValueError, OSError):
        _fail(f"{name} timestamp is out of range")


def _make_timestamp(y, mo, d, h, mi, s, name):
    try:
        return _to_num(datetime.datetime(y, mo, d, h, mi, s, tzinfo=_UTC).timestamp())
    except (ValueError, OverflowError):
        _fail(f"{name} received a date that does not exist")


@std(T, "Date", "`(year, month, day)` または `(year, month, day, hour, minute, second)`", "UTC のその日時の `timestamp`（秒数の `Num`）を返します。存在しない日付は `RuntimeError`。", "数値", [("(2026, 11, 27) >> Date >> FormatDate(\"YYYY-MM-DD\").", "2026-11-27"), ("(1970, 1, 2) >> Date.", 86400)])
def builtin_Date(current, env, evaluator):
    items = _args(current, "Date", "(year, month, day) or (year, month, day, hour, minute, second)", 3, 6)
    if len(items) in (4, 5):
        _type_error("Date requires (year, month, day) or (year, month, day, hour, minute, second)")
    parts = [_whole(v, "Date", "whole Nums") for v in items] + [0] * (6 - len(items))
    return _make_timestamp(*parts, "Date")


@std(T, "DateParts", "`timestamp`", "`Now` と同じ形の `Dict`（`year`・`month`・`day`・`hour`・`minute`・`second`・`weekday`・`timestamp`）を UTC で返します。", "辞書", [("0 >> DateParts >> Get(\"year\").", 1970), ("86400 >> DateParts >> Get(\"weekday\").", 5)])
def builtin_DateParts(current, env, evaluator):
    dt = _to_datetime(current, "DateParts")
    return {
        "year": float(dt.year), "month": float(dt.month), "day": float(dt.day),
        "hour": float(dt.hour), "minute": float(dt.minute), "second": float(dt.second),
        "weekday": float((dt.weekday() + 1) % 7), "timestamp": _to_num(current),
    }


_DATE_TOKEN = re.compile(r"YYYY|YY|MM|DD|HH|mm|ss")


@std(T, "FormatDate", "`(timestamp, pattern)`", "`timestamp` を UTC で `pattern` に当てはめた `Str` を返します。使える印は `YYYY` `YY` `MM` `DD` `HH` `mm` `ss`。", "文字列", [("0 >> FormatDate(\"YYYY/MM/DD HH:mm:ss\").", "1970/01/01 00:00:00")])
def builtin_FormatDate(current, env, evaluator):
    ts, pattern = _args(current, "FormatDate", "(timestamp, pattern)", 2)
    dt = _to_datetime(ts, "FormatDate")
    pattern = _text(pattern, "FormatDate", "(timestamp, pattern)")
    values = {
        "YYYY": f"{dt.year:04d}", "YY": f"{dt.year % 100:02d}", "MM": f"{dt.month:02d}", "DD": f"{dt.day:02d}",
        "HH": f"{dt.hour:02d}", "mm": f"{dt.minute:02d}", "ss": f"{dt.second:02d}",
    }
    return _DATE_TOKEN.sub(lambda m: values[m.group(0)], pattern)


_DATE_TEXT = re.compile(r"^\s*(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?\s*Z?\s*$")


@std(T, "ParseDate", "`Str`（`2026-11-27` または `2026-11-27 12:30:00`）", "UTC の `timestamp` にして返します。読めない書き方や存在しない日付は `RuntimeError`。", "数値", [('"1970-01-02" >> ParseDate.', 86400), ('"1970-01-01T01:00:00Z" >> ParseDate.', 3600)])
def builtin_ParseDate(current, env, evaluator):
    text = _text(current, "ParseDate", "Str like 2026-11-27 or 2026-11-27 12:30:00")
    match = _DATE_TEXT.match(text)
    if not match:
        _fail(f"ParseDate cannot read '{text}'")
    y, mo, d, h, mi, s = (int(g) if g else 0 for g in match.groups())
    return _make_timestamp(y, mo, d, h, mi, s, "ParseDate")


@std(T, "AddDays", "`(timestamp, days)`", "`days` 日あとの `timestamp` を返します。負の数は前の日です。", "数値", [("(0, 2) >> AddDays.", 172800)])
def builtin_AddDays(current, env, evaluator):
    ts, days = (_num(v, "AddDays", "(timestamp, days)") for v in _args(current, "AddDays", "(timestamp, days)", 2))
    return _to_num(ts + days * 86400)


def _days_in_month(year, month):
    return calendar.monthrange(year, month)[1]


@std(T, "AddMonths", "`(timestamp, months)`", "`months` か月あとの `timestamp` を返します。日が存在しなければ、その月の最後の日にします（1/31 の 1 か月後は 2/28 か 2/29）。", "数値", [('("2026-01-31" >> ParseDate, 1) >> AddMonths >> FormatDate("YYYY-MM-DD").', "2026-02-28")])
def builtin_AddMonths(current, env, evaluator):
    ts, months = _args(current, "AddMonths", "(timestamp, months)", 2)
    dt = _to_datetime(ts, "AddMonths")
    months = _whole(months, "AddMonths", "(timestamp, months)")
    index = dt.year * 12 + (dt.month - 1) + months
    year, month = divmod(index, 12)
    month += 1
    if not 1 <= year <= 9999:
        _fail("AddMonths result is out of range")
    day = min(dt.day, _days_in_month(year, month))
    return _make_timestamp(year, month, day, dt.hour, dt.minute, dt.second, "AddMonths")


@std(T, "DiffDays", "`(from, to)` の 2つの `timestamp`", "`from` から `to` までの日数の `Num` を返します（`to` が後なら正）。端数は小数です。", "数値", [("(0, 172800) >> DiffDays.", 2)])
def builtin_DiffDays(current, env, evaluator):
    a, b = (_num(v, "DiffDays", "(timestamp, timestamp)") for v in _args(current, "DiffDays", "(timestamp, timestamp)", 2))
    return _to_num((b - a) / 86400)


@std(T, "Weekday", "`timestamp`", "UTC での曜日を `Num` で返します（`0` が日曜、`6` が土曜）。", "数値", [('"2026-11-27" >> ParseDate >> Weekday.', 5)])
def builtin_Weekday(current, env, evaluator):
    return float((_to_datetime(current, "Weekday").weekday() + 1) % 7)


@std(T, "DaysInMonth", "`(year, month)`", "その月の日数の `Num` を返します。", "数値", [("(2024, 2) >> DaysInMonth.", 29), ("(2026, 2) >> DaysInMonth.", 28)])
def builtin_DaysInMonth(current, env, evaluator):
    y, m = (_whole(v, "DaysInMonth", "(year, month)") for v in _args(current, "DaysInMonth", "(year, month)", 2))
    if not (1 <= y <= 9999 and 1 <= m <= 12):
        _fail("DaysInMonth requires a year from 1 to 9999 and a month from 1 to 12")
    return _to_num(_days_in_month(y, m))


@std(T, "IsLeapYear", "年（整数値）", "うるう年なら `true` を返します。", "真偽値", [("2024 >> IsLeapYear.", True), ("1900 >> IsLeapYear.", False)])
def builtin_IsLeapYear(current, env, evaluator):
    return calendar.isleap(_whole(current, "IsLeapYear", "a whole Num"))


# ================================================================
# 変換・データ
# ================================================================

D = "変換"


@std(D, "ToCsv", "`List` の `List`", "行の `List` を CSV の `Str` にします。各値は `Str` 変換され、必要なら `\"` で囲まれます。", "文字列", [('[["a", "b"], [1, "x,y"]] >> ToCsv.', 'a,b\n1,"x,y"')])
def builtin_ToCsv(current, env, evaluator):
    rows = [_items(r, "ToCsv", "List of Lists") for r in _items(current, "ToCsv", "List of Lists")]
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    for row in rows:
        writer.writerow([format_popcorn_str(v) for v in row])
    return buffer.getvalue().rstrip("\n")


@std(D, "ParseCsv", "CSV の `Str`", "行ごとの `Str` の `List` の `List` にします。数も `Str` のままなので、必要なら `Num` で変換します。", "配列", [('"a,b\\n1,2" >> ParseCsv.', [["a", "b"], ["1", "2"]])])
def builtin_ParseCsv(current, env, evaluator):
    text = _text(current, "ParseCsv", "Str")
    try:
        return [row for row in csv.reader(io.StringIO(text)) if row]
    except csv.Error as exc:
        _fail(f"ParseCsv cannot read the CSV: {exc}")


@std(D, "Base64Encode", "`Str`", "UTF-8 で Base64 にした `Str` を返します。", "文字列", [('"popcorn" >> Base64Encode.', "cG9wY29ybg==")])
def builtin_Base64Encode(current, env, evaluator):
    return base64.b64encode(_text(current, "Base64Encode", "Str").encode("utf-8")).decode("ascii")


@std(D, "Base64Decode", "Base64 の `Str`", "Base64 を、UTF-8 の `Str` に戻します。読めないときは `RuntimeError`。", "文字列", [('"cG9wY29ybg==" >> Base64Decode.', "popcorn")])
def builtin_Base64Decode(current, env, evaluator):
    text = _text(current, "Base64Decode", "Str")
    try:
        return base64.b64decode(text.encode("ascii"), validate=True).decode("utf-8")
    except (ValueError, UnicodeError):
        _fail("Base64Decode cannot read the text as Base64 of UTF-8")


@std(D, "UrlEncode", "`Str`", "URL の中に置けるように、`%` 記号で書き換えた `Str` を返します。", "文字列", [('"a b&c" >> UrlEncode.', "a%20b%26c")])
def builtin_UrlEncode(current, env, evaluator):
    return urllib.parse.quote(_text(current, "UrlEncode", "Str"), safe="")


@std(D, "UrlDecode", "`Str`", "`%` 記号の書き方を、もとの文字に戻した `Str` を返します。", "文字列", [('"a%20b%26c" >> UrlDecode.', "a b&c")])
def builtin_UrlDecode(current, env, evaluator):
    return urllib.parse.unquote(_text(current, "UrlDecode", "Str"))


@std(D, "EscapeHtml", "`Str`", "`<` `>` `&` `\"` `'` を、HTML の中で安全な書き方に替えた `Str` を返します。", "文字列", [('"<b>&</b>" >> EscapeHtml.', "&lt;b&gt;&amp;&lt;/b&gt;")])
def builtin_EscapeHtml(current, env, evaluator):
    return html.escape(_text(current, "EscapeHtml", "Str"), quote=True)


@std(D, "Sha256", "`Str`", "UTF-8 にして SHA-256 を取った、16 進の `Str`（64 文字）を返します。", "文字列", [('"abc" >> Sha256.', "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")])
def builtin_Sha256(current, env, evaluator):
    return hashlib.sha256(_text(current, "Sha256", "Str").encode("utf-8")).hexdigest()


@std(D, "Uuid", "入力は使いません", "ランダムな UUID（`xxxxxxxx-xxxx-…` の `Str`）を返します。外部効果あり（毎回ちがう）。", "文字列", [("null >> Uuid >> Length.", 36)])
def builtin_Uuid(current, env, evaluator):
    return str(uuid.uuid4())
