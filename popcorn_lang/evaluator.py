import functools
import inspect
import json
import math
import os
import sys
from decimal import Decimal
from typing import Any

from .ast_nodes import *
from .environment import Environment
from .modules import FileModuleLoader, ModuleLoader

_SKIPPED = object()

# 関数の呼び出しを、何段まで重ねられるか（再帰の深さの上限）。
# これを超えると、Python の RecursionError ではなく、PopCorn の RuntimeError にする。
# Python 3.11 までは、Python の関数呼び出しが C のスタックも使うので、深くしすぎると
# プロセスごと落ちる（Segmentation fault）。そのため、3.12 より前では浅くしておく。
MAX_CALL_DEPTH = 10000 if sys.version_info >= (3, 12) else 300
# PopCorn の 1 段の呼び出しは、Python の関数を何十段か使う。上限に届く前に Python が止まらないよう、余裕をもたせる。
_PYTHON_FRAMES_PER_CALL = 40


def _ensure_recursion_limit() -> None:
    wanted = MAX_CALL_DEPTH * _PYTHON_FRAMES_PER_CALL
    if sys.getrecursionlimit() < wanted:
        try:
            sys.setrecursionlimit(wanted)
        except (ValueError, RecursionError):
            pass


def _too_deep_error() -> "PopCornError":
    return PopCornError(
        "RuntimeError",
        f"Recursion is too deep (more than {MAX_CALL_DEPTH} nested function calls); "
        "check that the function has a case that stops calling itself",
    )


class EvaluatorError(Exception):
    pass


class PopCornError(EvaluatorError):
    def __init__(self, err_type: str, message: str, line: int | None = None, column: int | None = None):
        self.err_type = err_type
        self.message = message
        self.line = line
        self.column = column
        super().__init__(f"{err_type}: {message}")


class ProcessArgument:
    """処理引数として渡された、まだ計算していない式と、それを書いた場所の環境。"""

    __slots__ = ("expr", "env")

    def __init__(self, expr, env):
        self.expr = expr
        self.env = env


class ReturnException(BaseException):
    def __init__(self, value: Any):
        self.value = value


class BreakException(BaseException):
    def __init__(self, value: Any):
        self.value = value


def _is_number(value: Any) -> bool:
    return type(value) in (int, float)


def _check_finite(value: float) -> float:
    if math.isnan(value) or math.isinf(value):
        raise PopCornError("RuntimeError", "Numeric result is NaN or Infinity")
    return 0.0 if value == 0.0 else value


def _to_num(value: Any) -> float:
    return _check_finite(float(value))


def _as_whole_int(value: Any, err_msg: str = "Expected a whole number (Num)") -> int:
    if not _is_number(value):
        raise PopCornError("TypeError", err_msg)
    num = _to_num(value)
    if not num.is_integer():
        raise PopCornError("TypeError", err_msg)
    return int(num)


def popcorn_type_name(value: Any) -> str:
    if value is None:
        return "Null"
    if isinstance(value, bool):
        return "Bool"
    if _is_number(value):
        return "Num"
    if isinstance(value, str):
        return "Str"
    if isinstance(value, list):
        return "List"
    if isinstance(value, dict):
        return "Dict"
    if isinstance(value, tuple):
        return "Tuple"
    raise PopCornError("TypeError", f"Unsupported runtime value: {type(value).__name__}")


def format_popcorn_str(value: Any, *, nested: bool = False) -> str:
    """Format a PopCorn value according to Section 3 Str conversion rules."""
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if _is_number(value):
        return format_popcorn_num(_to_num(value))
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False) if nested else value
    if isinstance(value, list):
        inner = ", ".join(format_popcorn_str(item, nested=True) for item in value)
        return f"[{inner}]"
    if isinstance(value, dict):
        inner = ", ".join(
            f"{json.dumps(k, ensure_ascii=False)}: {format_popcorn_str(v, nested=True)}"
            for k, v in value.items()
        )
        return "{" + inner + "}"
    if isinstance(value, tuple):
        inner = ", ".join(format_popcorn_str(item, nested=True) for item in value)
        return f"({inner})"
    raise PopCornError("TypeError", f"Cannot format unsupported value: {type(value).__name__}")


def format_popcorn_num(num: float) -> str:
    """Num の Str 変換（3章）。

    いちばん短く元の値に戻せる 10 進表記を使う。`1e-6 <= |x| < 1e21` は、指数を使わずに書く
    （`0.000001`、`123456789012345680`）。それ以外は `1e-7`、`1.5e+21` のように指数で書く。
    """
    if num == 0.0:
        return "0"
    if num.is_integer() and abs(num) < 1e21:
        return str(int(num))
    shortest = repr(num)  # 元の値に戻せる、いちばん短い表記
    magnitude = abs(num)
    if 1e-6 <= magnitude < 1e21:
        if "e" in shortest or "E" in shortest:
            return format(Decimal(shortest), "f")
        return shortest
    mantissa, _, exponent = format(Decimal(shortest), "E").partition("E")
    if "." in mantissa:
        mantissa = mantissa.rstrip("0").rstrip(".")
    exp_num = int(exponent)
    return f"{mantissa}e{'+' if exp_num >= 0 else '-'}{abs(exp_num)}"


