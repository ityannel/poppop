import re
from dataclasses import dataclass
from typing import List, Optional

from .language_meta import KEYWORDS

@dataclass
class Token:
    type: str
    value: str
    line: int
    column: int

class LexerError(Exception):
    pass

class Lexer:
    # Only language keywords are reserved.  Pipeline process names remain
    # ordinary, case-sensitive names (so `Map` and `map` may coexist).
    KEYWORDS = set(KEYWORDS)

    # Regex patterns for tokens
    TOKEN_SPECIFICATION = [
        ('STREAM_OP',    r'>>'),
        ('POPCORN',       r'\.\.'),
        ('DOT',          r'\.'),
        ('DOUBLE_COLON', r'::'),
        ('COLON',        r':'),
        ('IMPLICIT_VAR', r'@'),
        ('STRING',       r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\''),
        ('NUMBER',       r'\d+(\.\d+)?'),
        ('COMMENT',      r'//.*'),
        ('OPERATOR',     r'==|!=|>=|<=|>|<|\+|-|\*|/|%'),
        ('LBRACKET',     r'\['),
        ('RBRACKET',     r'\]'),
        ('LBRACE',       r'\{'),
        ('RBRACE',       r'\}'),
        ('LPAREN',       r'\('),
        ('RPAREN',       r'\)'),
        ('COMMA',        r','),
        ('VERB',         r'[A-Z][a-zA-Z0-9_]*'), # Capitalized identifier is a verb/function
        ('IDENTIFIER',   r'[a-z_][a-zA-Z0-9_]*'), # Lowercase identifier could be keyword or variable
        ('NEWLINE',      r'\n'),
        ('SKIP',         r'[ \t]+'),
        ('MISMATCH',     r'.'),
    ]

    def __init__(self, code: str):
        self.code = code
        self.tokens: List[Token] = []
        self._compile_regex()

    def _compile_regex(self):
        parts = []
        for name, pattern in self.TOKEN_SPECIFICATION:
            parts.append(f'(?P<{name}>{pattern})')
        self.regex = re.compile('|'.join(parts))

    def tokenize(self) -> List[Token]:
        line_num = 1
        line_start = 0
        for mo in self.regex.finditer(self.code):
            kind = mo.lastgroup
            value = mo.group(kind)
            column = mo.start() - line_start
            
            if kind == 'NUMBER':
                value = float(value) if '.' in value else int(value)
                self.tokens.append(Token('NUMBER', value, line_num, column))
            elif kind == 'STRING':
                # Use ast.literal_eval to correctly parse escape sequences like \n, \t
                import ast
                try:
                    value = ast.literal_eval(value)
                except Exception:
                    value = value[1:-1]
                self.tokens.append(Token('STRING', value, line_num, column))
            elif kind == 'IDENTIFIER':
                # Check if lowercase identifier is a keyword
                if value in self.KEYWORDS:
                    kind = value.upper() # Treat keywords as their own token type
                else:
                    kind = 'VARIABLE'
                self.tokens.append(Token(kind, value, line_num, column))
            elif kind == 'POPCORN':
                self.tokens.append(Token('END', '..', line_num, column))
            elif kind == 'NEWLINE':
                line_start = mo.end()
                line_num += 1
            elif kind in ('SKIP', 'COMMENT'):
                continue
            elif kind == 'MISMATCH':
                raise LexerError(f"Unexpected character {value!r} on line {line_num}")
            else:
                self.tokens.append(Token(kind, value, line_num, column))
                
        return self.tokens
