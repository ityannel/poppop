import math
import os
import sys
import json
import urllib.request
import urllib.error
import time
import uuid
import datetime
import re
from .ast_nodes import *
from .evaluator import EvaluatorError, PopPopError, ReturnException, BreakException

def _raise_error(msg):
    raise PopPopError("TypeError", msg)

def _is_number(value):
    return type(value) in (int, float)

def _same_value(left, right):
    if _is_number(left) and _is_number(right):
        return left == right
    if type(left) is not type(right):
        return False
    if isinstance(left, list):
        return len(left) == len(right) and all(
            _same_value(a, b) for a, b in zip(left, right)
        )
    if isinstance(left, dict):
        return left.keys() == right.keys() and all(
            _same_value(left[key], right[key]) for key in left
        )
    return left == right

def _display_value(value):
    """Format a runtime value using PopPop spellings, not Python repr."""
    if isinstance(value, str):
        return value
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (list, dict)):
        return json.dumps(value, ensure_ascii=False)
    return str(value)

BUILTIN_REGISTRY = {}

def builtin_Type(current, env, evaluator):
    try:
        if current is None: return 'Null'
        if isinstance(current, bool): return 'Bool'
        if isinstance(current, int): return 'Int'
        if isinstance(current, float): return 'Num'
        if isinstance(current, str): return 'Str'
        if isinstance(current, list): return 'List'
        if isinstance(current, dict): return 'Dict'
        raise PopPopError("TypeError", f"Unsupported runtime value: {type(current).__name__}")
    except Exception as e:
        if isinstance(e, (PopPopError, ReturnException, BreakException)):
            raise e
        raise PopPopError("RuntimeError", f"Error in Type: {str(e)}")

BUILTIN_REGISTRY['Type'] = builtin_Type

def builtin_Sleep(current, env, evaluator):
    try:
        import time
        if not _is_number(current) or current < 0:
            _raise_error("Sleep requires a non-negative number of seconds")
        time.sleep(current)
        return current
    except Exception as e:
        if isinstance(e, (PopPopError, ReturnException, BreakException)):
            raise e
        raise PopPopError("RuntimeError", f"Error in Sleep: {str(e)}")

BUILTIN_REGISTRY['Sleep'] = builtin_Sleep

def builtin_Add(current, env, evaluator):
    try:
        if isinstance(current, list) and len(current) == 2:
            left, right = current
            if _is_number(left) and _is_number(right):
                return left + right
            if isinstance(left, str) and isinstance(right, str):
                return left + right
            if isinstance(left, list) and isinstance(right, list):
                return left + right
        _raise_error("Add requires two numbers, two Str values, or two List values")

    except Exception as e:
        if isinstance(e, (PopPopError, ReturnException, BreakException)):
            raise e
        raise PopPopError("RuntimeError", f"Error in Add: {str(e)}")

BUILTIN_REGISTRY['Add'] = builtin_Add

def builtin_Sum(current, env, evaluator):
    try:
        if isinstance(current, list) and all(_is_number(item) for item in current):
            return sum(current)
        raise PopPopError("TypeError", f"Sum requires a list, got {type(current)}")

    except Exception as e:
        if isinstance(e, (PopPopError, ReturnException, BreakException)):
            raise e
        raise PopPopError("RuntimeError", f"Error in Sum: {str(e)}")

BUILTIN_REGISTRY['Sum'] = builtin_Sum

def builtin_Max(current, env, evaluator):
    try:
        if isinstance(current, list) and current and (
            all(_is_number(item) for item in current)
            or all(isinstance(item, str) for item in current)
        ):
            return max(current)
        _raise_error("Max requires a non-empty List of numbers or Str values")
    except Exception as e:
        if isinstance(e, (PopPopError, ReturnException, BreakException)):
            raise e
        raise PopPopError("RuntimeError", f"Error in Max: {str(e)}")

BUILTIN_REGISTRY['Max'] = builtin_Max

def builtin_Min(current, env, evaluator):
    try:
        if isinstance(current, list) and current and (
            all(_is_number(item) for item in current)
            or all(isinstance(item, str) for item in current)
        ):
            return min(current)
        _raise_error("Min requires a non-empty List of numbers or Str values")
    except Exception as e:
        if isinstance(e, (PopPopError, ReturnException, BreakException)):
            raise e
        raise PopPopError("RuntimeError", f"Error in Min: {str(e)}")

