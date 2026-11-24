"""旧形式の `{ … }` ブロックを、`:` と字下げのブロックへ書きかえる。
旧形式の `Reduce(初期値)` も `Reduce from 初期値` に書きかえる。

    x >> Map as v { v * 2. } >> d.        x >> Map as v:
                                    →         v * 2.
                                          >> d.

書きかえは、トークンの位置だけを使い、コメントや空行は、できるだけそのまま残す。
書きかえたあと、旧形式で読んだ構文木と、新しい形で読んだ構文木が同じかを確かめる。
"""

from __future__ import annotations

import dataclasses
from typing import Any, List

from .lexer import Lexer
from .parser import Parser
from .ast_nodes import BlockNode, ImplicitVariableNode, Pipeline

INDENT = 4


class MigrationError(Exception):
    pass


def _offsets(code: str, tokens) -> List[int]:
    line_starts = [0]
    for index, ch in enumerate(code):
        if ch == "\n":
            line_starts.append(index + 1)
    return [line_starts[tok.line - 1] + tok.column - 1 for tok in tokens]


def _line_indent(text: str) -> int:
    line = text[text.rfind("\n") + 1 :]
    return len(line) - len(line.lstrip(" \t"))


def _legacy_parse(code: str):
    tokens = Lexer(code).tokenize()
    parser = Parser(tokens, legacy_braces=True)
    return tokens, parser, parser.parse()


def _shape(node: Any) -> Any:
    """構文木から、行と列を除いた形（書きかえの前後を比べるため）。"""
    if isinstance(node, BlockNode) and not node.pipelines:
        # 空のブロック {} は、`@` だけの本体と同じ意味
        node = BlockNode(0, 0, [Pipeline(0, 0, [ImplicitVariableNode(0, 0, "@")], [])])
    if dataclasses.is_dataclass(node):
        return (
            type(node).__name__,
            tuple(
                (f.name, _shape(getattr(node, f.name)))
                for f in dataclasses.fields(node)
                if f.name not in ("line", "column")
            ),
        )
    if isinstance(node, (list, tuple)):
        return tuple(_shape(item) for item in node)
    return node


def has_brace_blocks(code: str) -> bool:
    try:
        _, parser, _ = _legacy_parse(code)
    except Exception:
        return False
    return bool(parser.brace_blocks or parser.legacy_reduce_inits)


def migrate_braces(code: str, *, verify: bool = True) -> str:
    """`{ … }` のブロックを `:` と字下げに、`Reduce(初期値)` を `Reduce from 初期値` に書きかえた文字列を返す。
    書きかえるところがなければ、そのまま返す。"""
    tokens, parser, before = _legacy_parse(code)
    if not parser.brace_blocks and not parser.legacy_reduce_inits:
        return code

    offsets = _offsets(code, tokens)
    opens = {open_pos: close_pos for open_pos, close_pos in parser.brace_blocks}
    closes = {close_pos for _, close_pos in parser.brace_blocks}
    # Reduce(初期値) の丸括弧は外す。初期値の式のあとには `as`・`:`・処理名しか来ないので、外しても意味は変わらない
    reduce_opens = {open_pos for open_pos, _ in parser.legacy_reduce_inits}
    reduce_closes = {close_pos for _, close_pos in parser.legacy_reduce_inits}

    out: List[str] = [code[: offsets[0]] if tokens else code]
    stack: List[int] = []  # 開いているブロックの、見出しの行の字下げ
    pending_indent = None  # 閉じた `}` のあと、次のトークンの前に入れる改行の字下げ
    skip_dot = False

    def text() -> str:
        return "".join(out)

    for index, tok in enumerate(tokens):
        start = offsets[index]
        end_of_chunk = offsets[index + 1] if index + 1 < len(tokens) else len(code)
        gap = code[start + 1 : end_of_chunk]

        if index in opens:
            current = text().rstrip(" \t")
            out[:] = [current]
            header = _line_indent(current)
            stack.append(header)
            out.append(":")
            if index + 1 in closes:  # 空のブロック {} は、受け取った値をそのまま返す
                out.append("\n" + " " * (header + INDENT) + "@")
            elif "\n" in gap:
                out.append(gap)
            else:
                out.append("\n" + " " * (header + INDENT))
            pending_indent = None
            continue

        if index in closes:
            header = stack.pop()
            current = text().rstrip(" \t\n")
            out[:] = [current]
            if "\n" in gap:
                out.append(gap)
                pending_indent = None
            else:
                pending_indent = header
            skip_dot = True
            continue

        if index in reduce_opens:
            out[:] = [text().rstrip(" \t"), " from "]
            continue

        if index in reduce_closes:
            out[:] = [text().rstrip(" \t"), gap]
            continue

        if skip_dot and tok.type == "DOT":
            # ブロックで終わる文は `.` がいらない。`}.` の `.` は落とす
            skip_dot = False
            if "\n" in gap:
                out.append(gap)
                pending_indent = None
            continue
        skip_dot = False

        if pending_indent is not None:
            current = text().rstrip(" \t")
            out[:] = [current, "\n" + " " * pending_indent]
            pending_indent = None

        out.append(code[start:end_of_chunk])

    result = text()
    if not result.endswith("\n") and code.endswith("\n"):
        result += "\n"

    if verify:
        after = Parser(Lexer(result).tokenize()).parse()
        if _shape(before) != _shape(after):
            raise MigrationError("migrated code does not mean the same as the original")
    return result
