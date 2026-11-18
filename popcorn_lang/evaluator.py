from .ast_nodes import *
from .environment import Environment
import json
import os

class EvaluatorError(Exception):
    pass

class PopCornError(EvaluatorError):
    def __init__(self, err_type, message):
        self.err_type = err_type
        self.message = message
        super().__init__(f"{err_type}: {message}")

class ReturnException(BaseException):
    def __init__(self, value):
        self.value = value

class BreakException(BaseException):
    def __init__(self, value):
        self.value = value

def _is_number(value):
    return type(value) in (int, float)

def _values_equal(left, right):
    if _is_number(left) and _is_number(right):
        return left == right
    if type(left) is not type(right):
        return False
    if isinstance(left, list):
        return len(left) == len(right) and all(
            _values_equal(a, b) for a, b in zip(left, right)
        )
    if isinstance(left, dict):
        return left.keys() == right.keys() and all(
            _values_equal(left[key], right[key]) for key in left
        )
    return left == right

class Evaluator:
    def __init__(self):
        self.global_env = Environment()
        self.trace_path = os.environ.get('POPCORN_TRACE_FILE')

    def trace_pipeline_value(self, node, value, input_value=None, progress=None):
        """Emit optional, compact execution data for the VS Code flow view."""
        if not self.trace_path:
            return
        try:
            def display(current):
                preview = json.dumps(current, ensure_ascii=False, default=str)
                if len(preview) > 180:
                    preview = preview[:177] + "..."
                type_names = {str: "Str", int: "Num", float: "Num", bool: "Bool", list: "List", dict: "Dict", type(None): "Null"}
                return f"{preview} ({type_names.get(type(current), type(current).__name__)})"
            event = {
                "line": getattr(node, "line", 0),
                "stage": getattr(node, "name", getattr(node, "stream_type", type(node).__name__)),
                "after": display(value)
            }
            if input_value is not None:
                event["before"] = display(input_value)
            if progress:
                event["progress"] = progress
            with open(self.trace_path, 'a', encoding='utf-8') as trace_file:
                trace_file.write(json.dumps(event, ensure_ascii=False) + "\n")
        except Exception:
            pass

    async def eval(self, node: ASTNode, env: Environment) -> Any:
        method_name = f'eval_{type(node).__name__}'
        visitor = getattr(self, method_name, self.generic_eval)
        return await visitor(node, env)

    async def generic_eval(self, node: ASTNode, env: Environment):
        raise EvaluatorError(f"No eval method for {type(node).__name__}")

    async def eval_Program(self, node: Program, env: Environment):
        result = None
        for stmt in node.statements:
            if isinstance(stmt, FunctionDefNode):
                # Store the defining environment for lexical (not dynamic)
                # scope.
                env.set_function(stmt.name, (stmt, env))
            else:
                result = await self.eval(stmt, env)
        return result

    async def eval_Pipeline(self, node: Pipeline, env: Environment):
        i = 1
        try:
            val = await self.eval(node.nodes[0], env)
        except Exception as e:
            catch_idx = -1
            for j in range(1, len(node.nodes)):
                op_j = node.ops[j-1] if hasattr(node, 'ops') and j-1 < len(node.ops) else '>>'
            raise e

        env.set_current(val)
        self.trace_pipeline_value(node.nodes[0], val)

        while i < len(node.nodes):
            n = node.nodes[i]
            op = node.ops[i-1] if hasattr(node, 'ops') and i-1 < len(node.ops) else '>>'

            try:
                input_value = val
                if op != '>>':
                    raise EvaluatorError("Only >> is a valid pipeline operator")
                if isinstance(n, StreamBlockNode):
                    if n.stream_type == 'Map':
                        if not isinstance(val, list): raise EvaluatorError("Map stream requires a list")
                        mapped = []
                        for item_index, item in enumerate(val, start=1):
                            self.trace_pipeline_value(n, item, progress=f"{item_index} / {len(val)}")
                            item_env = Environment(parent=env)
                            item_env.set_current(item)
                            var_name = n.var_names[0].lstrip('@') if n.var_names else ''
                            if var_name: item_env.set_var(var_name, item)
                            try:
                                mapped.append(await self.eval(n.block, item_env))
                            except ReturnException as e:
                                mapped.append(e.value)
                            except BreakException as e:
                                mapped.append(e.value)
                                break
                        val = mapped
                    elif n.stream_type == 'Filter':
                        if not isinstance(val, list): raise EvaluatorError("Filter stream requires a list")
                        filtered = []
                        for item in val:
                            item_env = Environment(parent=env)
                            item_env.set_current(item)
                            var_name = n.var_names[0].lstrip('@') if n.var_names else ''
                            if var_name: item_env.set_var(var_name, item)
                            try:
                                res = await self.eval(n.block, item_env)
                            except ReturnException as e:
                                res = e.value
                            except BreakException as e:
                                res = e.value
                            if not isinstance(res, bool):
                                raise EvaluatorError("Filter block must return Bool")
                            if res: filtered.append(item)
                        val = filtered
                    elif n.stream_type == 'Reduce':
                        if not isinstance(val, list) or len(val) == 0: raise EvaluatorError("Reduce stream requires non-empty list")
                        res = val[0]
                        for item in val[1:]:
                            item_env = Environment(parent=env)
                            current = [res, item]
                            item_env.set_current(current)
                            var_name = n.var_names[0].lstrip('@') if n.var_names else ''
                            if var_name: item_env.set_var(var_name, current)
                            try:
                                res = await self.eval(n.block, item_env)
                            except ReturnException as e:
                                res = e.value
                        val = res
                    elif n.stream_type == 'Sort':
                        if not isinstance(val, list): raise EvaluatorError("Sort stream requires a list")
                        import copy
                        key_block = n.block
                        descending = False
                        if key_block.pipelines:
                            last_pipeline = key_block.pipelines[-1]
                            if last_pipeline.nodes and isinstance(last_pipeline.nodes[-1], UnaryOpNode) and last_pipeline.nodes[-1].operator == '-':
                                descending = True
                                key_block = copy.deepcopy(n.block)
                                key_block.pipelines[-1].nodes[-1] = key_block.pipelines[-1].nodes[-1].right
                        decorated = []
                        for item in val:
                            item_env = Environment(parent=env)
                            item_env.set_current(item)
                            var_name = n.var_names[0].lstrip('@') if n.var_names else ''
                            if var_name: item_env.set_var(var_name, item)
                            try:
                                key = await self.eval(key_block, item_env)
                                decorated.append((key, item))
                            except ReturnException as e:
                                decorated.append((e.value, item))
                        try:
                            decorated.sort(key=lambda x: x[0], reverse=descending)
                        except TypeError as exc:
                            raise EvaluatorError(f"Sort keys are not mutually comparable: {exc}")
                        val = [item for key, item in decorated]
                    elif n.stream_type == 'Group':
                        if not isinstance(val, list): raise EvaluatorError("Group stream requires a list")
                        grouped = {}
                        for item in val:
                            item_env = Environment(parent=env)
                            item_env.set_current(item)
                            var_name = n.var_names[0].lstrip('@') if n.var_names else ''
                            if var_name: item_env.set_var(var_name, item)
                            try:
                                key = await self.eval(n.block, item_env)
                            except ReturnException as e:
                                key = e.value
                            if not isinstance(key, str):
                                raise EvaluatorError("Group block must return Str")
                            if key not in grouped: grouped[key] = []
                            grouped[key].append(item)
                        val = grouped
                    elif n.stream_type == 'Fork':
                        results = []
                        var_name = n.var_names[0].lstrip('@') if n.var_names else ''
                        for pipeline in n.block.pipelines:
                            fork_env = Environment(parent=env)
                            fork_env.set_current(val)
                            if var_name:
                                fork_env.set_var(var_name, val)
                            results.append(await self.eval(pipeline, fork_env))
                        val = results
                    elif n.stream_type == 'Update':
                        if not isinstance(val, dict): raise EvaluatorError("Update stream requires a dictionary")
                        new_dict = dict(val)
                        var_name = n.var_names[0].lstrip('@') if n.var_names else ''
                        for statement in n.block.pipelines:
                            if not isinstance(statement, Pipeline) or len(statement.nodes) < 2:
                                raise EvaluatorError("Update statement must be 'value >> @::field'")

                            target_node = statement.nodes[-1]
                            if isinstance(target_node, BindNode):
                                target_node = target_node.target
                            is_field_target = isinstance(target_node, IndexAccessNode)
                            is_implicit_target = is_field_target and isinstance(target_node.target, ImplicitVariableNode)
                            is_named_target = is_field_target and isinstance(target_node.target, VariableNode) and target_node.target.name == var_name
                            if not (
                                is_field_target
                                and (is_implicit_target or is_named_target)
                                and isinstance(target_node.index, LiteralNode)
                                and isinstance(target_node.index.value, str)
                            ):
                                raise EvaluatorError("Update target must be @::field or the block value name followed by ::field")

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
                            key = target_node.index.value
                            new_dict[key] = res
                        val = new_dict
                    else:
                        raise EvaluatorError(f"Unknown stream block type {n.stream_type}")
                else:
                    val = await self.eval(n, env)

                env.set_current(val)
                self.trace_pipeline_value(n, val, input_value)
                i += 1
            except Exception as e:
                raise e

        return val
    async def eval_BlockNode(self, node: BlockNode, env: Environment):
        val = env.get_current()
        for pipeline in node.pipelines:
            val = await self.eval(pipeline, env)
            env.set_current(val)
        return val

    async def eval_DictNode(self, node: DictNode, env: Environment):
        result = {}
        for k, v in zip(node.keys, node.values):
            result[k] = await self.eval(v, env)
        return result

    async def eval_LiteralNode(self, node: LiteralNode, env: Environment):
        if isinstance(node.value, list):
            return [await self.eval(item, env) if isinstance(item, ASTNode) else item for item in node.value]
        return node.value

    async def eval_UnaryOpNode(self, node: UnaryOpNode, env: Environment):
        right = await self.eval(node.right, env)
        if node.operator == '-':
            if _is_number(right):
                return -right
            raise EvaluatorError(f"Cannot negate non-number: {type(right)}")
        elif node.operator == 'not':
            if not isinstance(right, bool):
                raise EvaluatorError("not requires Bool")
            return not right
        raise EvaluatorError(f"Unknown unary operator: {node.operator}")

    async def eval_VariableNode(self, node: VariableNode, env: Environment):
        try:
            return env.get_var(node.name)
        except NameError:
            raise PopCornError("NameError", f"Variable '{node.name}' is not defined.")

    async def eval_ImplicitVariableNode(self, node: ImplicitVariableNode, env: Environment):
        if node.name != '@':
            var_name = node.name.lstrip('@')
            try:
                return env.get_var(var_name)
            except Exception:
                pass
        return env.get_current()

    async def eval_ExpressionNode(self, node: ExpressionNode, env: Environment):
        left = await self.eval(node.left, env)
        op = node.operator
        if op == 'and':
            if not isinstance(left, bool): raise EvaluatorError("and requires Bool operands")
            if not left: return False
            right = await self.eval(node.right, env)
            if not isinstance(right, bool): raise EvaluatorError("and requires Bool operands")
            return right
        if op == 'or':
            if not isinstance(left, bool): raise EvaluatorError("or requires Bool operands")
            if left: return True
            right = await self.eval(node.right, env)
            if not isinstance(right, bool): raise EvaluatorError("or requires Bool operands")
            return right
        right = await self.eval(node.right, env)
        if op == '+':
            if _is_number(left) and _is_number(right): return left + right
            if isinstance(left, str) and isinstance(right, str): return left + right
            if isinstance(left, list) and isinstance(right, list): return left + right
            raise PopCornError("TypeError", "+ requires numbers, two Str values, or two List values")
        if op == '-':
            if _is_number(left) and _is_number(right): return left - right
            raise PopCornError("TypeError", "- requires numbers")
        if op == '*':
            if _is_number(left) and _is_number(right): return left * right
            raise PopCornError("TypeError", "* requires numbers")
        if op == '/':
            if not (_is_number(left) and _is_number(right)):
                raise PopCornError("TypeError", "/ requires numbers")
            if right == 0: raise EvaluatorError("Division by zero")
            return left / right
        if op == '%':
            if not (_is_number(left) and _is_number(right)):
                raise PopCornError("TypeError", "% requires numbers")
            if right == 0: raise EvaluatorError("Modulo by zero")
            return left % right
        if op in ('>', '<', '>=', '<='):
            comparable = (_is_number(left) and _is_number(right)) or (
                isinstance(left, str) and isinstance(right, str)
            )
            if not comparable:
                raise PopCornError("TypeError", f"{op} requires two numbers or two Str values")
            if op == '>': return left > right
            if op == '<': return left < right
            if op == '>=': return left >= right
            return left <= right
        if op == '==': return _values_equal(left, right)
        if op == '!=': return not _values_equal(left, right)
        raise EvaluatorError(f"Unknown operator {op}")

    async def eval_FunctionCallNode(self, node: FunctionCallNode, env: Environment):
        name = node.name
        if hasattr(node, 'args') and node.args:
            if len(node.args) == 1:
                current = await self.eval(node.args[0], env)
            else:
                arg_vals = []
                for a in node.args:
                    arg_vals.append(await self.eval(a, env))
                current = arg_vals
        else:
            current = env.get_current()

        # 1. User-defined functions
        function_entry = env.get_function(name)
        if function_entry:
            func_def, defining_env = function_entry
            new_env = Environment(parent=defining_env)
            new_env.function_scope = True
            if len(func_def.params) == 1:
                new_env.set_var(func_def.params[0].name, current)
            elif len(func_def.params) > 1:
                if not isinstance(current, list) or len(current) != len(func_def.params):
                    raise PopCornError(
                        "TypeError",
                        f"Function '{name}' expects {len(func_def.params)} values"
                    )
                for i, param in enumerate(func_def.params):
                    new_env.set_var(param.name, current[i])
            try:
                return await self.eval_BlockNode(func_def.block, new_env)
            except ReturnException as exc:
                return exc.value

        # 2. Built-in functions
        from .pop_builtins import BUILTIN_REGISTRY
        if name in BUILTIN_REGISTRY:
            import inspect
            res = BUILTIN_REGISTRY[name](current, env, self)
            if inspect.iscoroutine(res):
                res = await res
            return res

        # Fallback for capitalized variables (parsed as FunctionCallNode with no args)
        if not hasattr(node, 'args') or not node.args:
            try:
                return env.get_var(name)
            except Exception:
                pass

        raise PopCornError("NameError", f"Function '{name}' is not defined.")

    async def eval_ArgumentListNode(self, node: ArgumentListNode, env: Environment):
        res = []
        for item in node.items:
            item_env = Environment(parent=env)
            item_env.set_current(env.get_current())
            res.append(await self.eval(item, item_env))
        return res

    async def eval_IndexAccessNode(self, node: IndexAccessNode, env: Environment):
        target = await self.eval(node.target, env)
        idx = await self.eval(node.index, env)
        try:
            return target[idx]
        except KeyError:
            raise PopCornError("KeyError", f"Key '{idx}' is not defined")
        except (IndexError, TypeError) as e:
            raise PopCornError("IndexError", f"Cannot access index/key '{idx}' on {target}: {e}")

    async def eval_BindNode(self, node: BindNode, env: Environment):
        val = env.get_current()
        if isinstance(node.target, IndexAccessNode):
            raise EvaluatorError("Collection assignment is not supported; use Set or Update")
        elif isinstance(node.target, VariableNode):
            env.set_var(node.target.name, val)
            return val
        else:
            raise EvaluatorError(f"Invalid bind target {node.target}")

    async def eval_CheckBlock(self, node: CheckBlock, env: Environment):
        val = env.get_current()
        for branch in node.branches:
            if branch.condition is None: # else branch
                branch_env = Environment(parent=env)
                branch_env.set_current(val)
                if node.alias: branch_env.set_var(node.alias, val)
                return await self.eval(branch.block, branch_env)
            branch_env = Environment(parent=env)
            branch_env.set_current(val)
            if node.alias: branch_env.set_var(node.alias, val)
            cond_result = await self.eval(branch.condition, branch_env)
            if branch.mode == 'candidates':
                is_match = any(_values_equal(val, candidate) for candidate in cond_result)
            else:
                if not isinstance(cond_result, bool):
                    raise EvaluatorError("Check predicate must return Bool")
                is_match = cond_result
            if is_match:
                return await self.eval(branch.block, branch_env)
        raise EvaluatorError("Check requires an else branch")

    async def eval_LoopBlock(self, node: LoopBlock, env: Environment):
        val = env.get_current()
        while True:
            loop_env = Environment(parent=env)
            loop_env.loop_scope = True
            loop_env.set_current(val)
            if node.alias: loop_env.set_var(node.alias, val)
            try:
                val = await self.eval(node.block, loop_env)
            except BreakException as e:
                val = e.value
                break
        return val

    async def eval_BreakNode(self, node: BreakNode, env: Environment):
        scope = env
        while scope:
            if scope.loop_scope:
                raise BreakException(env.get_current())
            scope = scope.parent
        raise EvaluatorError("Break can only be used inside Loop")



    async def eval_ReturnNode(self, node: ReturnNode, env: Environment):
        scope = env
        while scope:
            if scope.function_scope:
                break
            scope = scope.parent
        if not scope:
            raise EvaluatorError("Return can only be used inside a new function")
        val = env.get_current()
        raise ReturnException(val)

    async def eval_DestructuringBindNode(self, node: DestructuringBindNode, env: Environment):
        val = env.get_current()
        if not isinstance(val, list):
            raise EvaluatorError("Destructuring bind requires a parenthesized value list")
        if len(val) != len(node.targets):
            raise EvaluatorError(
                f"Destructuring bind expects {len(node.targets)} values, got {len(val)}"
            )
        for i, target in enumerate(node.targets):
            env.set_var(target, val[i])
        return val

    async def eval_InterpolatedStringNode(self, node: InterpolatedStringNode, env: Environment):
        res = ""
        saved_current = env.get_current()
        for part in node.parts:
            if isinstance(part, str):
                res += part
            else:
                interp_env = Environment(parent=env)
                interp_env.set_current(saved_current)
                res += str(await self.eval(part, interp_env))
        return res