BUILTIN_REGISTRY['Min'] = builtin_Min

def builtin_Round(current, env, evaluator):
    try:
        if _is_number(current):
            return round(current)
        _raise_error("Round requires a number")
    except Exception as e:
        if isinstance(e, (PopPopError, ReturnException, BreakException)):
            raise e
        raise PopPopError("RuntimeError", f"Error in Round: {str(e)}")

BUILTIN_REGISTRY['Round'] = builtin_Round

def builtin_Abs(current, env, evaluator):
    try:
        if _is_number(current):
            return abs(current)
        _raise_error("Abs requires a number")
    except Exception as e:
        if isinstance(e, (PopPopError, ReturnException, BreakException)):
            raise e
        raise PopPopError("RuntimeError", f"Error in Abs: {str(e)}")

BUILTIN_REGISTRY['Abs'] = builtin_Abs

def builtin_Length(current, env, evaluator):
    try:
        try:
            return len(current)
        except TypeError:
            raise PopPopError("TypeError", f"Cannot get length of {type(current).__name__}")
    except Exception as e:
        if isinstance(e, (PopPopError, ReturnException, BreakException)):
            raise e
        raise PopPopError("RuntimeError", f"Error in Length: {str(e)}")

BUILTIN_REGISTRY['Length'] = builtin_Length

def builtin_Reverse(current, env, evaluator):
    try:
        if isinstance(current, list):
            return list(reversed(current))
        elif isinstance(current, str):
            return current[::-1]
        raise PopPopError("TypeError", "Reverse requires a list or str")
    except Exception as e:
        if isinstance(e, (PopPopError, ReturnException, BreakException)):
            raise e
        raise PopPopError("RuntimeError", f"Error in Reverse: {str(e)}")

BUILTIN_REGISTRY['Reverse'] = builtin_Reverse

def builtin_Uppercase(current, env, evaluator):
    try:
        if isinstance(current, str):
            return current.upper()
        raise PopPopError("TypeError", "Uppercase requires a str")
    except Exception as e:
        if isinstance(e, (PopPopError, ReturnException, BreakException)):
            raise e
        raise PopPopError("RuntimeError", f"Error in Uppercase: {str(e)}")

BUILTIN_REGISTRY['Uppercase'] = builtin_Uppercase

def builtin_Lowercase(current, env, evaluator):
    try:
        if isinstance(current, str):
            return current.lower()
        raise PopPopError("TypeError", "Lowercase requires a str")
    except Exception as e:
        if isinstance(e, (PopPopError, ReturnException, BreakException)):
            raise e
        raise PopPopError("RuntimeError", f"Error in Lowercase: {str(e)}")

BUILTIN_REGISTRY['Lowercase'] = builtin_Lowercase

def builtin_Split(current, env, evaluator):
    try:
        if (
            isinstance(current, list)
            and len(current) == 2
            and all(isinstance(item, str) for item in current)
        ):
            return current[0].split(current[1])
        _raise_error("Split requires (Str, Str)")
    except Exception as e:
        if isinstance(e, (PopPopError, ReturnException, BreakException)):
            raise e
        raise PopPopError("RuntimeError", f"Error in Split: {str(e)}")

BUILTIN_REGISTRY['Split'] = builtin_Split

def builtin_Replace(current, env, evaluator):
    try:
        if isinstance(current, list) and len(current) == 3:
            target, old, new = current
            if isinstance(target, str) and isinstance(old, str) and isinstance(new, str):
                return target.replace(old, new)
        raise PopPopError("TypeError", "Replace requires a parenthesized argument list of 3 (target, old, new)")
    except Exception as e:
        if isinstance(e, (PopPopError, ReturnException, BreakException)):
            raise e
        raise PopPopError("RuntimeError", f"Error in Replace: {str(e)}")

BUILTIN_REGISTRY['Replace'] = builtin_Replace

def builtin_Join(current, env, evaluator):
    try:
        if isinstance(current, list) and len(current) == 2:
            target, delim = current
            if isinstance(target, list) and isinstance(delim, str):
                return delim.join([str(x) for x in target])
        raise PopPopError("TypeError", "Join requires a parenthesized argument list of 2 (list, delimiter)")
    except Exception as e:
        if isinstance(e, (PopPopError, ReturnException, BreakException)):
            raise e
        raise PopPopError("RuntimeError", f"Error in Join: {str(e)}")

