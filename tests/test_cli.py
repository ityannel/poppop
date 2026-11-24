import asyncio
import json

from popcorn_lang.cli import DISPLAY_VERSION, VERSION, evaluate, get_ast_json, main


def test_version():
    assert VERSION == "1"
    assert DISPLAY_VERSION == "PopCorn 1"


def test_ast_json():
    ast = json.loads(get_ast_json("1 >> value."))
    assert ast["type"] == "Program"


def test_evaluate_returns_last_value():
    result = asyncio.run(evaluate("1 >> value. value + 2."))
    assert result == 3


def test_missing_file_returns_error(tmp_path):
    assert main([str(tmp_path / "missing.pop")]) == 1
def test_script_arguments_reach_the_args_function(tmp_path, capsys):
    from popcorn_lang.cli import main
    script = tmp_path / "args.pop"
    script.write_text('Args >> Display.', encoding="utf-8")
    assert main([str(script), "a", "b"]) == 0
    assert capsys.readouterr().out.strip() == '["a", "b"]'
    assert main([str(script)]) == 0
    assert capsys.readouterr().out.strip() == "[]"


def test_migrate_rewrites_brace_blocks_in_place(tmp_path, capsys):
    script = tmp_path / "old.pop"
    script.write_text("[1, 2] >> Map as x { x * 2. } >> d.\nd >> Display.\n", encoding="utf-8")
    assert main([str(script), "--migrate"]) == 0
    assert script.read_text(encoding="utf-8") == "[1, 2] >> Map as x:\n    x * 2.\n>> d.\nd >> Display.\n"
    capsys.readouterr()
    assert main([str(script)]) == 0
    assert capsys.readouterr().out.strip() == "[2, 4]"