def _values_equal(left: Any, right: Any) -> bool:
    if _is_number(left) and _is_number(right):
        return float(left) == float(right)
    if type(left) is not type(right):
        return False
    if isinstance(left, (list, tuple)):
        return len(left) == len(right) and all(
            _values_equal(a, b) for a, b in zip(left, right)
        )
    if isinstance(left, dict):
        return left.keys() == right.keys() and all(
            _values_equal(left[key], right[key]) for key in left
        )
    return left == right


def _contains_value(target: Any, item: Any) -> bool:
    if isinstance(target, list):
        return any(_values_equal(element, item) for element in target)
    if isinstance(target, dict):
        if not isinstance(item, str):
            raise PopCornError("TypeError", "Dict key for Contains/in must be Str")
        return item in target
    if isinstance(target, str):
        if not isinstance(item, str):
            raise PopCornError("TypeError", "Substring for Contains/in must be Str")
        return item in target
    raise PopCornError("TypeError", "Contains/in requires List, Dict, or Str")


def _bind_aliases(env: Environment, alias_names: list[str], value: Any) -> None:
    if not alias_names:
        return
    if len(alias_names) == 1:
        env.set_var(alias_names[0], value)
        return
    if not isinstance(value, (tuple, list)):
        raise PopCornError("TypeError", "Destructuring alias requires a Tuple or List")
    if len(value) != len(alias_names):
        raise PopCornError(
            "RuntimeError",
            f"Destructuring alias expects {len(alias_names)} values, got {len(value)}",
        )
    for name, item in zip(alias_names, value):
        env.set_var(name, item)


def _sort_key_kind(key: Any) -> str:
    if _is_number(key):
        return "Num"
    if isinstance(key, str):
        return "Str"
    if isinstance(key, (list, tuple)):
        return "List"
    raise PopCornError(
        "TypeError",
        f"Sort keys must be Num, Str, or a List of them; got {popcorn_type_name(key)}",
    )


def _compare_sort_keys(left: Any, right: Any) -> int:
    """Sort のキーを比べる。List どうしは、先頭から順に比べる（辞書式）。"""
    left_kind, right_kind = _sort_key_kind(left), _sort_key_kind(right)
    if left_kind != right_kind:
        raise PopCornError(
            "TypeError",
            f"Sort keys cannot be compared: {popcorn_type_name(left)} and {popcorn_type_name(right)}",
        )
    if left_kind == "List":
        for a, b in zip(left, right):
            result = _compare_sort_keys(a, b)
            if result:
                return result
        return (len(left) > len(right)) - (len(left) < len(right))
    if left_kind == "Num":
        left, right = float(left), float(right)
    return (left > right) - (left < right)


def _sorted_by_keys(decorated: list, descending: bool) -> list:
    # 安定ソート。降順も、同じキーの要素は、元の順のまま
    def compare(a, b):
        result = _compare_sort_keys(a[0], b[0])
        return -result if descending else result

    for key, _ in decorated:
        _sort_key_kind(key)
    return sorted(decorated, key=functools.cmp_to_key(compare))


