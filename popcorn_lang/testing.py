"""PopCorn のテスト実行（`popcorn test`）。

テストは、名前が `Test` で始まる、引数のない関数です。

    pop TestAdd:
        (1, 2) >> Add >> Expect(3).

テストファイルを読むと、まずファイル全体を、ふつうに実行します（関数の定義と、
いちばん外側の文）。そのあと、テスト関数を 1 つずつ、書いた順に呼びます。
1 つのテストが失敗しても、残りのテストは続けて実行します。
"""

from __future__ import annotations

import sys
from dataclasses import dataclass, field
from pathlib import Path

from .ast_nodes import FunctionCallNode, FunctionDefNode
from .environment import Environment
from .evaluator import Evaluator, EvaluatorError, PopCornError
from .lexer import Lexer, LexerError
from .parser import ParseError, Parser

TEST_FILE_SUFFIXES = ("_test.pop", "_test.popcorn")

PASSED = "passed"
FAILED = "failed"   # Expect・Assert・ExpectError が失敗した（AssertionError）
ERROR = "error"     # それ以外のエラーで止まった


def is_test_name(name: str) -> bool:
    """`TestAdd`、`Test_add`、`Test1` はテスト。`Test` だけや `Tester` はテストではない。"""
    if not name.startswith("Test") or len(name) == 4:
        return False
    following = name[4]
    return following.isupper() or following.isdigit() or following == "_"


@dataclass
class CaseResult:
    name: str
    status: str
    message: str = ""
    line: int | None = None


@dataclass
class FileResult:
    path: str
    cases: list[CaseResult] = field(default_factory=list)
    error: str | None = None      # ファイルそのものを実行できなかったとき
    error_line: int | None = None

    def count(self, status: str) -> int:
        return sum(1 for case in self.cases if case.status == status)

    @property
    def ok(self) -> bool:
        return self.error is None and all(case.status == PASSED for case in self.cases)


def _describe_error(exc: BaseException) -> tuple[str, str, int | None]:
    """(状態, メッセージ, 行番号) にする。"""
    from .cli import format_error

    if isinstance(exc, PopCornError):
        if exc.err_type == "AssertionError":
            return FAILED, exc.message, exc.line
        return ERROR, f"{exc.err_type}: {exc.message}", exc.line
    if isinstance(exc, (LexerError, ParseError, EvaluatorError, OSError)):
        return ERROR, format_error(exc), getattr(exc, "line", None)
    name = type(exc).__name__
    if name == "ReturnException":
        return ERROR, "RuntimeError: Return は pop で定義した関数の中でのみ使用できます。", None
    if name == "BreakException":
        return ERROR, "RuntimeError: Break は Loop の中でのみ使用できます。", None
    return ERROR, f"SystemError: {exc}", None


def find_test_functions(program) -> list[FunctionDefNode]:
    return [
        stmt for stmt in program.statements
        if isinstance(stmt, FunctionDefNode) and is_test_name(stmt.name)
    ]


async def run_defined_tests(evaluator: Evaluator, program) -> list[CaseResult]:
    """すでに `program` を実行した `evaluator` で、テスト関数を順に呼ぶ。"""
    results = []
    for func in find_test_functions(program):
        if func.params:
            results.append(CaseResult(
                func.name, ERROR,
                "テスト関数は引数をとりません。「pop {0}:」のように書きます。".format(func.name),
                func.line,
            ))
            continue
        call_env = Environment(parent=evaluator.global_env)
        call_env.set_current(None)
        try:
            await evaluator.eval(FunctionCallNode(func.line, func.column, func.name), call_env)
        except BaseException as exc:  # Return / Break の使いまちがいも、テストの失敗として報告する
            if isinstance(exc, (KeyboardInterrupt, SystemExit)):
                raise
            status, message, line = _describe_error(exc)
            results.append(CaseResult(func.name, status, message, line))
        else:
            results.append(CaseResult(func.name, PASSED))
    return results


async def run_test_source(source: str, path: str = "<source>", args: list[str] | None = None) -> FileResult:
    result = FileResult(path)
    try:
        program = Parser(Lexer(source).tokenize()).parse()
    except (LexerError, ParseError) as exc:
        _, result.error, result.error_line = _describe_error(exc)
        return result

    evaluator = Evaluator()
    evaluator.script_args = list(args or [])
    evaluator.source_path = path  # ファイルからの相対パス（import など）に使えるように
    try:
        await evaluator.eval(program, evaluator.global_env)
    except BaseException as exc:
        if isinstance(exc, (KeyboardInterrupt, SystemExit)):
            raise
        _, result.error, result.error_line = _describe_error(exc)
        return result

    result.cases = await run_defined_tests(evaluator, program)
    return result