BUILTIN_REGISTRY['Join'] = builtin_Join

def builtin_Get(current, env, evaluator):
    try:
        if isinstance(current, list) and len(current) == 2:
            target, key = current
            try:
                if isinstance(target, list) and type(key) is not int:
                    raise PopPopError("TypeError", "List indices must be Int")
                if isinstance(target, dict) and not isinstance(key, str):
                    raise PopPopError("TypeError", "Dict keys must be Str")
                return target[key]
            except KeyError:
                raise PopPopError("KeyError", f"Key '{key}' not found in dict")
            except IndexError:
                raise PopPopError("IndexError", f"Index {key} out of bounds")
            except TypeError:
                raise PopPopError("TypeError", f"Cannot get '{key}' from {type(target).__name__}")
        raise PopPopError("TypeError", "Get requires a parenthesized argument list of 2 (target, key)")
    except Exception as e:
        if isinstance(e, (PopPopError, ReturnException, BreakException)):
            raise e
        raise PopPopError("RuntimeError", f"Error in Get: {str(e)}")

BUILTIN_REGISTRY['Get'] = builtin_Get

def builtin_Set(current, env, evaluator):
    try:
        if isinstance(current, list) and len(current) == 3:
            target, key, value = current
            try:
                if isinstance(target, dict):
                    if not isinstance(key, str):
                        raise PopPopError("TypeError", "Dictionary keys must be Str")
                    res = dict(target)
                    res[key] = value
                    return res
                if isinstance(target, list):
                    if type(key) is not int:
                        raise PopPopError("TypeError", "List indices must be Int")
                    res = list(target)
                    res[key] = value
                    return res
                raise PopPopError("TypeError", "Set target must be List or Dict")
            except (IndexError, TypeError, KeyError) as e:
                raise PopPopError("SetError", f"Cannot set index/key {key} on target: {e}")
        raise PopPopError("TypeError", "Set requires a parenthesized argument list of 3 (target, key, value)")
    except Exception as e:
        if isinstance(e, (PopPopError, ReturnException, BreakException)):
            raise e
        raise PopPopError("RuntimeError", f"Error in Set: {str(e)}")

def builtin_Merge(current, env, evaluator):
    try:
        if isinstance(current, list) and len(current) == 2:
            d1, d2 = current
            if isinstance(d1, dict) and isinstance(d2, dict):
                res = dict(d1)
                res.update(d2)
                return res
        raise PopPopError("TypeError", "Merge requires a tuple of 2 dicts (dict1, dict2)")
    except Exception as e:
        if isinstance(e, (PopPopError, ReturnException, BreakException)):
            raise e
        raise PopPopError("RuntimeError", f"Error in Merge: {str(e)}")

BUILTIN_REGISTRY['Set'] = builtin_Set
BUILTIN_REGISTRY['Merge'] = builtin_Merge

def builtin_Contains(current, env, evaluator):
    try:
        if isinstance(current, list) and len(current) == 2:
            target, item = current
            if isinstance(target, list):
                return any(_same_value(element, item) for element in target)
            if isinstance(target, dict) and isinstance(item, str):
                return item in target
            if isinstance(target, str) and isinstance(item, str):
                return item in target
        raise PopPopError("TypeError", "Contains requires a parenthesized argument list of 2 (target, item)")
    except Exception as e:
        if isinstance(e, (PopPopError, ReturnException, BreakException)):
            raise e
        raise PopPopError("RuntimeError", f"Error in Contains: {str(e)}")

BUILTIN_REGISTRY['Contains'] = builtin_Contains

def builtin_Append(current, env, evaluator):
    try:
        if isinstance(current, list) and len(current) == 2:
            target_list, item = current
            if isinstance(target_list, list):
                new_list = target_list.copy()
                new_list.append(item)
                return new_list
        raise PopPopError("TypeError", "Append requires a parenthesized argument list of 2 (list, item)")
    except Exception as e:
        if isinstance(e, (PopPopError, ReturnException, BreakException)):
            raise e
        raise PopPopError("RuntimeError", f"Error in Append: {str(e)}")

BUILTIN_REGISTRY['Append'] = builtin_Append

