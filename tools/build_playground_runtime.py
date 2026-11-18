"""Build the browser Playground's runtime archive from the current package."""

from __future__ import annotations

import argparse
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile


def build_archive(output: Path) -> None:
    root = Path(__file__).resolve().parents[1]
    package = root / "popcorn_lang"
    sources = sorted(package.rglob("*.py"))
    if not sources:
        raise RuntimeError(f"No Python sources found below {package}")

    output.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(output, "w", compression=ZIP_DEFLATED) as archive:
        for source in sources:
            archive.write(source, source.relative_to(root).as_posix())


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "output",
        nargs="?",
        type=Path,
        default=Path("popcorn-runtime.zip"),
    )
    arguments = parser.parse_args()
    build_archive(arguments.output.resolve())


if __name__ == "__main__":
    main()
