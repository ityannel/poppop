"""言語の細かな改善（再帰の深さ、エラー文、補助引数、追加の標準関数）のテスト。"""

import sys

import pytest

from popcorn_lang.evaluator import format_popcorn_num
from popcorn_lang.lexer import Lexer
from popcorn_lang.parser import ParseError, Parser
from tests.test_evaluator import expect_error, run_code


def parse_error(code):
    with pytest.raises(ParseError) as info:
        Parser(Lexer(code).tokenize()).parse()
    return str(info.value)


# --- 再帰 ---

COUNTDOWN = """
(n) >> pop Down:
    n >> Check:
        when n == 0: 0
        else: n - 1 >> Down
"""


def test_deep_recursion_works():
    from popcorn_lang.evaluator import MAX_CALL_DEPTH

    depth = 3000 if sys.version_info >= (3, 12) else 250
    assert depth < MAX_CALL_DEPTH
    assert run_code(COUNTDOWN + f"{depth} >> Down.") == 0


def test_endless_recursion_is_a_catchable_runtime_error():
    err = expect_error("(n) >> pop Forever:\n    n >> Forever\n1 >> Forever.", "RuntimeError")
    assert "Recursion is too deep" in err.message
    code = '(n) >> pop Forever:\n    n >> Forever\n1 >> Try:\n    Forever.\nCatch as e:\n    e::type'
    assert run_code(code) == "RuntimeError"


# --- エラー文 ---

def test_error_messages_use_popcorn_notation():
    assert "'0'" in expect_error("5 >> x. x[0].", "TypeError").message
    assert "'true' (Bool)" in expect_error("true >> Num.", "TypeError").message
    assert "'null' (Null)" in expect_error("null >> Num.", "TypeError").message


def test_missing_dot_points_at_the_previous_line():
    message = parse_error("5 >> x\nx >> Display.")
    assert message.startswith("Missing '.' at the end of the statement at line 1")


def test_operator_after_pipeline_suggests_parentheses():
    assert "wrap the pipeline in ( )" in parse_error("[1, 2] >> Max - 1.")


def test_parse_errors_show_symbols_instead_of_token_names():
    message = parse_error("(1 2).")
    assert "Expected ')'" in message and "'2'" in message
    assert "RPAREN" not in message and "NUMBER" not in message


# --- Format と "{0}" ---

def test_format_placeholders_work_in_every_string_kind():
    assert run_code('"{0} and {1}" >> Format(1, 2).') == "1 and 2"
    assert run_code("'{0}-{0}' >> Format(\"a\").") == "a-a"
    assert run_code('5 >> x. "{x} {{0}} {0}".') == "5 {0} {0}"
    assert run_code("'{{0}} {0}' >> Format(7).") == "{0} 7"
    expect_error("'{0} {1}' >> Format(1).", "IndexError")


# --- Num の Str 変換 ---

@pytest.mark.parametrize(
    "value, text",
    [
        (0.000001, "0.000001"),
        (0.0000001, "1e-7"),
        (1.5e-8, "1.5e-8"),
        (-0.00001234, "-0.00001234"),
        (1e21, "1e+21"),
        (1.5e22, "1.5e+22"),
        (123456789012345678.0, "123456789012345680"),
        (0.1 + 0.2, "0.30000000000000004"),
        (3.0, "3"),
    ],
)
def test_number_to_string(value, text):
    assert format_popcorn_num(value) == text


def test_fixed_pads_decimal_places():
    assert run_code("3.1 >> Fixed(2).") == "3.10"
    assert run_code("2.675 >> Fixed(2).") == "2.68"
    assert run_code("-0.001 >> Fixed(2).") == "0.00"
    assert run_code("5 >> Fixed(0).") == "5"
    expect_error("5 >> Fixed(-1).", "TypeError")
    expect_error('"5" >> Fixed(2).', "TypeError")


# --- Sort / Any / All ---

def test_sort_without_key_and_with_list_keys():
    assert run_code("[3, 1, 2] >> Sort.") == [1, 2, 3]
    assert run_code("[3, 1, 2] >> SortDesc.") == [3, 2, 1]
    assert run_code('["b", "a"] >> Sort >> Join(",").') == "a,b"
    code = '[{"n": "b", "s": 80}, {"n": "c", "s": 90}, {"n": "a", "s": 80}] >> Sort ([0 - @::s, @::n]) >> Map (@::n).'
    assert run_code(code) == ["c", "a", "b"]
    assert run_code("[[2, 1], [1, 2], [1, 1]] >> Sort.") == [[1, 1], [1, 2], [2, 1]]
    expect_error('[[1], ["a"]] >> Sort.', "TypeError")
    expect_error("[{}, {}] >> Sort.", "TypeError")


def test_any_and_all():
    assert run_code("[1, 2, 3] >> Any (@ > 2).") is True
    assert run_code("[1, 2, 3] >> All (@ > 1).") is False
    assert run_code("[] >> Any.") is False
    assert run_code("[] >> All.") is True
    assert run_code("[true, true] >> All.") is True
    assert run_code("[1, 2] >> Any as x:\n    x == 2") is True
    expect_error("[1] >> Any.", "TypeError")
    # 答えが決まったら止める（2 番目でエラーになる要素まで進まない）
    assert run_code('[1, "x"] >> Any (@ == 1).') is True


