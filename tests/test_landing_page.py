"""紹介サイト（index.html と lp/）に出す、コード・出力・エラー文が、いまの PopCorn と同じかを確かめる。

紹介サイトは、ページを開いてすぐ見せるために、実行結果を lp/data.js に持っている。
言語が変わって結果がずれたら、ここで気づけるようにする。
"""

import json
from pathlib import Path

import pytest

from popcorn_lang.cli import main
from popcorn_lang.gallery import public_gallery
from popcorn_lang.lessons import public_lessons


ROOT = Path(__file__).resolve().parents[1]
DATA_JS = (ROOT / "lp" / "data.js").read_text(encoding="utf-8")
DATA = json.loads(DATA_JS[DATA_JS.index("{") : DATA_JS.rindex("}") + 1])


def run(tmp_path, capsys, source, name="lp.pop"):
    script = tmp_path / name
    script.write_text(source + "\n", encoding="utf-8")
    code = main([str(script)])
    return code, capsys.readouterr().out.rstrip("\n")


def run_tests(tmp_path, capsys, source, name):
    script = tmp_path / name
    script.write_text(source + "\n", encoding="utf-8")
    code = main(["test", str(script)])
    out = capsys.readouterr().out.rstrip("\n")
    return code, out.replace(str(script), name)


def test_hero_pipeline_and_each_step(tmp_path, capsys):
    hero = DATA["hero"]
    assert run(tmp_path, capsys, hero["code"] + "\n" + hero["check"])[1] == hero["output"]
    peek = hero["code"].replace("\n    >> ", "\n    >?> ")
    _, out = run(tmp_path, capsys, peek)
    shown = [line.split(") ", 1)[1] for line in out.splitlines()]
    assert shown == hero["values"][0:4]


@pytest.mark.parametrize("rule", DATA["rules"])
def test_rules(tmp_path, capsys, rule):
    assert run(tmp_path, capsys, rule["code"]) == (0, rule["output"])


def test_reading_order(tmp_path, capsys):
    order = DATA["order"]
    source = order["popcornSetup"] + "\n\n" + order["popcorn"] + "\n" + order["check"]
    assert run(tmp_path, capsys, source) == (0, order["output"])
    scope = {}
    exec(order["pythonSetup"], scope)
    assert str(eval(order["python"], scope)) == order["output"]


def test_fizzbuzz(tmp_path, capsys):
    data = DATA["fizzbuzz"]
    assert run(tmp_path, capsys, data["code"]) == (0, data["output"])


def test_peek_lines(tmp_path, capsys):
    data = DATA["peek"]
    parts = data["parts"]
    assert run(tmp_path, capsys, " >?> ".join(parts)) == (0, "\n".join(data["lines"]))
    for index in range(len(parts) - 1):
        ops = [">>"] * (len(parts) - 1)
        ops[index] = ">?>"
        source = parts[0] + "".join(f" {op} {part}" for op, part in zip(ops, parts[1:]))
        assert run(tmp_path, capsys, source) == (0, data["lines"][index])


@pytest.mark.parametrize("sample", DATA["fallback"]["samples"])
def test_fallback(tmp_path, capsys, sample):
    text = json.dumps(sample["input"], ensure_ascii=False)
    code = DATA["fallback"]["code"]
    assert run(tmp_path, capsys, f"{text} >> text.\n{code}\nage >> Display.") == (0, sample["output"])
    if "error" in sample:
        _, out = run(tmp_path, capsys, f"{text} >> Trim >> Num >> Display.")
        assert out == sample["error"]


def test_fork(tmp_path, capsys):
    data = DATA["fork"]
    assert run(tmp_path, capsys, data["code"] + "\n" + data["check"]) == (0, data["output"])


def test_test_runner_output(tmp_path, capsys):
    data = DATA["tests"]
    assert run_tests(tmp_path, capsys, data["good"], data["file"]) == (0, data["goodOutput"])
    assert run_tests(tmp_path, capsys, data["bad"], data["file"]) == (1, data["badOutput"])


def test_error_examples(tmp_path, capsys):
    data = DATA["errors"]
    assert run(tmp_path, capsys, data["base"]) == (0, data["output"])
    for case in data["cases"]:
        code, out = run(tmp_path, capsys, case["code"])
        assert code == 1
        assert out == case["error"], case["id"]
        line, start, end = case["mark"]
        assert 0 <= start < end <= len(case["code"].split("\n")[line])


@pytest.mark.parametrize("stage", DATA["lab"]["stages"], ids=lambda stage: stage["id"])
def test_lab_errors(tmp_path, capsys, stage):
    _, out = run(tmp_path, capsys, f"5 >> {stage['code']} >> Display.")
    assert out == stage["numError"]
    _, out = run(tmp_path, capsys, f"[] >> {stage['code']} >> Display.")
    if "emptyError" in stage:
        assert out == stage["emptyError"]
    else:
        assert not out.startswith(("TypeError", "RuntimeError")), out


def test_lab_code_shape_runs(tmp_path, capsys):
    source = "[3, 8, 1, 6, 5, 2]\n    >> Filter (@ % 2 == 0)\n    >> Map (@ * 2)\n    >> Sum\n    >> result.\n\nresult >> Display."
    assert run(tmp_path, capsys, source) == (0, "32")


def test_examples_are_the_playground_gallery():
    gallery = {item["id"]: item for item in public_gallery()}
    for example in DATA["examples"]:
        assert example["code"] == gallery[example["id"]]["code"]
        assert example["interactive"] == bool(gallery[example["id"]]["interactive"])


def test_lessons_are_the_playground_lessons():
    lessons = [
        {"badge": item["badge"], "title": item["title"], "intro": item["intro"]}
        for item in public_lessons()
    ]
    assert DATA["lessons"] == lessons


def test_landing_page_and_playground_files():
    landing = (ROOT / "index.html").read_text(encoding="utf-8")
    playground = (ROOT / "playground" / "index.html").read_text(encoding="utf-8")
    assert 'href="playground/"' in landing
    assert "lp/lp.js" in landing
    for asset in ("playground.css", "popcorn-visual.css", "itya-theme.css", "playground.js"):
        assert f'"../{asset}"' in playground
        assert (ROOT / asset).exists()