def builtin_Slice(current, env, evaluator):
    try:
        if isinstance(current, list):
            if len(current) == 2 and isinstance(current[1], list) and len(current[1]) == 2:
                target = current[0]
                start, end = current[1]
                if type(start) is int and type(end) is int and isinstance(target, (list, str)):
                    return target[start:end]
            elif len(current) == 3:
                target, start, end = current
                if type(start) is int and type(end) is int and isinstance(target, (list, str)):
                    return target[start:end]
            elif len(current) == 2:
                target, end = current
                if type(end) is int and isinstance(target, (list, str)):
                    return target[:end]
        raise PopPopError("TypeError", "Slice requires (target, start, end) or Slice(start, end) in pipe")
    except Exception as e:
        if isinstance(e, (PopPopError, ReturnException, BreakException)):
            raise e
        raise PopPopError("RuntimeError", f"Error in Slice: {str(e)}")

BUILTIN_REGISTRY['Slice'] = builtin_Slice

def builtin_Format(current, env, evaluator):
    try:
        if isinstance(current, list) and len(current) >= 2:
            template = current[0]
            data = current[1:]
            if isinstance(template, str):
                try:
                    if '%' in template:
                        return template % tuple(data)
                    if len(data) == 1 and isinstance(data[0], dict):
                        return template.format(**data[0])
                    return template.format(*data)
                except Exception as e:
                    raise PopPopError("RuntimeError", f"Format failed: {e}")
        raise PopPopError("TypeError", "Format requires a parenthesized argument list of at least 2 items (template, args...)")
    except Exception as e:
        if isinstance(e, (PopPopError, ReturnException, BreakException)):
            raise e
        raise PopPopError("RuntimeError", f"Error in Format: {str(e)}")

BUILTIN_REGISTRY['Format'] = builtin_Format

def builtin_Now(current, env, evaluator):
    try:
        import datetime
        now = datetime.datetime.now()
        return {
            'year': now.year,
            'month': now.month,
            'day': now.day,
            'hour': now.hour,
            'minute': now.minute,
            'second': now.second
        }
    except Exception as e:
        if isinstance(e, (PopPopError, ReturnException, BreakException)):
            raise e
        raise PopPopError("RuntimeError", f"Error in Now: {str(e)}")

BUILTIN_REGISTRY['Now'] = builtin_Now

def builtin_Random(current, env, evaluator):
    try:
        import random
        if (
            isinstance(current, list)
            and len(current) == 2
            and all(type(item) is int for item in current)
        ):
            min_val, max_val = current
            return random.randint(min_val, max_val)
        _raise_error("Random requires (Int, Int)")
        # JSON
    except Exception as e:
        if isinstance(e, (PopPopError, ReturnException, BreakException)):
            raise e
        raise PopPopError("RuntimeError", f"Error in Random: {str(e)}")

BUILTIN_REGISTRY['Random'] = builtin_Random

def builtin_ToJson(current, env, evaluator):
    try:
        import json
        try:
            return json.dumps(current, ensure_ascii=False)
        except Exception as e:
            raise PopPopError("RuntimeError", f"ToJson failed: {e}")
    except Exception as e:
        if isinstance(e, (PopPopError, ReturnException, BreakException)):
            raise e
        raise PopPopError("RuntimeError", f"Error in ToJson: {str(e)}")

BUILTIN_REGISTRY['ToJson'] = builtin_ToJson

def builtin_FromJson(current, env, evaluator):
    try:
        import json
        try:
            return json.loads(str(current))
        except Exception as e:
            raise PopPopError("RuntimeError", f"FromJson failed: {e}")

    # File I/O and network
    except Exception as e:
        if isinstance(e, (PopPopError, ReturnException, BreakException)):
            raise e
        raise PopPopError("RuntimeError", f"Error in FromJson: {str(e)}")

BUILTIN_REGISTRY['FromJson'] = builtin_FromJson

