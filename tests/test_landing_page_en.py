"""英語の紹介サイト（en/index.html と lp/data.en.js）を確かめる。

- en/index.html は、tools/build_en_page.py が index.html から作る。手で直さない。
- lp/data.en.js のコードと出力が、いまの PopCorn と同じか。
"""

import io
import json
import sys
from pathlib import Path

import pytest

from popcorn_lang.cli import main
from tools.build_en_page import build


ROOT = Path(__file__).resolve().parents[1]


def load(name):
    text = (ROOT / "lp" / name).read_text(encoding="utf-8")
    return json.loads(text[text.index("{\n") : text.rindex("}") + 1])


JA = load("data.js")
EN = load("data.en.js")


def run(tmp_path, capsys, monkeypatch, source, stdin=""):
    script = tmp_path / "main.pop"
    script.write_text(source + "\n", encoding="utf-8")
    monkeypatch.setattr(sys, "stdin", io.StringIO(stdin))
    code = main([str(script)])
    return code, capsys.readouterr().out.rstrip("\n")


def test_english_page_is_up_to_date():
    source = (ROOT / "index.html").read_text(encoding="utf-8")
    page = (ROOT / "en" / "index.html").read_text(encoding="utf-8")
    assert page == build(source), "Run: python tools/build_en_page.py"


def test_english_page_loads_english_data():
    page = (ROOT / "en" / "index.html").read_text(encoding="utf-8")
    assert '<html lang="en">' in page
    assert '<script src="../lp/data.en.js"></script>' in page
    assert 'href="../playground/"' in page
    assert 'hreflang="en" href="https://popcorn.itya.site/en/"' in page


@pytest.mark.parametrize("rule", EN["rules"])
def test_rules(tmp_path, capsys, monkeypatch, rule):
    assert run(tmp_path, capsys, monkeypatch, rule["code"]) == (0, rule["output"])


def test_error_examples(tmp_path, capsys, monkeypatch):
    data = EN["errors"]
    assert run(tmp_path, capsys, monkeypatch, data["base"]) == (0, data["output"])
    for case in data["cases"]:
        code, out = run(tmp_path, capsys, monkeypatch, case["code"])
        assert code == 1
        assert out == case["error"], case["id"]
        line, start, end = case["mark"]
        assert 0 <= start < end <= len(case["code"].split("\n")[line])


def test_fallback_samples_are_from_the_japanese_page():
    ja = {json.dumps(s, ensure_ascii=False) for s in JA["fallback"]["samples"]}
    assert EN["fallback"]["code"] == JA["fallback"]["code"]
    assert all(json.dumps(s, ensure_ascii=False) in ja for s in EN["fallback"]["samples"])


def test_lab_has_the_same_blocks():
    strip = lambda lab: [{k: v for k, v in s.items() if k != "label"} for s in lab["stages"]]
    assert strip(EN["lab"]) == strip(JA["lab"])
    assert [p["stages"] for p in EN["lab"]["presets"]] == [p["stages"] for p in JA["lab"]["presets"]]
    assert EN["lab"]["source"] == JA["lab"]["source"]


@pytest.mark.parametrize("example", EN["examples"], ids=lambda example: example["id"])
def test_examples_run(tmp_path, capsys, monkeypatch, example):
    code, out = run(tmp_path, capsys, monkeypatch, example["code"], "Itya\nrock\n")
    assert code == 0, out
    assert "Error" not in out


def test_lessons_match_the_playground_lessons():
    assert [l["badge"] for l in EN["lessons"]] == [l["badge"] for l in JA["lessons"]]
