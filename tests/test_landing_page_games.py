"""紹介サイトのミニゲーム（lp/games-data.js）の、コード・出力・エラー文が、いまの PopCorn と同じかを確かめる。"""

import itertools
import json
import re
from pathlib import Path

import pytest

from popcorn_lang.cli import main


ROOT = Path(__file__).resolve().parents[1]
RAW = (ROOT / "lp" / "games-data.js").read_text(encoding="utf-8")
GAMES = json.loads(RAW[RAW.index("{") : RAW.rindex("}") + 1])
JAPANESE = re.compile(r"[぀-ヿ一-鿿]")


def run(tmp_path, capsys, source):
    script = tmp_path / "g.pop"
    script.write_text(source + "\n", encoding="utf-8")
    code = main([str(script)])
    return code, capsys.readouterr().out.rstrip("\n")


def texts(node):
    if isinstance(node, dict) and set(node) == {"ja", "en"}:
        yield node
    elif isinstance(node, dict):
        for value in node.values():
            yield from texts(value)
    elif isinstance(node, list):
        for value in node:
            yield from texts(value)


def test_every_text_has_both_languages():
    pairs = list(texts(GAMES))
    assert pairs
    for pair in pairs:
        assert pair["ja"] and pair["en"]
        assert not JAPANESE.search(pair["en"]), pair["en"]


@pytest.mark.parametrize("song", GAMES["rhythm"]["songs"], ids=lambda s: s["id"])
def test_rhythm_songs(tmp_path, capsys, song):
    kinds = {lane["kind"] for lane in GAMES["rhythm"]["lanes"]}
    assert all(kind in kinds for _, kind in song["chunks"])
    assert " ".join(text for text, _ in song["chunks"]).replace(" .", ".") == song["code"]
    assert run(tmp_path, capsys, song["code"]) == (0, song["output"])


@pytest.mark.parametrize("quiz", GAMES["quiz"], ids=lambda q: q["code"])
def test_quiz(tmp_path, capsys, quiz):
    code, out = run(tmp_path, capsys, quiz["code"])
    assert (code, out) == (0, quiz["output"])
    if quiz["kind"] == "output":
        assert quiz["choices"][quiz["answer"]] == out
        assert len(set(map(json.dumps, quiz["choices"]))) == len(quiz["choices"])
    else:
        assert "[2, 4, 6]" in out and out.endswith("12")


@pytest.mark.parametrize("bug", GAMES["bugs"], ids=lambda b: b["code"])
def test_bugs(tmp_path, capsys, bug):
    assert run(tmp_path, capsys, bug["code"]) == (1, bug["error"])
    assert run(tmp_path, capsys, bug["fixed"]) == (0, bug["output"])
    assert bug["code"] != bug["fixed"]


@pytest.mark.parametrize("puzzle", GAMES["puzzles"], ids=lambda p: p["output"])
def test_puzzles_accept_exactly_the_working_orders(tmp_path, capsys, puzzle):
    chips = puzzle["chips"]
    working = set()
    for size in range(1, len(chips) + 1):
        for combo in itertools.permutations(chips, size):
            source = puzzle["join"].join(combo)
            code, out = run(tmp_path, capsys, source)
            if code == 0 and out == puzzle["output"]:
                working.add(source)
    assert working == set(puzzle["accept"])


def test_games_are_wired_into_both_pages():
    for page in ("index.html", "en/index.html"):
        html = (ROOT / page).read_text(encoding="utf-8")
        assert "lp/games-data.js" in html and "lp/games.js" in html and "data-open-games" in html
        assert html.index("games.js") < html.index("lp/lp.js")