# --- 補助引数の追加 ---

def test_max_min_sum_accept_value_lists():
    assert run_code("(3, 5) >> Max.") == 5
    assert run_code("3 >> Min(5).") == 3
    assert run_code("(1, 2, 3) >> Sum.") == 6
    assert run_code("(1, 2) >> Average.") == 1.5
    expect_error("[1, 2] >> Max(5).", "TypeError")


def test_sleep_can_pass_a_value_through():
    assert run_code('"x" >> Sleep(0).') == "x"
    assert run_code("0 >> Sleep.") == 0
    expect_error('"x" >> Sleep("1").', "TypeError")


def test_string_indexing():
    assert run_code('"abc"[0].') == "a"
    assert run_code('"abc"[-1].') == "c"
    assert run_code('"日本語"[1].') == "本"
    assert run_code('"abc" >> Get(1).') == "b"
    assert run_code('"abc" >> Get(9, "?").') == "?"
    assert run_code('null >> Get("a", 0).') == 0
    expect_error('"abc"[3].', "IndexError")


def test_update_nested_fields():
    code = '{"a": {"b": 1}, "c": 0} >> Update:\n    2 >> @::a::b.\n    3 >> @::x::y.'
    assert run_code(code) == {"a": {"b": 2}, "c": 0, "x": {"y": 3}}
    code = '{"a": {"b": 1}} >> Update as u:\n    u::a::b + 10 >> u::a::b.'
    assert run_code(code) == {"a": {"b": 11}}
    expect_error('{"a": 1} >> Update:\n    2 >> @::a::b.', "TypeError")


def test_pipelines_inside_collection_literals():
    assert run_code("[1, 2 >> Str].") == [1, "2"]
    assert run_code('{"a": 1 >> Str}.') == {"a": "1"}
    code = "(0, []) >> Loop as (i, xs):\n    xs >> Break when i >= 3.\n    (i + 1, xs >> Append(i))"
    assert run_code(code) == [0, 1, 2]


def test_slice_clamps_to_the_length():
    assert run_code('"abc" >> Slice(0, 10).') == "abc"
    assert run_code("[1, 2, 3] >> Slice(1, 9).") == [2, 3]
    expect_error("[1, 2, 3] >> Slice(2, 1).", "IndexError")


# --- 追加の標準関数 ---

def test_string_helpers():
    assert run_code('"Hello" >> StartsWith("He").') is True
    assert run_code('"Hello" >> EndsWith("x").') is False
    assert run_code('"5" >> PadStart(3, "0").') == "005"
    assert run_code('"ab" >> PadEnd(4, ".").') == "ab.."
    assert run_code('"abcdef" >> PadStart(3).') == "abcdef"
    assert run_code('"ab" >> Repeat(3).') == "ababab"
    expect_error('5 >> PadStart(3, "0").', "TypeError")
    expect_error('"a" >> PadStart(3, "00").', "TypeError")


def test_collection_helpers():
    assert run_code("[1, 2, 3] >> IndexOf(2).") == 1
    assert run_code("[1, 2, 3] >> IndexOf(9).") is None
    assert run_code('"banana" >> IndexOf("na").') == 2
    assert run_code("[2, 3] >> Prepend(1).") == [1, 2, 3]
    assert run_code("[1, 3] >> Insert(1, 2).") == [1, 2, 3]
    assert run_code("[1, 2] >> Insert(-1, 3).") == [1, 2, 3]
    assert run_code("[1, 2, 3] >> Remove(-1).") == [1, 2]
    assert run_code("[1, 2] >> First.") == 1
    assert run_code('"abc" >> Last.') == "c"
    assert run_code("[0] >> Repeat(2).") == [0, 0]
    expect_error("[] >> First.", "IndexError")
    expect_error("[1] >> Insert(5, 0).", "IndexError")
    expect_error("[1] >> Remove(3).", "IndexError")


def test_regular_expressions():
    assert run_code('"tel: 090-1234-5678" >> Match(`\\d{3}-\\d{4}`).') is True
    assert run_code('"a1b22c333" >> FindAll(`\\d+`).') == ["1", "22", "333"]
    assert run_code('"2026-11-25" >> ReplaceAll(`(\\d+)-(\\d+)-(\\d+)`, "$3/$2/$1").') == "25/11/2026"
    assert run_code('"a.b" >> ReplaceAll(`\\.`, "$$").') == "a$b"
    expect_error('"a" >> Match("(").', "RuntimeError")
    expect_error('"a" >> ReplaceAll("a", "$2").', "IndexError")


def test_now_has_weekday_millisecond_and_timestamp():
    now = run_code("Now.")
    assert 0 <= now["weekday"] <= 6
    assert 0 <= now["millisecond"] <= 999
    assert now["timestamp"] > 1_700_000_000
