"""標準ライブラリの追加分（popcorn_lang/pop_stdlib.py）のテスト。

DOCS の例は、仕様書の一覧・エディターのホバー・ここのテストが同じ元から作られている。
"""

import json
import re
from pathlib import Path

import pytest

from popcorn_lang import pop_stdlib
from popcorn_lang.evaluator import format_popcorn_str
from popcorn_lang.pop_builtins import BUILTIN_REGISTRY
from tests.test_evaluator import expect_error, run_code

ROOT = Path(__file__).resolve().parent.parent
EXAMPLES = [(doc["name"], src, expected) for doc in pop_stdlib.DOCS for src, expected in doc["ex"]]


@pytest.mark.parametrize("name, source, expected", EXAMPLES, ids=[f"{n}-{i}" for i, (n, _, _) in enumerate(EXAMPLES)])
def test_documented_examples_run(name, source, expected):
    assert format_popcorn_str(run_code(source)) == format_popcorn_str(expected)


def test_every_documented_function_is_registered_once():
    names = [doc["name"] for doc in pop_stdlib.DOCS]
    assert len(names) == len(set(names))
    for name in names:
        assert name in BUILTIN_REGISTRY
    assert len(names) >= 90


def test_every_function_has_an_example_and_a_description():
    for doc in pop_stdlib.DOCS:
        assert doc["ex"], doc["name"]
        assert doc["doc"] and doc["usage"] and doc["output"], doc["name"]


def test_new_functions_do_not_replace_older_ones():
    older = {"Sum", "Map", "Round", "Display", "Trim", "Join", "Split", "Get", "Now", "Reverse", "Sort"}
    assert older.isdisjoint(doc["name"] for doc in pop_stdlib.DOCS)


@pytest.mark.parametrize(
    "source, error_type",
    [
        ('"a" >> Sign.', "TypeError"),
        ("(1, 2, 3) >> Gcd.", "TypeError"),
        ("1.5 >> Factorial.", "TypeError"),
        ("-1 >> Factorial.", "RuntimeError"),
        ("5 >> Clamp(9, 1).", "RuntimeError"),
        ("5 >> Mod(0).", "RuntimeError"),
        ("[] >> Median.", "RuntimeError"),
        ("[] >> Mode.", "RuntimeError"),
        ("2 >> Asin.", "RuntimeError"),
        ('"zz" >> FromBase(2).', "RuntimeError"),
        ("5 >> ToBase(1).", "RuntimeError"),
        ('"popcorn" >> Take(-1).', "RuntimeError"),
        ("[1, 2] >> Chunk(0).", "RuntimeError"),
        ("[[1, 2], [3]] >> Transpose.", "RuntimeError"),
        ('"ab" >> Center(5, "xx").', "TypeError"),
        ('"banana" >> Occurrences("").', "RuntimeError"),
        ('"ab" >> CodePoint.', "TypeError"),
        ('"not a date" >> ParseDate.', "RuntimeError"),
        ("(2026, 2, 30) >> Date.", "RuntimeError"),
        ('"%%%" >> Base64Decode.', "RuntimeError"),
        ("[1, 2, 3] >> Sample(9).", "RuntimeError"),
        ('{"a": 1} >> Pick("a").', "TypeError"),
    ],
)
def test_bad_input_is_a_clear_error(source, error_type):
    exc = expect_error(source, error_type)
    assert str(exc)


def test_values_are_not_changed_in_place():
    source = """
[3, 1, 2] >> items.
items >> Rotate(1) >> Shuffle >> Compact.
items >> Display.
"""
    assert run_code(source) == [3, 1, 2]


def test_functions_work_inside_larger_pipelines():
    source = """
"Hello Big World" >> SnakeCase >> Split("_") >> Map (@ >> Capitalize) >> Join(" ").
"""
    assert run_code(source) == "Hello Big World"
    source = "[1, 2, 3, 4, 5, 6] >> Chunk(2) >> Map (@ >> Sum) >> Cumulative."
    assert run_code(source) == [3, 10, 21]


def test_shuffle_and_sample_keep_the_values():
    assert run_code("[1, 2, 3, 4, 5] >> Shuffle >> Sort.") == [1, 2, 3, 4, 5]
    assert run_code("[1, 2, 3, 4, 5] >> Sample(3) >> Unique >> Length.") == 3


def test_uuid_looks_like_a_uuid():
    value = run_code("null >> Uuid.")
    assert re.fullmatch(r"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}", value)


def test_dates_are_utc_and_round_trip():
    assert run_code('"2026-11-27T12:34:56Z" >> ParseDate >> FormatDate("YYYY-MM-DD HH:mm:ss").') == "2026-11-27 12:34:56"
    assert run_code('(2024, 12, 31) >> Date >> AddDays(1) >> FormatDate("YYYY-MM-DD").') == "2025-01-01"


# --- 仕様書・エディター・日本語化と、同じ元（DOCS）から作られていること ---


def test_specification_lists_every_function():
    spec = (ROOT / "popcorn_specification.md").read_text(encoding="utf-8")
    for doc in pop_stdlib.DOCS:
        assert f"| {doc['category']} | `{doc['name']}` |" in spec, doc["name"]


def test_editor_hover_and_highlighting_know_every_function():
    hover = (ROOT / "vscode-popcorn" / "language-features.js").read_text(encoding="utf-8")
    grammar = json.loads((ROOT / "vscode-popcorn" / "syntaxes" / "popcorn.tmLanguage.json").read_text(encoding="utf-8"))
    pattern = json.dumps(grammar, ensure_ascii=False)
    for doc in pop_stdlib.DOCS:
        assert re.search(rf"^\s+{doc['name']}: \{{ description:", hover, re.M), doc["name"]
        assert re.search(rf"[(|]{doc['name']}[|)]", pattern), doc["name"]
