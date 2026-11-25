"""`"lib/math.pop" >> Use.` で、ほかのファイルの関数を使う。"""

import asyncio

import pytest

from popcorn_lang.cli import evaluate, main
from popcorn_lang.evaluator import PopCornError
from popcorn_lang.lexer import LexerError
from popcorn_lang.parser import ParseError

MATH = """\
2 >> factor.

(x) >> pop Square:
    x * x

(x) >> pop Double:
    x >> Times

(x) >> pop Times:
    x * factor
"""


def run(files, main_path="main.pop"):
    return asyncio.run(evaluate(files[main_path], path=main_path, files=files))


def test_use_brings_every_function_of_the_file():
    files = {"lib/math.pop": MATH, "main.pop": '"lib/math.pop" >> Use.\n(3 >> Square) + (4 >> Double).'}
    assert run(files) == 17


def test_use_can_choose_names():
    files = {
        "lib/math.pop": MATH,
        "main.pop": '"lib/math.pop" >> Use(Double).\n5 >> Double.',
    }
    assert run(files) == 10
    files["main.pop"] = '"lib/math.pop" >> Use(Double).\n5 >> Square.'
    with pytest.raises(PopCornError) as err:
        run(files)
    assert err.value.err_type == "NameError"


def test_imported_functions_keep_their_own_file_values_and_helpers():
    # Double は、自分のファイルの Times と factor を使う。読んだ側の同じ名前は関係ない
    files = {
        "lib/math.pop": MATH,
        "main.pop": '"lib/math.pop" >> Use(Double).\n100 >> factor.\n5 >> Double.',
    }
    assert run(files) == 10


def test_use_may_come_after_the_call_like_function_definitions():
    files = {"lib/math.pop": MATH, "main.pop": '3 >> Square >> result.\n"lib/math.pop" >> Use.\nresult.'}
    assert run(files) == 9


def test_paths_are_relative_to_the_file_that_says_use():
    files = {
        "app/main.pop": '"../lib/text.pop" >> Use.\n"pop" >> Shout.',
        "lib/text.pop": '"./marks.pop" >> Use.\n(s) >> pop Shout:\n    s >> Uppercase >> Bang',
        "lib/marks.pop": "(s) >> pop Bang:\n    s + \"!\"",
    }
    assert run(files, "app/main.pop") == "POP!"


def test_functions_used_by_a_file_are_not_passed_on():
    files = {
        "main.pop": '"lib/text.pop" >> Use.\n"x" >> Bang.',
        "lib/text.pop": '"marks.pop" >> Use.\n(s) >> pop Shout:\n    s >> Bang',
        "lib/marks.pop": "(s) >> pop Bang:\n    s + \"!\"",
    }
    with pytest.raises(PopCornError) as err:
        run(files)
    assert err.value.err_type == "NameError"


def test_a_file_runs_once_even_if_used_twice(capsys):
    files = {
        "main.pop": '"a.pop" >> Use.\n"b.pop" >> Use.\n(1 >> A) + (1 >> B).',
        "a.pop": '"shared.pop" >> Use.\n(x) >> pop A:\n    x >> One',
        "b.pop": '"shared.pop" >> Use.\n(x) >> pop B:\n    x >> One',
        "shared.pop": '"loaded" >> Display.\n(x) >> pop One:\n    1',
    }
    assert run(files) == 2
    assert capsys.readouterr().out.count("loaded") == 1


def test_same_name_from_two_files_is_an_error():
    files = {
        "main.pop": '"a.pop" >> Use.\n"b.pop" >> Use.',
        "a.pop": "(x) >> pop Same:\n    1",
        "b.pop": "(x) >> pop Same:\n    2",
    }
    with pytest.raises(PopCornError) as err:
        run(files)
    assert err.value.err_type == "NameError"
    assert "a.pop" in err.value.message and "b.pop" in err.value.message
    # Use(...) で選べば、ぶつからない
    files["main.pop"] = '"a.pop" >> Use.\n"b.pop" >> Use(Other).'
    files["b.pop"] += "\n(x) >> pop Other:\n    3"
    assert run(files) is None


def test_name_defined_here_and_used_from_a_file_is_an_error():
    files = {"main.pop": '"a.pop" >> Use.\n(x) >> pop Same:\n    0', "a.pop": "(x) >> pop Same:\n    1"}
    with pytest.raises(PopCornError) as err:
        run(files)
    assert err.value.err_type == "NameError"


def test_circular_use_is_an_error():
    files = {
        "main.pop": '"a.pop" >> Use.',
        "a.pop": '"b.pop" >> Use.\n(x) >> pop A:\n    1',
        "b.pop": '"a.pop" >> Use.\n(x) >> pop B:\n    1',
    }
    with pytest.raises(PopCornError) as err:
        run(files)
    assert err.value.err_type == "RuntimeError"
    assert "a.pop -> b.pop -> a.pop" in err.value.message


def test_missing_file_is_an_io_error():
    with pytest.raises(PopCornError) as err:
        run({"main.pop": '"nope.pop" >> Use.'})
    assert err.value.err_type == "IOError"


def test_errors_in_a_used_file_name_the_file():
    with pytest.raises(ParseError) as err:
        run({"main.pop": '"bad.pop" >> Use.', "bad.pop": "1 >> >> x."})
    assert str(err.value).startswith("bad.pop: ")
    with pytest.raises(PopCornError) as err:
        run({"main.pop": '"bad.pop" >> Use.', "bad.pop": "1 / 0."})
    assert err.value.message.startswith("bad.pop: ")
    with pytest.raises(LexerError):
        run({"main.pop": '"bad.pop" >> Use.', "bad.pop": '"open'})


@pytest.mark.parametrize(
    "source",
    [
        '[1] >> Map:\n    "a.pop" >> Use.',          # ブロックの中
        '"a.pop" >> name.\nname >> Use.',             # パスが文字列で書かれていない
        '"a.pop" >> Use >> x.',                       # Use のあとに続ける
        '"a.pop" >> Use when true.',                  # 条件つき
        '"{x}.pop" >> Use.',                          # 補間
        '"a.pop" >> Use(x).',                         # 処理名でないもの
        "(x) >> pop F:\n    \"a.pop\" >> Use.",       # 関数の中
    ],
)
def test_use_must_be_a_plain_top_level_statement(source):
    with pytest.raises(ParseError):
        run({"main.pop": source, "a.pop": ""})


def test_cli_reads_files_next_to_the_script(tmp_path, capsys, monkeypatch):
    (tmp_path / "lib").mkdir()
    (tmp_path / "lib" / "math.pop").write_text(MATH, encoding="utf-8")
    script = tmp_path / "main.pop"
    script.write_text('"lib/math.pop" >> Use.\n7 >> Square >> Display.', encoding="utf-8")
    monkeypatch.chdir(tmp_path.parent)  # いまのフォルダーではなく、スクリプトのフォルダーから探す
    assert main([str(script)]) == 0
    assert capsys.readouterr().out.strip() == "49"


def test_cli_reports_a_missing_file(tmp_path, capsys):
    script = tmp_path / "main.pop"
    script.write_text('"missing.pop" >> Use.', encoding="utf-8")
    assert main([str(script)]) == 1
    assert capsys.readouterr().out.startswith("IOError: Use: cannot read 'missing.pop'")


def test_repository_example_runs(capsys):
    from pathlib import Path

    script = Path(__file__).resolve().parents[1] / "examples" / "modules" / "main.pop"
    assert main([str(script)]) == 0
    assert capsys.readouterr().out.split("\n")[:4] == ["* POPCORN *", "* popcorn *", "5", "5"]
