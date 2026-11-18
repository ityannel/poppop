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
