"""テストのしくみ（Expect・Assert・ExpectError と popcorn test）のテスト。"""

import asyncio

import pytest

from popcorn_lang.cli import main
from popcorn_lang.evaluator import PopCornError
from popcorn_lang.testing import (
    ERROR,
    FAILED,
    PASSED,
    collect_test_files,
    format_file_result,
    is_test_name,
    run_test_source,
)
from test_evaluator import run_code


def run_tests(source):
    return asyncio.run(run_test_source(source, "sample_test.pop"))


def assertion_message(code):
    with pytest.raises(PopCornError) as info:
        run_code(code)
    assert info.value.err_type == "AssertionError"
    return info.value.message


# --- Expect --------------------------------------------------------------

def test_expect_returns_the_value_when_equal():
    assert run_code("(1, 2) >> Add >> Expect(3).") == 3
    assert run_code("[1, 2.0] >> Expect([1.0, 2]).") == [1, 2.0]
    assert run_code('{"a": 1, "b": 2} >> Expect({"b": 2, "a": 1}) >> Keys.') == ["a", "b"]


def test_expect_reports_expected_and_actual_values():
    message = assertion_message("3 >> Expect(4).")
    assert "期待した値: 4" in message
    assert "実際の値:   3" in message


def test_expect_hints_at_type_float_space_and_position_differences():
    assert "型がちがいます" in assertion_message('42 >> Str >> Expect(42).')
    assert '実際の値:   "42"' in assertion_message('42 >> Str >> Expect(42).')
    assert "小数の計算" in assertion_message("0.1 + 0.2 >> Expect(0.3).")
    assert "Trim" in assertion_message('"abc " >> Expect("abc").')
    assert "添字 1 の要素" in assertion_message("[1, 2, 3] >> Expect([1, 5, 3]).")
    assert "要素の数" in assertion_message("[1, 2] >> Expect([1, 2, 3]).")
    assert 'キー "age" がありません' in assertion_message('{"name": "A"} >> Expect({"name": "A", "age": 1}).')
    assert 'キー "name" の値' in assertion_message('{"name": "A"} >> Expect({"name": "B"}).')


def test_expect_message_comes_first():
    assert assertion_message('1 >> Expect(2, "足し算がおかしい").').startswith("足し算がおかしい\n")


def test_expect_needs_an_expected_value():
    with pytest.raises(PopCornError) as info:
        run_code("1 >> Expect.")
    assert info.value.err_type == "TypeError"


# --- Assert --------------------------------------------------------------

def test_assert():
    assert run_code("1 < 2 >> Assert.") is True
    assert "true になりませんでした" in assertion_message("1 > 2 >> Assert.")
    assert assertion_message('1 > 2 >> Assert("1 は 2 より小さい").') == "1 は 2 より小さい"


def test_assert_requires_bool():
    with pytest.raises(PopCornError) as info:
        run_code("1 >> Assert.")
    assert info.value.err_type == "TypeError"


# --- ExpectError ---------------------------------------------------------

def test_expect_error_returns_the_error_dict():
    assert run_code("0 >> ExpectError(10 / @).") == {
        "type": "RuntimeError",
        "message": "Division by zero",
    }
    assert run_code('0 >> ExpectError(10 / @, "RuntimeError") >> Get("type").') == "RuntimeError"


def test_expect_error_sees_variables_where_it_is_written():
    assert run_code('[1] >> xs.\n5 >> ExpectError(xs[@]) >> Get("type").') == "IndexError"


def test_expect_error_fails_without_an_error_or_with_another_type():
    assert "エラーになりませんでした" in assertion_message("2 >> ExpectError(10 / @).")
    message = assertion_message('0 >> ExpectError(10 / @, "TypeError").')
    assert "期待したエラー: TypeError" in message
    assert "RuntimeError" in message


def test_expect_error_can_check_assertion_errors():
    assert run_code('1 >> ExpectError(@ >> Expect(2), "AssertionError") >> Get("type").') == "AssertionError"


def test_expect_error_needs_the_expression_in_parentheses():
    with pytest.raises(PopCornError) as info:
        run_code("(0, 1) >> ExpectError.")
    assert info.value.err_type == "TypeError"


def test_user_function_named_expect_wins_over_the_builtin():
    assert run_code("(a, b) >> pop Expect:\n    a + b\n1 >> Expect(2).") == 3


def test_assertion_errors_can_be_caught():
    code = "1 >> Try:\n    @ >> Expect(2).\nCatch as err:\n    err::type.\n"
    assert run_code(code) == "AssertionError"


# --- テストの見つけ方と実行 ------------------------------------------------

def test_test_names():
    assert is_test_name("TestAdd")
    assert is_test_name("Test_add")
    assert is_test_name("Test1")
    assert not is_test_name("Test")
    assert not is_test_name("Tester")
    assert not is_test_name("MyTest")


SAMPLE = """
(a, b) >> pop AddTwo:
    a + b.

"setup" >> Display.

pop TestPasses:
    (1, 2) >> AddTwo >> Expect(3).

pop TestFails:
    1 >> AddTwo(1) >> Expect(3).

pop TestBreaks:
    missing >> Display.

pop Helper:
    1 >> Expect(2).

(x) >> pop TestWithArgument:
    x.
"""


