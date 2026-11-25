"""`Use` が読むファイルの探し方。

CLI はディスクのファイルを、Playground はブラウザの中のファイル（パス -> 中身の辞書）を読む。
どちらも、パスは `Use` を書いたファイルのフォルダーから見た相対パスとして解決する。
"""

from __future__ import annotations

import os
import posixpath
from pathlib import Path


class ModuleLoader:
    def resolve(self, path: str, importer: str | None) -> str:
        """書かれたパスを、ファイルを一意に表す key にする。"""
        raise NotImplementedError

    def read(self, key: str, written: str) -> str:
        raise NotImplementedError

    def display(self, key: str) -> str:
        """エラーに出すときの、ファイルの名前。"""
        return key


def _not_found(written: str, detail: str):
    from .evaluator import PopCornError

    return PopCornError("IOError", f"Use: cannot read '{written}' ({detail})")


class FileModuleLoader(ModuleLoader):
    """ディスク上のファイル。`Use` を書いたファイルのフォルダー（REPL では、いまのフォルダー）から探す。"""

    def resolve(self, path: str, importer: str | None) -> str:
        base = Path(importer).parent if importer else Path.cwd()
        return os.path.normpath(os.path.abspath(base / path))

    def read(self, key: str, written: str) -> str:
        try:
            return Path(key).read_text(encoding="utf-8")
        except FileNotFoundError:
            raise _not_found(written, f"no such file: {key}") from None
        except OSError as exc:
            raise _not_found(written, str(exc)) from None

    def display(self, key: str) -> str:
        try:
            return os.path.relpath(key)
        except ValueError:  # Windows で、ドライブがちがうとき
            return key


class VirtualModuleLoader(ModuleLoader):
    """Playground のファイル（`{"main.pop": "...", "lib/math.pop": "..."}`）。"""

    def __init__(self, files: dict[str, str]):
        self.files = {posixpath.normpath(k.lstrip("/")): v for k, v in files.items()}

    def resolve(self, path: str, importer: str | None) -> str:
        if path.startswith("/"):
            joined = path.lstrip("/")
        else:
            joined = posixpath.join(posixpath.dirname(importer or ""), path)
        return posixpath.normpath(joined)

    def read(self, key: str, written: str) -> str:
        source = self.files.get(key)
        if not isinstance(source, str):
            raise _not_found(written, f"no file '{key}' in the Playground")
        return source
