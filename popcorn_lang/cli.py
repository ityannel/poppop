"""Command-line interface for the PopCorn interpreter."""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

from .evaluator import Evaluator, EvaluatorError, PopCornError
from .lexer import Lexer, LexerError
from .migrate import MigrationError, migrate_braces
from .parser import ParseError, Parser
from .version import DISPLAY_VERSION, VERSION


def parse_source(source: str):
    return Parser(Lexer(source).tokenize()).parse()


def get_ast_json(source: str) -> str:
    try:
        return json.dumps(parse_source(source).to_dict(), ensure_ascii=False)
    except (LexerError, ParseError) as exc:
        return json.dumps({"error": str(exc)}, ensure_ascii=False)


def get_warnings(source: str) -> list[str]:
    """文法は正しいが、注意したほうがよい点（いまは、単一引用符の文字列の中の {…}）。"""
    try:
        lexer = Lexer(source)
        lexer.tokenize()
    except LexerError:
        return []
    return list(lexer.warnings)


async def evaluate(source: str, evaluator: Evaluator | None = None, args: list[str] | None = None):
    runtime = evaluator or Evaluator()
    if args is not None:
        runtime.script_args = list(args)  # 標準関数 Args が返す
    return await runtime.eval(parse_source(source), runtime.global_env)


def format_error(exc: Exception) -> str:
    if isinstance(exc, (LexerError, ParseError)):
        return f"SyntaxError: {exc}"
    if isinstance(exc, PopCornError):
        return f"{exc.err_type}: {exc.message}"
    if isinstance(exc, EvaluatorError):
        return f"RuntimeError: {exc}"
    if isinstance(exc, OSError):
        return f"IOError: {exc}"
    return f"SystemError: {exc}"


async def repl() -> int:
    print(f"REPL {DISPLAY_VERSION}")
    print("Type :quit to exit.")
    evaluator = Evaluator()
    buffer: list[str] = []

    while True:
        try:
            line = input(">> " if not buffer else "   ")
        except (EOFError, KeyboardInterrupt):
            print()
            return 0

        if line.strip() in {":quit", "exit"}:
            return 0

        stripped = line.strip()
        in_block = any(previous.rstrip().endswith(":") for previous in buffer)
        if stripped:
            buffer.append(line)
        # `:` のブロックを書いているあいだは、空の行が来るまで読みつづける
        if stripped.endswith(":") or (in_block and stripped):
            continue
        if not buffer:
            continue
        if not in_block and not stripped.endswith("."):
            continue
        joined = "\n".join(buffer)

        try:
            await evaluate(joined, evaluator)
        except Exception as exc:
            print(format_error(exc))
        finally:
            buffer.clear()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="popcorn",
        description="Run a PopCorn source file or start the interactive REPL.",
        epilog="Run tests with: popcorn test [files or folders]",
    )
    parser.add_argument("file", nargs="?", type=Path, help="a .pop or .popcorn file")
    parser.add_argument("args", nargs="*", help="arguments for the program (read them with Args)")
    parser.add_argument("--ast", action="store_true", help="print the parsed AST as JSON")
    parser.add_argument(
        "--migrate",
        action="store_true",
        help="rewrite old '{ ... }' blocks in the file to ':' and indentation (in place)",
    )
    parser.add_argument(
        "--version", action="version", version=DISPLAY_VERSION
    )
    return parser


def build_test_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="popcorn test",
        description=(
            "Run the tests in PopCorn files. A test is a function whose name starts with "
            "'Test' (pop TestAdd: ...). Folders are searched for files ending in _test.pop."
        ),
    )
    parser.add_argument(
        "paths", nargs="*", type=Path,
        help="test files or folders (default: the current folder)",
    )
    return parser


def run_tests_command(argv: list[str]) -> int:
    from .testing import run_test_paths

    args = build_test_parser().parse_args(argv)
    return asyncio.run(run_test_paths(args.paths))


def main(argv: list[str] | None = None) -> int:
    raw_args = sys.argv[1:] if argv is None else list(argv)
    # `popcorn test …` はテストを実行する。test という名前のファイルがあるときは、そのファイルを実行する
    if raw_args and raw_args[0] == "test" and not Path("test").is_file():
        return run_tests_command(raw_args[1:])
    args = build_parser().parse_args(raw_args)
    if args.file is None:
        return asyncio.run(repl())

    try:
        source = args.file.read_text(encoding="utf-8")
        if args.migrate:
            migrated = migrate_braces(source)
            if migrated == source:
                print(f"{args.file}: no '{{ }}' blocks to rewrite")
            else:
                args.file.write_text(migrated, encoding="utf-8")
                print(f"{args.file}: rewrote '{{ }}' blocks to ':' and indentation")
            return 0
        if args.ast:
            print(get_ast_json(source))
        else:
            asyncio.run(evaluate(source, args=args.args))
        return 0
    except MigrationError as exc:
        print(f"SyntaxError: {exc}")
        return 1
    except (OSError, LexerError, ParseError, PopCornError, EvaluatorError) as exc:
        print(format_error(exc))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