def builtin_Fetch(current, env, evaluator):
    try:
        target = str(current)
        try:
            if target.startswith('http://') or target.startswith('https://'):
                import urllib.request
                req = urllib.request.Request(target, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(req) as response:
                    return response.read().decode('utf-8')
            else:
                with open(target, 'r', encoding='utf-8') as f:
                    return f.read()
        except Exception as e:
            raise PopPopError("NetworkError" if target.startswith('http') else "IOError", f"Fetch failed for '{target}': {e}")

    except Exception as e:
        if isinstance(e, (PopPopError, ReturnException, BreakException)):
            raise e
        raise PopPopError("RuntimeError", f"Error in Fetch: {str(e)}")

def builtin_Dict(current, env, evaluator):
    if isinstance(current, dict):
        return current
    raise PopPopError("TypeError", f"Expected Dict, got {type(current).__name__}")

def builtin_List(current, env, evaluator):
    if isinstance(current, list):
        return current
    raise PopPopError("TypeError", f"Expected List, got {type(current).__name__}")

def builtin_Average(current, env, evaluator):
    try:
        if not isinstance(current, list) or not current:
            raise PopPopError("TypeError", "Average requires a non-empty List of numbers")
        if not all(type(item) in (int, float) for item in current):
            raise PopPopError("TypeError", "Average requires a non-empty List of numbers")
        return sum(current) / len(current)
    except Exception as e:
        raise PopPopError("RuntimeError", f"Error in Average: {str(e)}")

BUILTIN_REGISTRY['Average'] = builtin_Average

def builtin_Num(current, env, evaluator):
    try:
        if isinstance(current, bool):
            raise ValueError
        if isinstance(current, str) and not re.fullmatch(r"[+-]?(?:\d+(?:\.\d*)?|\.\d+)", current):
            raise ValueError
        val = float(current)
        if val.is_integer():
            return int(val)
        return val
    except Exception:
        raise PopPopError("TypeError", f"Cannot cast '{current}' to Num")

BUILTIN_REGISTRY['Dict'] = builtin_Dict
BUILTIN_REGISTRY['List'] = builtin_List
BUILTIN_REGISTRY['Num'] = builtin_Num
BUILTIN_REGISTRY['Fetch'] = builtin_Fetch

def builtin_PostFetch(current, env, evaluator):
    try:
        if isinstance(current, list) and len(current) == 3:
            target, headers, body = current
            try:
                import urllib.request
                req = urllib.request.Request(str(target), data=str(body).encode('utf-8'), headers=headers, method='POST')
                with urllib.request.urlopen(req) as response:
                    return response.read().decode('utf-8')
            except Exception as e:
                raise PopPopError("NetworkError", f"PostFetch failed: {e}")
        raise PopPopError("TypeError", "PostFetch requires a parenthesized argument list of 3 (url, headers_dict, body_string)")

    except Exception as e:
        if isinstance(e, (PopPopError, ReturnException, BreakException)):
            raise e
        raise PopPopError("RuntimeError", f"Error in PostFetch: {str(e)}")

BUILTIN_REGISTRY['PostFetch'] = builtin_PostFetch

def builtin_WriteFile(current, env, evaluator):
    try:
        if isinstance(current, list) and len(current) == 2:
            content, path = current
            try:
                with open(str(path), 'w', encoding='utf-8') as f:
                    f.write(str(content))
                return content
            except Exception as e:
                raise PopPopError("IOError", f"WriteFile failed: {e}")
        raise PopPopError("TypeError", "WriteFile requires a parenthesized argument list of 2 (content, path)")
    except Exception as e:
        if isinstance(e, (PopPopError, ReturnException, BreakException)):
            raise e
        raise PopPopError("RuntimeError", f"Error in WriteFile: {str(e)}")

BUILTIN_REGISTRY['WriteFile'] = builtin_WriteFile

def builtin_Display(current, env, evaluator):
    try:
        print(_display_value(current))
        return current
    except Exception as e:
        if isinstance(e, (PopPopError, ReturnException, BreakException)):
            raise e
        raise PopPopError("RuntimeError", f"Error in Display: {str(e)}")

BUILTIN_REGISTRY['Display'] = builtin_Display

async def builtin_Input(current, env, evaluator):
    try:
        prompt = str(current) if current is not None else ""
        import sys
        if 'pyodide' in sys.modules:
            from js import globalThis
            return await globalThis.waitForTerminalInput(prompt)
        else:
            # Fallback to standard input in regular Python CLI
            import asyncio
            return await asyncio.to_thread(input, prompt)
    except Exception as e:
        if isinstance(e, (PopPopError, ReturnException, BreakException)):
            raise e
        raise PopPopError("RuntimeError", f"Error in Input: {str(e)}")

BUILTIN_REGISTRY['Input'] = builtin_Input

def builtin_Int(current, env, evaluator):
    try:
        try:
            if isinstance(current, bool):
                raise ValueError
            if isinstance(current, str) and not re.fullmatch(r"[+-]?\d+", current):
                raise ValueError
            return int(current)
        except (ValueError, TypeError):
            _raise_error(f"Cannot cast '{current}' to Int")
    except Exception as e:
        if isinstance(e, (PopPopError, ReturnException, BreakException)):
            raise e
        raise PopPopError("RuntimeError", f"Error in Int: {str(e)}")

BUILTIN_REGISTRY['Int'] = builtin_Int

def builtin_Array(current, env, evaluator):
    try:
        if type(current) is int:
            dims = [current]
        elif isinstance(current, list) and all(type(d) is int for d in current):
            dims = list(current)
        else:
            _raise_error("Array requires an Int dimension or a List of Int dimensions")
        if not dims or any(dimension < 0 for dimension in dims):
            _raise_error("Array dimensions must be non-negative Int values")
        def make_array(dimensions):
            if len(dimensions) == 1:
                return [0 for _ in range(dimensions[0])]
            return [make_array(dimensions[1:]) for _ in range(dimensions[0])]
        return make_array(dims)
    except Exception as e:
        if isinstance(e, (PopPopError, ReturnException, BreakException)):
            raise e
        raise PopPopError("RuntimeError", f"Error in Array: {str(e)}")

BUILTIN_REGISTRY['Array'] = builtin_Array

def builtin_Range(current, env, evaluator):
    try:
        if isinstance(current, list) and len(current) == 2 and all(type(item) is int for item in current):
            return list(range(current[0], current[1] + 1))
        elif type(current) is int:
            return list(range(1, current + 1))
        _raise_error(f"Range expects Int or (Int, Int), got {current}")
    except Exception as e:
        if isinstance(e, (PopPopError, ReturnException, BreakException)):
            raise e
        raise PopPopError("RuntimeError", f"Error in Range: {str(e)}")

BUILTIN_REGISTRY['Range'] = builtin_Range

def builtin_Return(current, env, evaluator):
    try:
        raise ReturnException(current)
    except Exception as e:
        if isinstance(e, (PopPopError, ReturnException, BreakException)):
            raise e
        raise PopPopError("RuntimeError", f"Error in Return: {str(e)}")

BUILTIN_REGISTRY['Return'] = builtin_Return

def builtin_Break(current, env, evaluator):
    try:
        raise BreakException(current)
    except Exception as e:
        if isinstance(e, (PopPopError, ReturnException, BreakException)):
            raise e
        raise PopPopError("RuntimeError", f"Error in Break: {str(e)}")

BUILTIN_REGISTRY['Break'] = builtin_Break

def builtin_Str(current, env, evaluator):
    try:
        return str(current)
    except Exception as e:
        if isinstance(e, (PopPopError, ReturnException, BreakException)):
            raise e
        raise PopPopError("RuntimeError", f"Error in Str: {str(e)}")

BUILTIN_REGISTRY['Str'] = builtin_Str

def builtin_Bool(current, env, evaluator):
    if isinstance(current, bool):
        return current
    if isinstance(current, (int, float)):
        if current == 1:
            return True
        if current == 0:
            return False
    _raise_error("Bool accepts only true, false, 1, or 0")

BUILTIN_REGISTRY['Bool'] = builtin_Bool

def builtin_Zip(current, env, evaluator):
    if not isinstance(current, list) or not current or not all(isinstance(item, list) for item in current):
        _raise_error("Zip requires a non-empty parenthesized value list containing lists")
    return [list(row) for row in zip(*current)]

BUILTIN_REGISTRY['Zip'] = builtin_Zip

def builtin_Debug(current, env, evaluator):
    try:
        import json
        try:
            debug_str = json.dumps(current, indent=2, ensure_ascii=False, default=str)
        except Exception:
            debug_str = repr(current)
        print(f"[DEBUG] {debug_str}")
        return current
    except Exception as e:
        if isinstance(e, (PopPopError, ReturnException, BreakException)):
            raise e
        raise PopPopError("RuntimeError", f"Error in Debug: {str(e)}")

BUILTIN_REGISTRY['Debug'] = builtin_Debug

def builtin_Throw(current, env, evaluator):
    try:
        raise PopPopError("UserError", str(current))
    except Exception as e:
        if isinstance(e, (PopPopError, ReturnException, BreakException)):
            raise e
        raise PopPopError("RuntimeError", f"Error in Throw: {str(e)}")

BUILTIN_REGISTRY['Throw'] = builtin_Throw
