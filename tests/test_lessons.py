import asyncio

from popcorn_lang.cli import evaluate
from popcorn_lang.lessons import LESSONS, public_lessons, validate_lesson


def test_all_lesson_solutions_run_and_pass():
    for lesson in LESSONS:
        result = asyncio.run(evaluate(lesson["solution"]))
        validation = validate_lesson(lesson["id"], lesson["solution"], result)
        assert validation["passed"], lesson["id"]


def test_starters_do_not_already_pass():
    for lesson in LESSONS:
        result = asyncio.run(evaluate(lesson["starter"]))
        validation = validate_lesson(lesson["id"], lesson["starter"], result)
        assert not validation["passed"], lesson["id"]


def test_public_lessons_do_not_duplicate_validation_values():
    lessons = public_lessons()
    assert len(lessons) == len(LESSONS)
    assert all("expected" not in lesson for lesson in lessons)
    assert all("required" not in lesson for lesson in lessons)


def test_every_lesson_displays_its_final_value():
    assert LESSONS[0]["title"] == "はじめての表示"
    for lesson in LESSONS:
        assert lesson["starter"].rstrip().endswith(">> Display.")
        assert lesson["solution"].rstrip().endswith(">> Display.")
        assert "Display" in lesson["required"]


def test_lesson_titles_are_short_friendly_and_unique():
    titles = [lesson["title"] for lesson in LESSONS]
    banned_phrases = ("全員を変換", "非破壊更新", "道を選ぶ")

    assert len(titles) == len(set(titles))
    assert all(len(title) <= 18 for title in titles)
    assert all(
        phrase not in title
        for title in titles
        for phrase in banned_phrases
    )
