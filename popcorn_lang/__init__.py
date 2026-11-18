# PopCorn Language Core
"""PopCorn language interpreter."""

from .cli import evaluate, get_ast_json, parse_source
from .version import DISPLAY_VERSION, RELEASE_NAME, VERSION

__all__ = [
    "DISPLAY_VERSION",
    "RELEASE_NAME",
    "VERSION",
    "evaluate",
    "get_ast_json",
    "parse_source",
]