class Evaluator:
    def __init__(self):
        self.global_env = Environment()
        self.trace_path = os.environ.get("POPCORN_TRACE_FILE")
        # `Use` でほかのファイルを読む。current_module は、いま評価しているファイル（なければ None）
        self.module_loader: ModuleLoader = FileModuleLoader()
        self.current_module: str | None = None
        self._module_exports: dict[str, dict[str, Any]] = {}
        self._modules_loading: list[str] = []
        self.call_depth = 0
        _ensure_recursion_limit()

    def trace_pipeline_value(self, node, value, input_value=None, progress=None):
        """Emit optional, compact execution data for the VS Code flow view."""
        if not self.trace_path:
            return
        try:
            def display(current):
                preview = format_popcorn_str(current, nested=True)
                if len(preview) > 180:
                    preview = preview[:177] + "..."
                return f"{preview} ({popcorn_type_name(current)})"

            event = {
                "line": getattr(node, "line", 0),
                "stage": getattr(
                    node, "name", getattr(node, "stream_type", type(node).__name__)
                ),
                "after": display(value),
            }
            if input_value is not None:
                event["before"] = display(input_value)
            if progress:
                event["progress"] = progress
            with open(self.trace_path, "a", encoding="utf-8") as trace_file:
                trace_file.write(json.dumps(event, ensure_ascii=False) + "\n")
        except Exception:
            pass

    async def eval(self, node: ASTNode, env: Environment) -> Any:
        method_name = f"eval_{type(node).__name__}"
        visitor = getattr(self, method_name, self.generic_eval)
        return await visitor(node, env)

    async def generic_eval(self, node: ASTNode, env: Environment):
        raise PopCornError("RuntimeError", f"No eval method for {type(node).__name__}")

    async def eval_Program(self, node: Program, env: Environment):
        # `Use` は、どこに書いてあっても、プログラムを動かす前に読む（関数の定義と同じく、順番に関係なく呼べる）
        await self._import_modules(node, env)

        for stmt in node.statements:
            if isinstance(stmt, FunctionDefNode):
                env.set_function(stmt.name, (stmt, None, env))

        result = None
        for stmt in node.statements:
            if isinstance(stmt, UseNode):
                continue
            if isinstance(stmt, FunctionDefNode):
                env.set_function(stmt.name, (stmt, dict(env.variables), env))
            else:
                env.set_current(None)
                stmt_res = await self.eval(stmt, env)
                if stmt_res is not _SKIPPED:
                    result = stmt_res

        env.set_current(result)
        return result

    async def _import_modules(self, node: Program, env: Environment) -> None:
        uses = [stmt for stmt in node.statements if isinstance(stmt, UseNode)]
        if not uses:
            return
        local_names = {
            stmt.name for stmt in node.statements if isinstance(stmt, FunctionDefNode)
        }
        origins: dict[str, tuple[str, str]] = {}  # 名前 -> (読んだファイルの key, 書いたとおりのパス)
        for use in uses:
            key = self.module_loader.resolve(use.path, self.current_module)
            exports = await self._load_module(key, use)
            names = use.names if use.names is not None else list(exports)
            for name in names:
                if name not in exports:
                    raise PopCornError(
                        "NameError",
                        f"'{use.path}' has no function '{name}'",
                        use.line,
                        use.column,
                    )
                if name in local_names:
                    raise PopCornError(
                        "NameError",
                        f"Function '{name}' is defined in this file and also comes from "
                        f"'{use.path}'; rename one, or choose names with Use(...)",
                        use.line,
                        use.column,
                    )
                previous = origins.get(name)
                if previous is not None and previous[0] != key:
                    raise PopCornError(
                        "NameError",
                        f"Function '{name}' comes from both '{previous[1]}' and '{use.path}'; "
                        f"choose names with Use(...)",
                        use.line,
                        use.column,
                    )
                origins[name] = (key, use.path)
                env.set_function(name, exports[name])

    async def _load_module(self, key: str, use: UseNode) -> dict[str, Any]:
        """ファイルを 1 回だけ評価して、そのファイルで `pop` した関数を返す。"""
        if key in self._module_exports:
            return self._module_exports[key]
        if key in self._modules_loading:
            chain = self._modules_loading[self._modules_loading.index(key):] + [key]
            raise PopCornError(
                "RuntimeError",
                "Files use each other in a circle: "
                + " -> ".join(self.module_loader.display(k) for k in chain),
                use.line,
                use.column,
            )
        source = self.module_loader.read(key, use.path)

        from .lexer import Lexer, LexerError
        from .parser import ParseError, Parser

        shown = self.module_loader.display(key)
        try:
            program = Parser(Lexer(source).tokenize()).parse()
        except LexerError as exc:
            raise LexerError(f"{shown}: {exc}") from None
        except ParseError as exc:
            raise ParseError(f"{shown}: {exc}") from None

        module_env = Environment()
        previous_module = self.current_module
        self._modules_loading.append(key)
        self.current_module = key
        try:
            await self.eval_Program(program, module_env)
        except PopCornError as exc:
            if not exc.message.startswith(f"{shown}: "):
                exc.message = f"{shown}: {exc.message}"
                exc.args = (f"{exc.err_type}: {exc.message}",)
            raise
        finally:
            self.current_module = previous_module
            self._modules_loading.pop()

        defined = [
            stmt.name for stmt in program.statements if isinstance(stmt, FunctionDefNode)
        ]
        exports = {name: module_env.functions[name] for name in defined}
        self._module_exports[key] = exports
        return exports

    async def eval_ConditionalStatementNode(
        self, node: ConditionalStatementNode, env: Environment
    ):
        cond_val = await self.eval(node.condition, env)
        if not isinstance(cond_val, bool):
            raise PopCornError("TypeError", "when condition must return Bool")
        if not cond_val:
            return _SKIPPED
        return await self.eval(node.pipeline, env)

    async def eval_GroupedPipelineNode(self, node: GroupedPipelineNode, env: Environment):
        prev_item = env.current_item
        prev_has = env.has_current_item
        try:
            return await self.eval_Pipeline(node.pipeline, env)
        finally:
            env.current_item = prev_item
            env.has_current_item = prev_has

    async def eval_Pipeline(self, node: Pipeline, env: Environment):
        try:
            return await self._eval_pipeline_stages(node, env)
        except PopCornError as exc:
            # 行番号がまだなければ、いちばん内側の文の行を覚えておく（テストの報告などで使う）
            if exc.line is None and getattr(node, "line", None):
                exc.line = node.line
                exc.column = node.column
            raise

    async def _eval_pipeline_stages(self, node: Pipeline, env: Environment):
        return await self._eval_stages_until(node, env, len(node.nodes))

    async def _eval_stages_until(self, node: Pipeline, env: Environment, end: int):
        """`node.nodes[0:end]` を順に計算する。

        `>!>` は、それより左の段階ぜんぶを守る。いちばん右の `>!>` から見て、
        左側を（再帰で）計算し、エラーになったら右の式で差し替える。
        """
        ops = node.ops
        fallback_at = None
        for j in range(end - 2, -1, -1):
            if j < len(ops) and ops[j] == ">!>":
                fallback_at = j
                break

        if fallback_at is None:
            val = await self.eval(node.nodes[0], env)
            env.set_current(val)
            self.trace_pipeline_value(node.nodes[0], val)
            start = 1
        else:
            try:
                val = await self._eval_stages_until(node, env, fallback_at + 1)
            except PopCornError as exc:
                err_dict = {"type": exc.err_type, "message": exc.message}
            except EvaluatorError as exc:
                err_dict = {"type": "RuntimeError", "message": str(exc)}
            except OSError as exc:
                err_dict = {"type": "IOError", "message": str(exc)}
            else:
                err_dict = None
            if err_dict is not None:
                fallback_node = node.nodes[fallback_at + 1]
                fallback_env = Environment(parent=env)
                fallback_env.set_current(err_dict)
                val = await self.eval(fallback_node, fallback_env)
                env.set_current(val)
                self.trace_pipeline_value(fallback_node, val, err_dict)
            start = fallback_at + 2

        for i in range(start, end):
            n = node.nodes[i]
            op = ops[i - 1] if i - 1 < len(ops) else ">>"
            if op == ">?>":
                self._show_tap(node, i, val)
            elif op != ">>":
                raise PopCornError("RuntimeError", f"Unknown pipeline operator {op}")

            input_value = val
            if isinstance(n, StreamBlockNode):
                val = await self._eval_stream_block(n, val, env)
            else:
                val = await self.eval(n, env)

            env.set_current(val)
            self.trace_pipeline_value(n, val, input_value)

        return val

    def _show_tap(self, node: Pipeline, index: int, value: Any) -> None:
        """`>?>`: いま流れている値を、場所といっしょに表示する（値は変えない）。"""
        positions = getattr(node, "op_positions", None) or []
        line = positions[index - 1][0] if index - 1 < len(positions) else node.line
        label = _stage_label(node.nodes[index - 1])
        after = f" after {label}" if label else ""
        print(f"[>?> line {line}{after}] ({popcorn_type_name(value)}) {format_popcorn_str(value)}")

    async def _eval_stream_block(self, n: StreamBlockNode, val: Any, env: Environment) -> Any:
        if n.stream_type == "Map":
            if not isinstance(val, list):
                raise PopCornError("TypeError", "Map stream requires a list")
            mapped = []
            for item_index, item in enumerate(val, start=1):
                self.trace_pipeline_value(n, item, progress=f"{item_index} / {len(val)}")
                item_env = Environment(parent=env)
                item_env.set_current(item)
                _bind_aliases(item_env, n.var_names, item)
                mapped.append(await self.eval(n.block, item_env))
            return mapped

        if n.stream_type in ("Any", "All"):
            kind = n.stream_type
            if not isinstance(val, list):
                raise PopCornError("TypeError", f"{kind} stream requires a list")
            for item in val:
                item_env = Environment(parent=env)
                item_env.set_current(item)
                _bind_aliases(item_env, n.var_names, item)
                res = await self.eval(n.block, item_env)
                if not isinstance(res, bool):
                    raise PopCornError("TypeError", f"{kind} block must return Bool")
                # 答えが決まったところで止める（Any は true が 1 つ、All は false が 1 つ見つかれば）
                if kind == "Any" and res:
                    return True
                if kind == "All" and not res:
                    return False
            return kind == "All"

        if n.stream_type in ("Filter", "Count"):
            kind = n.stream_type
            if not isinstance(val, list):
                raise PopCornError("TypeError", f"{kind} stream requires a list")
            filtered = []
            for item in val:
                item_env = Environment(parent=env)
                item_env.set_current(item)
                _bind_aliases(item_env, n.var_names, item)
                res = await self.eval(n.block, item_env)
                if not isinstance(res, bool):
                    raise PopCornError("TypeError", f"{kind} block must return Bool")
                if res:
                    filtered.append(item)
            # Count は、条件に合った要素の数（Filter >> Length と同じ）
            return float(len(filtered)) if kind == "Count" else filtered

        if n.stream_type == "Reduce":
            if not isinstance(val, list):
                raise PopCornError("TypeError", "Reduce stream requires a list")
            if n.init_expr is not None:
                init_env = Environment(parent=env)
                init_env.set_current(val)
                acc = await self.eval(n.init_expr, init_env)
                items = val
            else:
                if len(val) == 0:
                    raise PopCornError("RuntimeError", "Reduce stream requires non-empty list")
                acc = val[0]
                items = val[1:]
            for item in items:
                item_env = Environment(parent=env)
                pair = (acc, item)
                item_env.set_current(pair)
                _bind_aliases(item_env, n.var_names, pair)
                acc = await self.eval(n.block, item_env)
            return acc

        if n.stream_type in ("Sort", "SortDesc"):
            if not isinstance(val, list):
                raise PopCornError("TypeError", f"{n.stream_type} stream requires a list")
            descending = n.stream_type == "SortDesc"
            decorated = []
            keys = []
            for item in val:
                item_env = Environment(parent=env)
                item_env.set_current(item)
                _bind_aliases(item_env, n.var_names, item)
                key = await self.eval(n.block, item_env)
                keys.append(key)
                decorated.append((key, item))
            return [item for _, item in _sorted_by_keys(decorated, descending)]

        if n.stream_type == "Group":
            if not isinstance(val, list):
                raise PopCornError("TypeError", "Group stream requires a list")
            grouped = {}
            for item in val:
                item_env = Environment(parent=env)
                item_env.set_current(item)
                _bind_aliases(item_env, n.var_names, item)
                key = await self.eval(n.block, item_env)
                if not isinstance(key, str):
                    raise PopCornError("TypeError", "Group block must return Str")
                if key not in grouped:
                    grouped[key] = []
                grouped[key].append(item)
            return grouped

        if n.stream_type == "Fork":
            if n.labeled_entries is not None:
                labeled_results = {}
                for entry in n.labeled_entries:
                    fork_env = Environment(parent=env)
                    fork_env.set_current(val)
                    _bind_aliases(fork_env, n.var_names, val)
                    res = await self.eval(entry.statement, fork_env)
                    labeled_results[entry.label] = None if res is _SKIPPED else res
                return labeled_results
            results = []
            for pipeline in n.block.pipelines:
                fork_env = Environment(parent=env)
                fork_env.set_current(val)
                _bind_aliases(fork_env, n.var_names, val)
                res = await self.eval(pipeline, fork_env)
                results.append(None if res is _SKIPPED else res)
            return results

        if n.stream_type == "Update":
            if not isinstance(val, dict):
                raise PopCornError("TypeError", "Update stream requires a dictionary")
            if len(n.var_names) > 1:
                raise PopCornError("TypeError", "Update alias cannot destructure a Dict")
            new_dict = dict(val)
            var_name = n.var_names[0] if n.var_names else ""
            for statement in n.block.pipelines:
                if not isinstance(statement, Pipeline) or len(statement.nodes) < 2:
                    raise PopCornError(
                        "RuntimeError", "Update statement must be 'value >> @::field'"
                    )

                target_node = statement.nodes[-1]
                if isinstance(target_node, BindNode):
                    target_node = target_node.target
                path = _update_target_path(target_node, var_name)
                if path is None:
                    raise PopCornError(
                        "RuntimeError",
                        "Update target must be @::field or the block value name followed by ::field "
                        "(nested fields like @::a::b are allowed)",
                    )

                value_pipeline = Pipeline(
                    statement.line,
                    statement.column,
                    statement.nodes[:-1],
                    statement.ops[:-1],
                )
                update_env = Environment(parent=env)
                update_env.set_current(new_dict)
                if var_name:
                    update_env.set_var(var_name, new_dict)
                res = await self.eval(value_pipeline, update_env)
                new_dict = _set_dict_path(new_dict, path, res)
            return new_dict

        raise PopCornError("RuntimeError", f"Unknown stream block type {n.stream_type}")

    async def eval_BlockNode(self, node: BlockNode, env: Environment):
        block_input = env.get_current()
        result = block_input
        for stmt in node.pipelines:
            env.set_current(block_input)
            stmt_res = await self.eval(stmt, env)
            if stmt_res is not _SKIPPED:
                result = stmt_res
        env.set_current(result)
        return result

    async def eval_DictNode(self, node: DictNode, env: Environment):
        result = {}
        saved_current = env.get_current()
        for k, v in zip(node.keys, node.values):
            env.set_current(saved_current)
            result[k] = await self.eval(v, env)
        return result

    async def eval_LiteralNode(self, node: LiteralNode, env: Environment):
        if isinstance(node.value, list):
            saved_current = env.get_current()
            items = []
            for item in node.value:
                env.set_current(saved_current)
                items.append(await self.eval(item, env) if isinstance(item, ASTNode) else item)
            return items
        if _is_number(node.value):
            return _to_num(node.value)
        return node.value

    async def eval_UnaryOpNode(self, node: UnaryOpNode, env: Environment):
        if node.operator == "-":
            right = await self.eval(node.right, env)
            if _is_number(right):
                return _to_num(-float(right))
            raise PopCornError(
                "TypeError", f"Cannot negate non-number: {popcorn_type_name(right)}"
            )
        if node.operator == "not":
            right = await self.eval(node.right, env)
            if not isinstance(right, bool):
                raise PopCornError("TypeError", "not requires Bool")
            return not right
        raise PopCornError("RuntimeError", f"Unknown unary operator: {node.operator}")

    async def eval_VariableNode(self, node: VariableNode, env: Environment):
        try:
            return env.get_var(node.name)
        except NameError:
            raise PopCornError("NameError", f"Variable '{node.name}' is not defined.")

    async def eval_ImplicitVariableNode(self, node: ImplicitVariableNode, env: Environment):
        return env.get_current()

    async def eval_ExpressionNode(self, node: ExpressionNode, env: Environment):
        left = await self.eval(node.left, env)
        op = node.operator
        if op == "and":
            if not isinstance(left, bool):
                raise PopCornError("TypeError", "and requires Bool operands")
            if not left:
                return False
            right = await self.eval(node.right, env)
            if not isinstance(right, bool):
                raise PopCornError("TypeError", "and requires Bool operands")
            return right
        if op == "or":
            if not isinstance(left, bool):
                raise PopCornError("TypeError", "or requires Bool operands")
            if left:
                return True
            right = await self.eval(node.right, env)
            if not isinstance(right, bool):
                raise PopCornError("TypeError", "or requires Bool operands")
            return right

        right = await self.eval(node.right, env)
        if op == "+":
            if _is_number(left) and _is_number(right):
                return _to_num(float(left) + float(right))
            if isinstance(left, str) and isinstance(right, str):
                return left + right
            if isinstance(left, list) and isinstance(right, list):
                return left + right
            raise PopCornError(
                "TypeError", "+ requires Num values, two Str values, or two List values"
            )
        if op == "-":
            if _is_number(left) and _is_number(right):
                return _to_num(float(left) - float(right))
            raise PopCornError("TypeError", "- requires Num values")
        if op == "*":
            if _is_number(left) and _is_number(right):
                return _to_num(float(left) * float(right))
            raise PopCornError("TypeError", "* requires Num values")
        if op == "/":
            if not (_is_number(left) and _is_number(right)):
                raise PopCornError("TypeError", "/ requires Num values")
            if float(right) == 0.0:
                raise PopCornError("RuntimeError", "Division by zero")
            return _to_num(float(left) / float(right))
        if op == "%":
            if not (_is_number(left) and _is_number(right)):
                raise PopCornError("TypeError", "% requires Num values")
            if float(right) == 0.0:
                raise PopCornError("RuntimeError", "Modulo by zero")
            # 符号は、割られる数に合わせる（C・JS 方式）。`Div` が 0 の方向へ切り捨てるので、
            # a == Div(a, b) * b + a % b が、いつでも成り立つ。`+ 0.0` は、-0.0 を 0.0 にするため。
            return _to_num(math.fmod(float(left), float(right)) + 0.0)
        if op in (">", "<", ">=", "<="):
            comparable = (_is_number(left) and _is_number(right)) or (
                isinstance(left, str) and isinstance(right, str)
            )
            if not comparable:
                raise PopCornError("TypeError", f"{op} requires two Num or two Str values")
            if op == ">":
                return left > right
            if op == "<":
                return left < right
            if op == ">=":
                return left >= right
            return left <= right
        if op == "==":
            return _values_equal(left, right)
        if op == "!=":
            return not _values_equal(left, right)
        if op == "in":
            return _contains_value(right, left)
        if op == "not in":
            return not _contains_value(right, left)
        raise PopCornError("RuntimeError", f"Unknown operator {op}")

    async def eval_FunctionCallNode(self, node: FunctionCallNode, env: Environment):
        name = node.name
        left_val = env.get_current()

        function_entry = env.get_function(name)

        # 0. 処理引数として受け取った式（関数の中で `x >> Keep` のように呼ぶ）
        if isinstance(function_entry, ProcessArgument):
            if node.args:
                raise PopCornError(
                    "RuntimeError", f"Process parameter '{name}' does not take extra arguments"
                )
            arg_env = Environment(parent=function_entry.env)
            arg_env.set_current(left_val)
            return await self.eval(function_entry.expr, arg_env)

        process_positions = set()
        if function_entry:
            process_positions = {
                index for index, param in enumerate(function_entry[0].params)
                if param.type_name == "process"
            }
        else:
            from .pop_builtins import BUILTIN_PROCESS_ARGUMENTS

            # 標準処理のうち、補助引数を処理として受け取るもの（ExpectError など）
            process_positions = BUILTIN_PROCESS_ARGUMENTS.get(name, set())

        if node.args:
            extra_vals = []
            for index, arg_node in enumerate(node.args, start=1):
                if index in process_positions:
                    # 処理引数は計算しない。関数の中で呼ばれるたびに、そのときの @ で計算する
                    extra_vals.append(ProcessArgument(arg_node, env))
                    continue
                arg_env = Environment(parent=env)
                arg_env.set_current(left_val)
                extra_vals.append(await self.eval(arg_node, arg_env))
            current: Any = (left_val, *extra_vals)
        else:
            current = left_val

        # 1. User-defined functions
        if function_entry:
            func_def, captured_vars, owner_env = function_entry
            closure_env = Environment()
            closure_env.variables = (
                dict(captured_vars)
                if captured_vars is not None
                else dict(owner_env.variables)
            )
            closure_env.functions = owner_env.functions

            call_env = Environment(parent=closure_env)
            call_env.function_scope = True
            call_env.set_current(current)

            n_params = len(func_def.params)
            if n_params == 1:
                if isinstance(current, tuple):
                    raise PopCornError(
                        "RuntimeError",
                        f"Function '{name}' expects 1 value, got {len(current)}",
                    )
                call_env.set_var(func_def.params[0].name, current)
            elif n_params > 1:
                if not isinstance(current, tuple):
                    raise PopCornError(
                        "RuntimeError",
                        f"Function '{name}' expects {n_params} values, got 1",
                    )
                if len(current) != n_params:
                    raise PopCornError(
                        "RuntimeError",
                        f"Function '{name}' expects {n_params} values, got {len(current)}",
                    )
                for param, arg_val in zip(func_def.params, current):
                    if param.type_name == "process":
                        if not isinstance(arg_val, ProcessArgument):
                            raise PopCornError(
                                "TypeError",
                                f"Pass '{param.name}' of '{name}' in parentheses: '>> {name}(…)'",
                            )
                        call_env.set_function(param.name, arg_val)
                    else:
                        call_env.set_var(param.name, arg_val)

            if self.call_depth >= MAX_CALL_DEPTH:
                raise _too_deep_error()
            self.call_depth += 1
            try:
                return await self.eval_BlockNode(func_def.block, call_env)
            except ReturnException as exc:
                return exc.value
            except RecursionError:
                # Python のほうが先に限界に来たとき（Playground など）も、PopCorn のエラーにする
                raise _too_deep_error() from None
            finally:
                self.call_depth -= 1

        # 2. Built-in functions
        from .pop_builtins import BUILTIN_REGISTRY

        if name in BUILTIN_REGISTRY:
            try:
                res = BUILTIN_REGISTRY[name](current, env, self)
                if inspect.iscoroutine(res):
                    res = await res
            except PopCornError as exc:
                # どこで起きたかを、テストの報告などで示せるように覚えておく
                if exc.line is None:
                    exc.line = node.line
                    exc.column = node.column
                raise
            return res

        raise PopCornError("NameError", f"Function '{name}' is not defined.")

    async def eval_ArgumentListNode(self, node: ArgumentListNode, env: Environment):
        res = []
        saved_current = env.get_current()
        for item in node.items:
            item_env = Environment(parent=env)
            item_env.set_current(saved_current)
            res.append(await self.eval(item, item_env))
        return tuple(res)

    async def eval_IndexAccessNode(self, node: IndexAccessNode, env: Environment):
        target = await self.eval(node.target, env)
        idx = await self.eval(node.index, env)

        if isinstance(target, (list, tuple)):
            whole_idx = _as_whole_int(idx, "List indices must be whole Num values")
            # 負の添字は、うしろから数える（xs[-1] は最後の要素）
            pos = whole_idx + len(target) if whole_idx < 0 else whole_idx
            if pos < 0 or pos >= len(target):
                raise PopCornError("IndexError", f"Index {whole_idx} out of bounds")
            return target[pos]

        if isinstance(target, str):
            # 文字列は、Unicode コードポイント単位で 1 文字を取り出す（"abc"[0] は "a"）
            whole_idx = _as_whole_int(idx, "Str indices must be whole Num values")
            pos = whole_idx + len(target) if whole_idx < 0 else whole_idx
            if pos < 0 or pos >= len(target):
                raise PopCornError("IndexError", f"Index {whole_idx} out of bounds")
            return target[pos]

        if isinstance(target, dict):
            if not isinstance(idx, str):
                raise PopCornError("TypeError", "Dict keys must be Str")
            if idx not in target:
                raise PopCornError("KeyError", f"Key '{idx}' is not defined")
            return target[idx]

        shown = idx if isinstance(idx, str) else format_popcorn_str(idx, nested=True)
        raise PopCornError(
            "TypeError",
            f"Cannot access index/key '{shown}' on {popcorn_type_name(target)}",
        )

    async def eval_BindNode(self, node: BindNode, env: Environment):
        val = env.get_current()
        if isinstance(node.target, IndexAccessNode):
            raise PopCornError(
                "RuntimeError", "Collection assignment is not supported; use Set or Update"
            )
        if isinstance(node.target, VariableNode):
            env.set_var(node.target.name, val)
            return val
        raise PopCornError("RuntimeError", f"Invalid bind target {node.target}")

    async def eval_CheckBlock(self, node: CheckBlock, env: Environment):
        val = env.get_current()
        aliases = node.alias_names or ([node.alias] if node.alias else [])
        for branch in node.branches:
            branch_env = Environment(parent=env)
            branch_env.set_current(val)
            _bind_aliases(branch_env, aliases, val)
            if branch.condition is None:
                return await self.eval(branch.block, branch_env)
            cond_result = await self.eval(branch.condition, branch_env)
            if not isinstance(cond_result, bool):
                raise PopCornError("TypeError", "Check predicate must return Bool")
            if cond_result:
                return await self.eval(branch.block, branch_env)
        raise PopCornError("RuntimeError", "Check requires an else branch")

    async def eval_LoopBlock(self, node: LoopBlock, env: Environment):
        val = env.get_current()
        aliases = node.alias_names or ([node.alias] if node.alias else [])
        while True:
            loop_env = Environment(parent=env)
            loop_env.loop_scope = True
            loop_env.set_current(val)
            _bind_aliases(loop_env, aliases, val)
            try:
                val = await self.eval(node.block, loop_env)
            except BreakException as e:
                val = e.value
                break
        return val

    async def eval_TryCatchBlock(self, node: TryCatchBlock, env: Environment):
        val = env.get_current()
        try_env = Environment(parent=env)
        try_env.set_current(val)
        _bind_aliases(try_env, node.try_alias_names, val)
        try:
            return await self.eval(node.try_block, try_env)
        except PopCornError as exc:
            err_dict = {"type": exc.err_type, "message": exc.message}
        except EvaluatorError as exc:
            err_dict = {"type": "RuntimeError", "message": str(exc)}
        except OSError as exc:
            err_dict = {"type": "IOError", "message": str(exc)}

        catch_env = Environment(parent=env)
        catch_env.set_current(err_dict)
        _bind_aliases(catch_env, node.catch_alias_names, err_dict)
        return await self.eval(node.catch_block, catch_env)

    async def eval_BreakNode(self, node: BreakNode, env: Environment):
        scope = env
        while scope:
            if scope.loop_scope:
                raise BreakException(env.get_current())
            scope = scope.parent
        raise PopCornError("RuntimeError", "Break can only be used inside Loop")

    async def eval_ReturnNode(self, node: ReturnNode, env: Environment):
        scope = env
        while scope:
            if scope.function_scope:
                break
            scope = scope.parent
        if not scope:
            raise PopCornError("RuntimeError", "Return can only be used inside a pop function")
        raise ReturnException(env.get_current())

    async def eval_DestructuringBindNode(self, node: DestructuringBindNode, env: Environment):
        val = env.get_current()
        if not isinstance(val, (tuple, list)):
            raise PopCornError("TypeError", "Destructuring bind requires a Tuple or List")
        if len(val) != len(node.targets):
            raise PopCornError(
                "RuntimeError",
                f"Destructuring bind expects {len(node.targets)} values, got {len(val)}",
            )
        for target, item in zip(node.targets, val):
            env.set_var(target, item)
        return val

    async def eval_InterpolatedStringNode(
        self, node: InterpolatedStringNode, env: Environment
    ):
        res = []
        saved_current = env.get_current()
        for part in node.parts:
            if isinstance(part, str):
                res.append(part)
            else:
                interp_env = Environment(parent=env)
                interp_env.set_current(saved_current)
                evaluated = await self.eval(part, interp_env)
                res.append(format_popcorn_str(evaluated))
        return "".join(res)


