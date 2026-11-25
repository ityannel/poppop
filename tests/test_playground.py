from pathlib import Path
from zipfile import ZipFile

from popcorn_lang.version import DISPLAY_VERSION
from tools.build_playground_runtime import build_archive


ROOT = Path(__file__).resolve().parents[1]


def test_release_identity_is_visible_to_the_playground():
    assert DISPLAY_VERSION == "PopCorn 1"
    assert DISPLAY_VERSION in (ROOT / "popcorn_specification.md").read_text(
        encoding="utf-8"
    )


def test_playground_runtime_archive_contains_every_python_module(tmp_path):
    output = tmp_path / "popcorn-runtime.zip"
    build_archive(output)
    expected = {
        path.relative_to(ROOT).as_posix()
        for path in (ROOT / "popcorn_lang").rglob("*.py")
    }
    with ZipFile(output) as archive:
        assert set(archive.namelist()) == expected


def test_playground_uses_the_current_runtime_and_specification():
    worker = (ROOT / "playground-worker.js").read_text(encoding="utf-8")
    application = (ROOT / "playground.js").read_text(encoding="utf-8")
    assert "popcorn-runtime.zip" in worker
    assert 'cache: "no-store"' in worker
    assert "popcorn_specification.md" in application
    assert 'cache: "no-store"' in application
    assert "handleLessonResult" in application
    assert '"lessons": public_lessons()' in worker
    assert '"gallery": public_gallery()' in worker
    assert "friendlySpecificationExamples" in application


def test_playground_worker_loads_every_python_module_without_the_archive():
    # popcorn-runtime.zip がないとき（ソースのまま配信）に読むファイルの一覧
    worker = (ROOT / "playground-worker.js").read_text(encoding="utf-8")
    for path in (ROOT / "popcorn_lang").glob("*.py"):
        if path.name in {"__main__.py"}:
            continue
        assert f'"{path.name}"' in worker, path.name


def test_playground_runs_with_every_file_for_use():
    worker = (ROOT / "playground-worker.js").read_text(encoding="utf-8")
    application = (ROOT / "playground.js").read_text(encoding="utf-8")
    assert "files: runFiles" in application
    assert "path=__popcorn_path" in worker
    assert "files=json.loads(__popcorn_files)" in worker