def test_run_test_source_runs_each_test_in_order(capsys):
    result = run_tests(SAMPLE)
    assert result.error is None
    assert [(case.name, case.status) for case in result.cases] == [
        ("TestPasses", PASSED),
        ("TestFails", FAILED),
        ("TestBreaks", ERROR),
        ("TestWithArgument", ERROR),
    ]
    failed = result.cases[1]
    assert failed.line == 11
    assert "期待した値: 3" in failed.message
    assert "NameError" in result.cases[2].message
    assert result.cases[2].line == 14
    assert "引数をとりません" in result.cases[3].message
    assert capsys.readouterr().out.count("setup") == 1   # いちばん外側の文は 1 回だけ


def test_a_file_that_cannot_run_reports_the_error():
    result = run_tests('pop TestA:\n    1 >> Expect(1).\n\n1 / 0 >> x.\n')
    assert result.cases == []
    assert "RuntimeError" in result.error
    assert result.error_line == 4

    syntax = run_tests("pop TestA:\n    1 >> Expect(1)\n2 >>")
    assert syntax.error.startswith("SyntaxError")


def test_return_in_a_test_ends_it_successfully():
    result = run_tests("pop TestEarly:\n    1 >> Return.\n    1 >> Expect(2).\n")
    assert result.cases[0].status == PASSED


def test_collect_test_files(tmp_path):
    (tmp_path / "a_test.pop").write_text("", encoding="utf-8")
    (tmp_path / "b.pop").write_text("", encoding="utf-8")
    (tmp_path / "sub").mkdir()
    (tmp_path / "sub" / "c_test.pop").write_text("", encoding="utf-8")
    (tmp_path / ".hidden").mkdir()
    (tmp_path / ".hidden" / "d_test.pop").write_text("", encoding="utf-8")
    assert collect_test_files([tmp_path]) == [tmp_path / "a_test.pop", tmp_path / "sub" / "c_test.pop"]
    assert collect_test_files([tmp_path / "b.pop"]) == [tmp_path / "b.pop"]


# --- popcorn test ----------------------------------------------------------

def test_popcorn_test_command_passes(tmp_path, capsys):
    (tmp_path / "ok_test.pop").write_text("pop TestOne:\n    1 + 1 >> Expect(2).\n", encoding="utf-8")
    assert main(["test", str(tmp_path)]) == 0
    out = capsys.readouterr().out
    assert "✓ TestOne" in out
    assert "1 件中 1 件成功" in out


def test_popcorn_test_command_fails(tmp_path, capsys):
    path = tmp_path / "calc.pop"
    path.write_text(SAMPLE, encoding="utf-8")
    assert main(["test", str(path)]) == 1
    out = capsys.readouterr().out
    assert "✗ TestFails（11 行目）" in out
    assert "! TestBreaks（14 行目）" in out
    assert "4 件中 1 件成功、1 件失敗、2 件エラー" in out


def test_popcorn_test_without_tests(tmp_path, capsys):
    assert main(["test", str(tmp_path)]) == 1
    assert "テストファイルが見つかりません" in capsys.readouterr().out
    path = tmp_path / "empty.pop"
    path.write_text("1 >> x.\n", encoding="utf-8")
    assert main(["test", str(path)]) == 1
    assert "テストが見つかりません" in capsys.readouterr().out


def test_running_a_test_file_normally_does_not_call_the_tests(tmp_path, capsys):
    path = tmp_path / "x_test.pop"
    path.write_text('pop TestOne:\n    "called" >> Display.\n', encoding="utf-8")
    assert main([str(path)]) == 0
    assert "called" not in capsys.readouterr().out


def test_example_tests_pass(capsys):
    from pathlib import Path

    examples = Path(__file__).resolve().parents[1] / "examples"
    assert main(["test", str(examples)]) == 0


def test_testing_functions_are_documented():
    from pathlib import Path

    root = Path(__file__).resolve().parents[1]
    spec = (root / "popcorn_specification.md").read_text(encoding="utf-8")
    hover = (root / "vscode-popcorn" / "language-features.js").read_text(encoding="utf-8")
    for name in ("Expect", "Assert", "ExpectError"):
        assert f"| `{name}` |" in spec
        assert f"    {name}: {{ description:" in hover
    assert "| `AssertionError` |" in spec


# --- `>?>` の消し忘れ ------------------------------------------------------


def test_leftover_tap_pipe_is_warned_but_does_not_fail(capsys):
    result = run_tests('pop TestTap:\n    "abc" >> Num >!> 0 >?> Expect(0).\n')
    assert result.ok
    assert result.tap_lines == [2]
    assert "2 行目" in format_file_result(result)


def test_no_tap_warning_without_tap_pipe():
    result = run_tests("pop TestPlain:\n    1 >> Expect(1).\n")
    assert result.tap_lines == []
    assert ">?>" not in format_file_result(result)