def _update_target_path(target_node: ASTNode, var_name: str) -> list[str] | None:
    """`@::a::b` や `user::a::b` から、["a", "b"] を取り出す（形が違えば None）。"""
    path: list[str] = []
    node = target_node
    while isinstance(node, IndexAccessNode):
        if not (isinstance(node.index, LiteralNode) and isinstance(node.index.value, str)):
            return None
        path.append(node.index.value)
        node = node.target
    if not path:
        return None
    if isinstance(node, ImplicitVariableNode):
        return list(reversed(path))
    if isinstance(node, VariableNode) and var_name and node.name == var_name:
        return list(reversed(path))
    return None


def _set_dict_path(target: dict, path: list[str], value: Any) -> dict:
    """入れ子の Dict の path の位置を value にした、新しい Dict を返す（途中にない Dict は作る）。"""
    updated = dict(target)
    key = path[0]
    if len(path) == 1:
        updated[key] = value
        return updated
    inner = updated.get(key)
    if inner is None and key not in updated:
        inner = {}
    if not isinstance(inner, dict):
        raise PopCornError(
            "TypeError",
            f"Update cannot set a field inside '{key}' because it is {popcorn_type_name(inner)}, not Dict",
        )
    updated[key] = _set_dict_path(inner, path[1:], value)
    return updated


def _stage_label(node: ASTNode) -> str:
    """`>?>` の表示で使う、直前の段階の名前（分からなければ空）。"""
    if isinstance(node, StreamBlockNode):
        return node.stream_type
    if isinstance(node, FunctionCallNode):
        return node.name
    if isinstance(node, VariableNode):
        return node.name
    if isinstance(node, BindNode) and isinstance(node.target, VariableNode):
        return node.target.name
    if isinstance(node, (CheckBlock, LoopBlock)):
        return "Check" if isinstance(node, CheckBlock) else "Loop"
    if isinstance(node, TryCatchBlock):
        return "Try"
    return ""
