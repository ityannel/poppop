"""Command-line interface for the PopCorn interpreter."""

from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path

from .evaluator import Evaluator, EvaluatorError, PopCornError
from .lexer import Lexer, LexerError
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


async def evaluate(source: str, evaluator: Evaluator | None = None):
    runtime = evaluator or Evaluator()
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

        buffer.append(line)
        joined = "\n".join(buffer)
        if joined.count("{") > joined.count("}"):
            continue
        stripped = line.strip()
        if not (stripped.endswith(".") or stripped.endswith("}")):
            continue

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
    )
    parser.add_argument("file", nargs="?", type=Path, help="a .pop or .popcorn file")
    parser.add_argument("--ast", action="store_true", help="print the parsed AST as JSON")
    parser.add_argument(
        "--version", action="version", version=DISPLAY_VERSION
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.file is None:
        return asyncio.run(repl())

    try:
        source = args.file.read_text(encoding="utf-8")
        if args.ast:
            print(get_ast_json(source))
        else:
            asyncio.run(evaluate(source))
        return 0
    except (OSError, LexerError, ParseError, PopCornError, EvaluatorError) as exc:
        print(format_error(exc))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
