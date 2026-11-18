import asyncio

from popcorn_lang.cli import evaluate, parse_source
from popcorn_lang.gallery import GALLERY, public_gallery


def test_gallery_names_are_unique_and_consistent():
    titles = [example["title"] for example in GALLERY]
    assert len(titles) == len(set(titles))
    assert all("｜" in title for title in titles)


def test_every_gallery_program_parses():
    for example in GALLERY:
        parse_source(example["code"])


def test_non_interactive_gallery_programs_run():
    for example in GALLERY:
        if not example["interactive"]:
            asyncio.run(evaluate(example["code"]))


def test_public_gallery_is_json_safe_shape():
    gallery = public_gallery()
    assert len(gallery) == len(GALLERY)
    assert all(
        {"id", "category", "title", "description", "interactive", "code"}
        <= example.keys()
        for example in gallery
    )