def collect_test_files(targets: list[Path]) -> list[Path]:
    """フォルダは、中の `*_test.pop` を探す。ファイルは、名前に関係なくそのまま使う。"""
    files: list[Path] = []
    for target in targets or [Path(".")]:
        if target.is_dir():
            for path in sorted(target.rglob("*")):
                if path.is_file() and path.name.endswith(TEST_FILE_SUFFIXES):
                    if not any(part.startswith(".") for part in path.relative_to(target).parts):
                        files.append(path)
        else:
            files.append(target)
    return files


def _indent(text: str, prefix: str) -> str:
    return "\n".join(prefix + line for line in text.splitlines())


def format_case(case: CaseResult) -> str:
    where = f"（{case.line} 行目）" if case.line else ""
    if case.status == PASSED:
        return f"  ✓ {case.name}"
    mark = "✗" if case.status == FAILED else "!"
    return f"  {mark} {case.name}{where}\n{_indent(case.message, '      ')}"


def format_file_result(result: FileResult) -> str:
    lines = [result.path]
    if result.error is not None:
        where = f"（{result.error_line} 行目）" if result.error_line else ""
        lines.append(f"  ! ファイルを実行できませんでした{where}")
        lines.append(_indent(result.error, "      "))
        return "\n".join(lines)
    if not result.cases:
        lines.append("  テストが見つかりません（「pop TestAdd:」のように、名前が Test で始まる関数を書きます）")
    lines.extend(format_case(case) for case in result.cases)
    return "\n".join(lines)


def format_summary(results: list[FileResult]) -> str:
    total = sum(len(result.cases) for result in results)
    passed = sum(result.count(PASSED) for result in results)
    failed = sum(result.count(FAILED) for result in results)
    errors = sum(result.count(ERROR) for result in results)
    broken = sum(1 for result in results if result.error is not None)
    parts = [f"{total} 件中 {passed} 件成功"]
    if failed:
        parts.append(f"{failed} 件失敗")
    if errors:
        parts.append(f"{errors} 件エラー")
    if broken:
        parts.append(f"実行できなかったファイル {broken} 個")
    verdict = "すべて成功しました 🎉" if total and passed == total and not broken else "直すところがあります"
    return f"結果: {'、'.join(parts)}。{verdict}"


async def run_test_paths(targets: list[Path], out=None) -> int:
    """`popcorn test` の本体。終了コード（すべて成功なら 0）を返す。"""
    out = out or sys.stdout
    files = collect_test_files(targets)
    if not files:
        print("テストファイルが見つかりません。名前が _test.pop で終わるファイルを作るか、ファイルを指定してください。", file=out)
        return 1

    results = []
    for index, path in enumerate(files):
        try:
            source = path.read_text(encoding="utf-8")
        except OSError as exc:
            result = FileResult(str(path), error=f"IOError: {exc}")
        else:
            result = await run_test_source(source, str(path))
        results.append(result)
        if index:
            print(file=out)
        print(format_file_result(result), file=out)

    print(file=out)
    print(format_summary(results), file=out)
    total = sum(len(result.cases) for result in results)
    return 0 if total and all(result.ok for result in results) else 1



async def run_tests_after_program(evaluator: Evaluator, source: str) -> dict | None:
    """Playground 用。実行が終わったあと、テスト関数があれば実行して、報告を表示する。

    テスト関数がなければ None。あれば {"passed": …, "total": …, "error": …} を返す
    （すべて成功なら error は None）。
    """
    program = Parser(Lexer(source).tokenize()).parse()
    if not find_test_functions(program):
        return None
    result = FileResult("テスト")
    result.cases = await run_defined_tests(evaluator, program)
    print()
    print(format_file_result(result))
    print(format_summary([result]))
    total = len(result.cases)
    passed = result.count(PASSED)
    error = None
    if passed != total:
        error = f"AssertionError: テストが {total - passed} 件、成功しませんでした（{total} 件中 {passed} 件成功）"
    return {"passed": passed, "total": total, "error": error}
