from dataclasses import dataclass
from typing import Any, List

from .language_meta import KEYWORDS


@dataclass
class Token:
    type: str
    value: Any
    line: int
    column: int


class LexerError(Exception):
    pass


_ESCAPE_MAP = {
    "n": "\n",
    "t": "\t",
    "r": "\r",
    "\\": "\\",
    '"': '"',
    "'": "'",
}


class Lexer:
    """Tokenizer for PopCorn 1.

    Only language keywords are reserved. Pipeline process names remain
    ordinary, case-sensitive identifiers (so `Map` and `map` may coexist).
    """

    KEYWORDS = set(KEYWORDS)

    def __init__(self, code: str, *, line_offset: int = 1, col_offset: int = 1):
        self.code = code
        self.line_offset = line_offset
        self.col_offset = col_offset
        self.tokens: List[Token] = []

    def tokenize(self) -> List[Token]:
        code = self.code
        n = len(code)
        i = 0
        line = self.line_offset
        col = self.col_offset

        def advance_char() -> str:
            nonlocal i, line, col
            ch = code[i]
            i += 1
            if ch == "\n":
                line += 1
                col = 1
            else:
                col += 1
            return ch

        def scan_nested_string(quote: str, start_line: int, start_col: int) -> None:
            advance_char()  # opening quote
            while i < n:
                c = code[i]
                if c == "\\":
                    advance_char()
                    if i >= n:
                        raise LexerError(
                            f"Unclosed string literal at line {start_line}, column {start_col}"
                        )
                    advance_char()
                elif c == quote:
                    advance_char()
                    return
                else:
                    advance_char()
            raise LexerError(
                f"Unclosed string literal at line {start_line}, column {start_col}"
            )

        def scan_string() -> Token:
            start_line, start_col = line, col
            quote = advance_char()
            parts: List[Any] = []
            buf: List[str] = []
            has_interp = False

            while i < n:
                ch = code[i]
                if ch == quote:
                    advance_char()
                    if has_interp:
                        if buf:
                            parts.append(("text", "".join(buf)))
                        return Token("INTERP_STRING", parts, start_line, start_col)
                    return Token("STRING", "".join(buf), start_line, start_col)

                if ch == "\\":
                    esc_line, esc_col = line, col
                    advance_char()
                    if i >= n:
                        raise LexerError(
                            f"Unclosed string literal at line {start_line}, column {start_col}"
                        )
                    esc = advance_char()
                    if esc not in _ESCAPE_MAP:
                        raise LexerError(
                            f"Unknown escape sequence '\\{esc}' at line {esc_line}, column {esc_col}"
                        )
                    buf.append(_ESCAPE_MAP[esc])
                    continue

                if ch == "{":
                    if i + 1 < n and code[i + 1] == "{":
                        advance_char()
                        advance_char()
                        buf.append("{")
                        continue
                    # Start interpolation expression
                    if buf:
                        parts.append(("text", "".join(buf)))
                        buf = []
                    has_interp = True
                    open_line, open_col = line, col
                    advance_char()  # consume '{'
                    expr_start = i
                    expr_line, expr_col = line, col
                    depth = 1
                    while i < n and depth > 0:
                        c = code[i]
                        if c == "{":
                            depth += 1
                            advance_char()
                        elif c == "}":
                            depth -= 1
                            if depth == 0:
                                break
                            advance_char()
                        elif c in ('"', "'"):
                            scan_nested_string(c, line, col)
                        elif c == "/" and i + 1 < n and code[i + 1] == "/":
                            while i < n and code[i] != "\n":
                                advance_char()
                        else:
                            advance_char()
                    if depth != 0:
                        raise LexerError(
                            f"Unclosed interpolation at line {open_line}, column {open_col}"
                        )
                    expr_src = code[expr_start:i]
                    advance_char()  # consume '}'
                    parts.append(("expr", expr_src, expr_line, expr_col))
                    continue

                if ch == "}":
                    if i + 1 < n and code[i + 1] == "}":
                        advance_char()
                        advance_char()
                        buf.append("}")
                        continue
                    raise LexerError(
                        f"Unescaped '}}' at line {line}, column {col}; use '}}}}' for a literal brace"
                    )

                buf.append(advance_char())

            raise LexerError(
                f"Unclosed string literal at line {start_line}, column {start_col}"
            )

        while i < n:
            ch = code[i]

            # Whitespace
            if ch in (" ", "\t", "\r", "\n"):
                advance_char()
                continue

            # Line comment
            if ch == "/" and i + 1 < n and code[i + 1] == "/":
                while i < n and code[i] != "\n":
                    advance_char()
                continue

            start_line, start_col = line, col

            # String literals
            if ch in ('"', "'"):
                self.tokens.append(scan_string())
                continue

            # Numbers (all numeric values are IEEE 754 Num)
            if ch.isdigit():
                start = i
                while i < n and code[i].isdigit():
                    advance_char()
                if i + 1 < n and code[i] == "." and code[i + 1].isdigit():
                    advance_char()  # '.'
                    while i < n and code[i].isdigit():
                        advance_char()
                raw = code[start:i]
                self.tokens.append(Token("NUMBER", float(raw), start_line, start_col))
                continue

            # Identifiers / Keywords / Verbs
            if ch.isascii() and (ch.isalpha() or ch == "_"):
                start = i
                while i < n and code[i].isascii() and (code[i].isalnum() or code[i] == "_"):
                    advance_char()
                word = code[start:i]
                if word[0].isupper():
                    self.tokens.append(Token("VERB", word, start_line, start_col))
                elif word in self.KEYWORDS:
                    self.tokens.append(Token(word.upper(), word, start_line, start_col))
                else:
                    self.tokens.append(Token("VARIABLE", word, start_line, start_col))
                continue

            # Two-character symbols
            two = code[i : i + 2]
            if two == ">>":
                advance_char()
                advance_char()
                self.tokens.append(Token("STREAM_OP", ">>", start_line, start_col))
                continue
            if two == "::":
                advance_char()
                advance_char()
                self.tokens.append(Token("DOUBLE_COLON", "::", start_line, start_col))
                continue
            if two in ("==", "!=", ">=", "<="):
                advance_char()
                advance_char()
                self.tokens.append(Token("OPERATOR", two, start_line, start_col))
                continue

            # Single-character symbols
            single_map = {
                ".": "DOT",
                ":": "COLON",
                "@": "IMPLICIT_VAR",
                "[": "LBRACKET",
                "]": "RBRACKET",
                "{": "LBRACE",
                "}": "RBRACE",
                "(": "LPAREN",
                ")": "RPAREN",
                ",": "COMMA",
            }
            if ch in single_map:
                advance_char()
                self.tokens.append(Token(single_map[ch], ch, start_line, start_col))
                continue

            if ch in ("+", "-", "*", "/", "%", ">", "<"):
                advance_char()
                self.tokens.append(Token("OPERATOR", ch, start_line, start_col))
                continue

            raise LexerError(
                f"Unexpected character {ch!r} on line {start_line}, column {start_col}"
            )

        return self.tokens
