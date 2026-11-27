import asyncio
import http.server
import threading

from popcorn_lang.lexer import Lexer
from popcorn_lang.parser import Parser
from popcorn_lang.evaluator import Evaluator, EvaluatorError, PopCornError
from popcorn_lang.environment import Environment


def run_code(code):
    lexer = Lexer(code)
    tokens = lexer.tokenize()
    parser = Parser(tokens)
    ast = parser.parse()
    env = Environment()
    evaluator = Evaluator()
    return asyncio.run(evaluator.eval(ast, env))


def expect_error(code, expected_type=None):
    try:
        run_code(code)
    except PopCornError as exc:
        if expected_type is not None:
            assert exc.err_type == expected_type, f"expected {expected_type}, got {exc.err_type}: {exc.message}"
        return exc
    except EvaluatorError as exc:
        if expected_type is not None:
            assert False, f"expected PopCornError({expected_type}), got EvaluatorError: {exc}"
        return exc
    assert False, f"expected error ({expected_type}) for:\n{code}"


def test_evaluator_basic():
    assert run_code("1 >> x. x + 2.") == 3


def test_evaluator_builtin_math():
    assert run_code("[1, 2, 3] >> Length.") == 3


def test_legacy_error_pipeline_is_rejected():
    try:
        run_code('"abc" >> Num >~> 0.')
    except Exception:
        return
    assert False, "legacy pipeline operators must be rejected"


def test_readme_map_pipeline():
    res = run_code(
        """
        [1, 2, 3] >> Map:
            @ * 2.
        >> doubled.
        doubled.
        """
    )
    assert res == [2, 4, 6]


def test_inline_map_pipeline():
    assert run_code("[1, 2, 3] >> Map as x:\n    x * 2.\n>> doubled. doubled.") == [2, 4, 6]


def test_named_map_pipeline():
    res = run_code(
        """
        [1, 2, 3] >> Map as value:
            value * 2.
        >> doubled.
        doubled.
        """
    )
    assert res == [2, 4, 6]


def test_filter_pipeline():
    res = run_code(
        """
        [1, 2, 3, 4] >> Filter:
            @ % 2 == 0.
        >> evens.
        evens.
        """
    )
    assert res == [2, 4]


def test_reduce_with_and_without_initial_value():
    assert run_code("[1, 2, 3, 4] >> Reduce(0) as (acc, item):\n    acc + item.") == 10
    assert run_code("[] >> Reduce(42) as (acc, item):\n    acc + item.") == 42
    assert run_code("[1, 2, 3, 4] >> Reduce as (acc, item):\n    acc + item.") == 10
    assert run_code("[1, 2, 3, 4] >> Reduce:\n    @[0] + @[1].") == 10
    expect_error("[] >> Reduce as (acc, item):\n    acc + item.", "RuntimeError")


def test_zip_builtin_and_pipe_extra_args():
    assert run_code("([1, 2], [10, 20]) >> Zip.") == [[1, 10], [2, 20]]
    assert run_code("[1, 2] >> Zip([10, 20]).") == [[1, 10], [2, 20]]
    assert (
        run_code("([1, 2], [10, 20]) >> Zip >> Map as (a, b):\n    a + b.")
        == [11, 22]
    )


def test_sort_and_sort_desc():
    code = """
    [
        {"name": "Ada", "score": 20},
        {"name": "Bob", "score": 10},
        {"name": "Cara", "score": 20}
    ] >> users.
    """
    asc = run_code(code + "users >> Sort as u:\n        u::score.")
    assert [u["name"] for u in asc] == ["Bob", "Ada", "Cara"]

    desc = run_code(code + "users >> SortDesc as u:\n        u::score.")
    assert [u["name"] for u in desc] == ["Ada", "Cara", "Bob"]

    by_name_desc = run_code(code + "users >> SortDesc as u:\n        u::name.")
    assert [u["name"] for u in by_name_desc] == ["Cara", "Bob", "Ada"]

    # 比べられないキーは、< と同じく TypeError
    expect_error('[1, "a"] >> Sort:\n    @.', "TypeError")
    expect_error("[true, false] >> Sort:\n    @.", "TypeError")


def test_group_pipeline():
    res = run_code(
        """
        [
            {"team": "red", "name": "A"},
            {"team": "blue", "name": "B"},
            {"team": "red", "name": "C"}
        ] >> Group as member:
            member::team.
        >> teams.
        teams.
        """
    )
    assert list(res.keys()) == ["red", "blue"]
    assert [entry["name"] for entry in res["red"]] == ["A", "C"]
    assert [entry["name"] for entry in res["blue"]] == ["B"]
    expect_error("[1, 2] >> Group as value:\n    [value].", "TypeError")


def test_fork_unlabeled_and_labeled():
    assert (
        run_code(
            """
            [1, 2, 3] >> Fork:
                @ >> Sum.
                @ >> Max.
            """
        )
        == [6, 3]
    )
    stats = run_code(
        """
        [1, 2, 3] >> Fork as values:
            total: values >> Sum.
            max:   values >> Max.
        """
    )
    assert stats == {"total": 6, "max": 3}
    assert list(stats.keys()) == ["total", "max"]


def test_update_pipeline():
    res = run_code(
        """
        {"name": "Ada", "score": 10} >> Update as user:
            15 >> user::score.
            user::score * 2 >> user::double.
            true >> user::active.
        """
    )
    assert res == {"name": "Ada", "score": 15, "double": 30, "active": True}
    expect_error('{"score": 10} >> Update:\n    @::score >> 15.', "RuntimeError")


def test_dictionary_access_and_error_types():
    assert run_code('{"name": "PopCorn"} >> project. project::name.') == "PopCorn"
    expect_error('{"name": "PopCorn"} >> p. p::missing.', "KeyError")
    expect_error("[1, 2] >> xs. xs[5].", "IndexError")
    assert run_code("[1, 2] >> xs. xs[-1].") == 2
    expect_error("[1, 2] >> xs. xs[-3].", "IndexError")
    expect_error("[1, 2] >> xs. xs[1.5].", "TypeError")
    expect_error('[1, 2] >> xs. xs["a"].', "TypeError")
    expect_error('{"a": 1} >> d. d[0].', "TypeError")


def test_read_field_of_current_value_mid_pipeline():
    src = '`{"city": "東京", "tags": ["a", "b"]}` >> raw. '
    assert run_code(src + "raw >> FromJson >> @::city.") == "東京"
    assert run_code(src + "raw >> FromJson >> (@::city).") == "東京"
    assert run_code(src + "raw >> FromJson >> @::tags[-1] >> Uppercase.") == "B"
    assert run_code(src + "raw >> FromJson >> @::city >> c. c.") == "東京"
    expect_error(src + "raw >> FromJson >> @::nope.", "KeyError")
    # 名前つきの値のフィールドへ流すのは、これまでどおり代入の誤りとして知らせる
    expect_error('{"a": 1} >> d. 5 >> d::a.', "RuntimeError")


def test_tuple_vs_list_semantics():
    assert run_code("(1, 2) >> Type.") == "Tuple"
    assert run_code("[1, 2] >> Type.") == "List"
    assert run_code("(1, 2) >> List.") == [1, 2]
    assert run_code("(1, 2) >> List >> Type.") == "List"
    assert run_code("(1, 2) == [1, 2].") is False
    assert run_code("(1, 2) == (1, 2.0).") is True
    assert run_code("(1, 2) >> Length.") == 2
    assert run_code("(1, 2) >> Str.") == "(1, 2)"

    code = """
    (left, right) >> pop AddTwo:
        left + right.
    """
    assert run_code(code + "(10, 20) >> AddTwo.") == 30
    assert run_code(code + "10 >> AddTwo(20).") == 30
    expect_error(code + "[10, 20] >> AddTwo.", "RuntimeError")

    single = """
    (items) >> pop Head:
        items[0].
    [10, 20] >> Head.
    """
    assert run_code(single) == 10


def test_pipe_extra_arguments_chain():
    assert run_code('"a,b,c" >> Split(",") >> Join("-") >> Uppercase.') == "A-B-C"
    assert run_code('{"name": "Ada"} >> Get("nickname", "名無し").') == "名無し"
    assert run_code('{"name": "Ada"} >> Get("name", "名無し").') == "Ada"


def test_at_resets_across_statements_in_block():
    code = """
    [5] >> Map:
        @ * 2 >> doubled.
        @ + doubled.
    """
    assert run_code(code) == [15]


def test_parenthesized_pipeline_in_expression():
    assert run_code("([1, 2] >> Length) + 1.") == 3
    assert run_code("[10] >> Map:\n    ([1, 2] >> Length) + @.") == [12]


def test_unified_num_type_str_and_json():
    assert run_code("42 >> Type.") == "Num"
    assert run_code("3.14 >> Type.") == "Num"
    assert run_code("1 == 1.0.") is True
    assert run_code("null >> Str.") == "null"
    assert run_code("true >> Str.") == "true"
    assert run_code("false >> Str.") == "false"
    assert run_code("42 >> Str.") == "42"
    assert run_code("42.0 >> Str.") == "42"
    assert run_code("-7 >> Str.") == "-7"
    assert run_code("3.14 >> Str.") == "3.14"
    assert run_code("1.0 >> Str.") == "1"
    assert run_code('"Ada" >> Str.') == "Ada"
    assert run_code("[1, 2, 3] >> Str.") == "[1, 2, 3]"
    assert run_code('{"name": "Ada", "age": 30} >> Str.') == '{"name": "Ada", "age": 30}'
    assert run_code("(1, 2) >> Str.") == "(1, 2)"
    assert run_code("[1, 2, 3] >> ToJson.") == "[1, 2, 3]"
    assert run_code('"[1, 2.5]" >> FromJson >> Map:\n    @ >> Type.') == ["Num", "Num"]

    # Int builtin is removed
    expect_error('"42" >> Int.', "NameError")

    # Interpolation
    assert run_code('"Ada" >> person. "Hello, {person}!".') == "Hello, Ada!"
    assert run_code('"{{name}}".') == "{name}"
    assert run_code('7 >> value. "{{Value: {value}}}".') == "{Value: 7}"
    assert run_code('"Dict: { {"a": 1}::a }".') == "Dict: 1"
    assert run_code('"{true} {null} {1.0}".') == "true null 1"
    expect_error('"Hello, {missing}.".', "NameError")


def test_numeric_rules_div_round_infinity():
    assert run_code("4 / 2.") == 2.0
    assert run_code("4 / 2 >> Type.") == "Num"
    assert run_code("7 >> Div(2).") == 3
    assert run_code("-7 >> Div(2).") == -3
    assert run_code("7 >> Div(-2).") == -3
    assert run_code("7 >> Div(2) >> Type.") == "Num"
    expect_error("7 >> Div(0).", "RuntimeError")
    expect_error("7.5 >> Div(2).", "TypeError")

    assert run_code('"5" >> Num.') == 5.0
    assert run_code('"5.5" >> Num >> Type.') == "Num"
    expect_error("true >> Num.", "TypeError")

    # Round half away from zero
    assert run_code("2.5 >> Round.") == 3
    assert run_code("1.5 >> Round.") == 2
    assert run_code("-2.5 >> Round.") == -3
    assert run_code("-1.5 >> Round.") == -2
    assert run_code("42 >> Round >> Type.") == "Num"

    # Float infinity -> RuntimeError
    expect_error(
        "100000000000000000000 >> x. x * x >> x. x * x >> x. x * x >> x. x * x.",
        "RuntimeError",
    )


def test_in_operator_and_strict_bool():
    assert run_code("5 in [1, 3, 5].") is True
    assert run_code("2 in [1, 3, 5].") is False
    assert run_code('"a" in {"a": 1}.') is True
    assert run_code('"b" in {"a": 1}.') is False
    assert run_code('"Pop" in "PopCorn".') is True
    assert run_code("false and missing.") is False
    assert run_code("true or missing.") is True
    expect_error("1 and true.", "TypeError")
    expect_error("not 0.", "TypeError")
    expect_error("[1] >> Filter:\n    @.", "TypeError")
    expect_error('1 >> Check:\n    when @:\n        "yes".\n    else:\n        "no".', "TypeError")


def test_new_collection_builtins():
    assert run_code('{"a": 1, "b": 2} >> Remove("a").') == {"b": 2}
    assert run_code('{"a": 1} >> Remove("missing").') == {"a": 1}
    assert run_code('{"a": 1, "b": 2} >> Keys.') == ["a", "b"]
    assert run_code('{"a": 1, "b": 2} >> Values.') == [1, 2]
    assert run_code('{"a": 1, "b": 2} >> Entries.') == [["a", 1], ["b", 2]]
    assert run_code("(1, 4) >> Range.") == [1, 2, 3, 4]
    assert run_code("(5, 2) >> Range.") == []
    expect_error("5 >> Range.", "TypeError")
    expect_error("(1.5, 4) >> Range.", "TypeError")
    assert run_code("[10, 20, 30, 40] >> Slice(1, 3).") == [20, 30]
    assert run_code("[10, 20, 30, 40] >> Slice(2).") == [10, 20]
    assert run_code('"PopCorn" >> Slice(0, 3).') == "Pop"
    # 負の添字は、うしろから数える
    assert run_code("[1, 2, 3] >> Slice(-1).") == [1, 2]
    assert run_code('"hello" >> Slice(-3, -1).') == "ll"
    assert run_code("[1, 2, 3] >> Slice(-2, 3).") == [2, 3]
    assert run_code("[1, 2, 3] >> Slice(-3).") == []
    expect_error("[1, 2, 3] >> Slice(-4).", "IndexError")
    expect_error("[1, 2, 3] >> Slice(-1, 1).", "IndexError")
    expect_error("[1, 2, 3] >> Slice(2, 1).", "IndexError")
    # 長さをはみ出した範囲は、ある分だけを返す
    assert run_code("[1, 2, 3] >> Slice(0, 5).") == [1, 2, 3]
    assert run_code('"abc" >> Slice(1, 10).') == "bc"
    assert run_code('"abc" >> Slice(5, 10).') == ""
    expect_error("[1, 2, 3] >> Slice(0.5, 2).", "TypeError")
    expect_error("[] >> Average.", "RuntimeError")
    expect_error("[] >> Max.", "RuntimeError")
    expect_error("[] >> Min.", "RuntimeError")
    assert run_code("[] >> Sum.") == 0
    expect_error("(5, 1) >> Random.", "RuntimeError")
    expect_error("-1 >> Sleep.", "RuntimeError")


def test_postfix_when_and_loop():
    # Postfix when skips statement when false, executes when true
    assert run_code("10 >> x. 99 >> x when false. x.") == 10
    assert run_code("10 >> x. 99 >> x when true. x.") == 99
    expect_error("10 >> x when 1.", "TypeError")

    # Spec Section 11 Loop example with postfix when
    assert (
        run_code(
            """
            (0, 0) >> Loop as (count, total):
                total >> Break when count >= 5.
                (count + 1, total + count).
            >> result.
            result.
            """
        )
        == 10
    )

    # Spec Section 4 Return with postfix when
    assert (
        run_code(
            """
            (items) >> pop FirstOrSelf:
                items >> Return when (items >> Length) <= 1.
                items[0].
            [42] >> FirstOrSelf.
            """
        )
        == [42]
    )
    assert (
        run_code(
            """
            (items) >> pop FirstOrSelf:
                items >> Return when (items >> Length) <= 1.
                items[0].
            [10, 20] >> FirstOrSelf.
            """
        )
        == 10
    )


def test_check_block():
    assert (
        run_code(
            """
            2 >> Check as value:
                when value == 0:
                    "zero".
                when value in [1, 2, 3]:
                    "small".
                when value >= 4:
                    "large".
                else:
                    value >> Str.
            """
        )
        == "small"
    )


def test_try_and_catch():
    assert (
        run_code(
            """
            "abc" >> Try:
                @ >> Num.
            Catch as err:
                [err::type, err::message].
            """
        )[0]
        == "TypeError"
    )
    assert (
        run_code(
            """
            "42" >> Try:
                @ >> Num.
            Catch as err:
                0.
            """
        )
        == 42
    )
    assert (
        run_code(
            """
            "boom" >> Try:
                @ >> Throw.
            Catch as err:
                err::type + ":" + err::message.
            """
        )
        == "UserError:boom"
    )
    assert (
        run_code(
            """
            (x) >> pop Early:
                x >> Try:
                    99 >> Return.
                Catch as err:
                    -1.
            1 >> Early.
            """
        )
        == 99
    )
    assert (
        run_code(
            """
            0 >> Loop:
                @ >> Try:
                    7 >> Break.
                Catch as err:
                    -1.
            """
        )
        == 7
    )


def test_functions_closures_mutual_recursion_and_return():
    assert (
        run_code(
            """
            10 >> base.
            (x) >> pop AddBase:
                x + base.
            999 >> base.
            5 >> AddBase.
            """
        )
        == 15
    )
    assert (
        run_code(
            """
            (n) >> pop IsEven:
                true >> Return when n == 0.
                (n - 1) >> IsOdd.
            (n) >> pop IsOdd:
                false >> Return when n == 0.
                (n - 1) >> IsEven.
            6 >> IsEven.
            """
        )
        is True
    )
    assert (
        run_code(
            """
            (value, min, max) >> pop Clamp:
                value >> Check:
                    when @ < min:
                        min >> Return.
                    when @ > max:
                        max >> Return.
                    else:
                        @.
            150 >> Clamp(0, 100).
            """
        )
        == 100
    )
    assert (
        run_code(
            """
            (xs) >> pop FindNeg:
                xs >> Map as x:
                    x >> Return when x < 0.
                    x.
                0.
            [1, 2, -5, 4] >> FindNeg.
            """
        )
        == -5
    )
    expect_error("1 >> Return.", "RuntimeError")
    expect_error("1 >> Break.", "RuntimeError")


def test_readfile_and_writefile(tmp_path):
    target = (tmp_path / "note.txt").as_posix()
    assert run_code(f'"hello popcorn" >> WriteFile("{target}").') == "hello popcorn"
    assert run_code(f'"{target}" >> ReadFile.') == "hello popcorn"
    expect_error(f'"{target}.missing" >> ReadFile.', "IOError")
    expect_error(f'"{target}" >> Fetch.', "NetworkError")


def test_http_builtins_local_server():
    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path == "/ok":
                self.send_response(200)
                self.send_header("X-Test", "pop")
                self.end_headers()
                self.wfile.write(b"hello-get")
            else:
                self.send_response(404)
                self.end_headers()
                self.wfile.write(b"not-found")

        def do_POST(self):
            length = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(length).decode("utf-8")
            self.send_response(200)
            self.end_headers()
            self.wfile.write(f"echo:{body}".encode("utf-8"))

        def log_message(self, format, *args):
            pass

    server = http.server.HTTPServer(("127.0.0.1", 0), Handler)
    port = server.server_address[1]
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        base = f"http://127.0.0.1:{port}"
        assert run_code(f'"{base}/ok" >> Fetch.') == "hello-get"
        expect_error(f'"{base}/missing" >> Fetch.', "NetworkError")
        assert run_code(f'"payload" >> PostFetch("{base}/echo").') == "echo:payload"
        resp = run_code(f'("GET", "{base}/missing", {{}}, "") >> HttpRequest.')
        assert resp["status"] == 404
        assert type(resp["status"]) is float
        assert resp["body"] == "not-found"
        assert isinstance(resp["headers"], dict)
    finally:
        server.shutdown()
        server.server_close()


def test_display_and_debug_output(capsys):
    assert run_code("@ >> Display.") is None
    assert capsys.readouterr().out == "null\n"

    assert run_code('[null, true, {"name": "PopCorn"}] >> Display.') == [
        None,
        True,
        {"name": "PopCorn"},
    ]
    assert capsys.readouterr().out == '[null, true, {"name": "PopCorn"}]\n'

    assert run_code("42 >> Debug.") == 42
    assert capsys.readouterr().out == "[DEBUG] (Num) 42\n"


def test_destructuring_bind():
    assert run_code("(10, 20) >> (a, b). a + b.") == 30
    assert run_code("[10, 20] >> (a, b). a + b.") == 30
    expect_error("[1] >> (left, right).", "RuntimeError")
    expect_error("42 >> (left, right).", "TypeError")


def test_bool_strict_conversion():
    assert run_code("1 >> Bool.") is True
    assert run_code("1.0 >> Bool.") is True
    assert run_code("0 >> Bool.") is False
    assert run_code("0.0 >> Bool.") is False
    for source in ("2 >> Bool.", "-1 >> Bool.", '"false" >> Bool.', "null >> Bool."):
        expect_error(source, "TypeError")


def test_set_is_non_destructive():
    assert run_code("[1, 2] >> Set(0, 9).") == [9, 2]
    assert run_code("[1, 2] >> original. original >> Set(0, 9). original.") == [1, 2]
    expect_error("[1, 2] >> Set(5, 9).", "IndexError")


def test_optional_trailing_dot_in_blocks_evaluates():
    assert run_code("[1, 2, 3] >> Map as x:\n    x * 2") == [2, 4, 6]
    assert run_code("[1, 2, 3] >> Map as x:\n    x * 2 >> y. y + 1") == [3, 5, 7]
    assert (
        run_code(
            """
            (a, b) >> pop Add:
                a + b
            10 >> Add(20).
            """
        )
        == 30
    )
    assert (
        run_code(
            """
            2 >> Check as v:
                when v == 0:
                    "zero"
                when v in [1, 2, 3]:
                    "small"
                else:
                    "other"
            """
        )
        == "small"
    )
    # Postfix when inside a Check branch followed by another Check branch
    assert (
        run_code(
            """
            (n) >> pop Classify:
                n >> Check:
                    when @ > 0:
                        "huge" >> Return when @ > 100.
                        "positive"
                    when @ == 0:
                        "zero"
                    else:
                        "negative"
            [200, 5, 0, -3] >> Map as x:
                x >> Classify
            """
        )
        == ["huge", "positive", "zero", "negative"]
    )
    assert (
        run_code(
            """
            [1, 2, 3] >> Fork as xs:
                total: xs >> Sum.
                max: xs >> Max
            """
        )
        == {"total": 6, "max": 3}
    )
    assert (
        run_code(
            """
            {"score": 10} >> Update as u:
                u::score + 5 >> u::score
            """
        )
        == {"score": 15}
    )
    assert (
        run_code(
            """
            (0, 0) >> Loop as (count, total):
                total >> Break when count >= 5.
                (count + 1, total + count)
            """
        )
        == 10
    )


def test_modulo_sign_follows_the_dividend():
    assert run_code("7 % 3.") == 1
    assert run_code("-7 % 3.") == -1
    assert run_code("7 % -3.") == 1
    assert run_code("-7 % -3.") == -1
    assert run_code("5.5 % 2.") == 1.5
    assert run_code("-5.5 % 2.") == -1.5


def test_modulo_never_returns_negative_zero():
    import math
    res = run_code("-6 % 3.")
    assert res == 0 and math.copysign(1.0, res) == 1.0


def test_modulo_by_zero_is_a_runtime_error():
    expect_error("5 % 0.", "RuntimeError")


def test_modulo_and_div_keep_the_division_identity():
    for a, b in [(7, 3), (-7, 3), (7, -3), (-7, -3), (6, 3), (-6, 3), (0, 5)]:
        code = f"(({a}), ({b})) >> Div >> q. (q * ({b})) + (({a}) % ({b}))."
        assert run_code(code) == a, (a, b)


def test_odd_check_and_wraparound_idioms_with_negative_numbers():
    assert run_code("-3 % 2 != 0.") is True
    assert run_code("((-1 % 5) + 5) % 5.") == 4


def test_update_accepts_a_pipeline_on_the_left_side():
    assert run_code('{"name": "ada", "score": 1} >> Update as user:\n    user::name >> Uppercase >> user::name.\n>> u. u.') == {"name": "ADA", "score": 1}
    assert run_code('{"name": "ada"} >> Update:\n    @::name >> Uppercase >> @::name.\n>> u. u.') == {"name": "ADA"}
    assert run_code('{"n": 2} >> Update as d:\n    d::n >> Add(5) >> d::n. d::n >> Add(1) >> d::n.\n>> u. u.') == {"n": 8}
    assert run_code('{"score": 1} >> Update as user:\n    15 >> user::score.\n>> u. u.') == {"score": 15}


def test_update_rejects_a_target_that_is_not_a_field():
    expect_error('{"n": 1} >> Update as d:\n    5 >> d.\n>> u.', "RuntimeError")


def test_check_branches_use_braces():
    code = """
    2 >> Check as value:
        when value == 0:
            "zero".
        when value in [1, 2, 3]:
            "small"
        else:
            "large"
    >> label.
    label.
    """
    assert run_code(code) == "small"


def test_check_branches_may_use_a_colon_body():
    # `:` の本体は、その行の終わりまで（次の行の字下げが深ければ、そこまで）
    assert run_code('2 >> Check:\n    when @ == 1:\n        "yes".\n    else: "no".') == "no"
    code = """
2 >> Check as value:
    when value == 0:
        "zero".
    when value in [1, 2, 3]:
        "small".
    else:
        "large".
>> label.
label.
"""
    assert run_code(code) == "small"


def test_colon_body_must_not_share_its_line_with_the_next_branch():
    for code, message in (
        ('1 >> Check:\n    when @ == 1: "yes" else: "no"', "start 'else' on a new line"),
        ('5 >> Check: when @ > 1: "a" else: "b"', "on the next line"),
    ):
        try:
            run_code(code)
        except Exception as exc:
            assert message in str(exc), str(exc)
        else:
            raise AssertionError("one-line colon branches must be rejected")


def test_return_and_break_can_stand_alone_with_when():
    code = """
    pop First:
        Return when @ == 0.
        99.
    0 >> First >> a.
    5 >> First >> b.
    [a, b].
    """
    assert run_code(code) == [0, 99]
    assert run_code("0 >> Loop as n:\n    Break when n >= 3. n + 1.") == 3


def test_block_forms_still_need_the_pipe_and_a_block():
    import pytest
    from popcorn_lang.parser import ParseError
    for source in ("Map.", "Check.", "Loop.", "Try."):
        with pytest.raises(ParseError):
            run_code(source)


def test_user_defined_process_can_stand_alone_too():
    code = """
    pop Double:
        @ * 2.
    [1, 2, 3] >> Map:
        Double.
    """
    assert run_code(code) == [2, 4, 6]
def test_math_standard_functions():
    import math
    assert run_code("3.7 >> Floor.") == 3
    assert run_code("-3.2 >> Floor.") == -4
    assert run_code("3.2 >> Ceil.") == 4
    assert run_code("-3.7 >> Ceil.") == -3
    assert run_code("16 >> Sqrt.") == 4
    assert run_code("(2, 10) >> Pow.") == 1024
    assert run_code("2 >> Pow(3).") == 8
    assert run_code("0 >> Exp.") == 1
    assert run_code("1 >> Log.") == 0
    assert math.isclose(run_code("(8, 2) >> Log."), 3)
    assert math.isclose(run_code("8 >> Log(2)."), 3)
    assert math.isclose(run_code("Pi * 2."), 2 * math.pi)
    assert math.isclose(run_code("E."), math.e)
    assert math.isclose(run_code("Pi / 2 >> Sin."), 1)
    assert math.isclose(run_code("0 >> Cos."), 1)
    assert math.isclose(run_code("0 >> Tan."), 0, abs_tol=1e-12)
    assert run_code("-3.2 >> Ceil >> Str.") == "-3"  # -0 は出ない


def test_round_floor_ceil_with_digits():
    assert run_code("3.14159 >> Round(2).") == 3.14
    assert run_code("1234 >> Round(-2).") == 1200
    assert run_code("1250 >> Round(-2).") == 1300
    assert run_code("3.7 >> Round.") == 4
    assert run_code("3.7 >> Round(0).") == 4
    assert run_code("(3.14159, 3) >> Round.") == 3.142
    # 小数の表記どおりに四捨五入（2進数の誤差で 1.00 にならない）
    assert run_code("1.005 >> Round(2).") == 1.01
    assert run_code("2.675 >> Round(2).") == 2.68
    assert run_code("-1.25 >> Round(1).") == -1.3
    assert run_code("0.1 + 0.2 >> Round(2).") == 0.3
    assert run_code("19.8 * 3 >> Round(1) >> Str.") == "59.4"
    assert run_code("-0.001 >> Round(2) >> Str.") == "0"  # -0 は出ない
    assert run_code("3.14159 >> Floor(2).") == 3.14
    assert run_code("-3.14159 >> Floor(2).") == -3.15
    assert run_code("1299 >> Floor(-2).") == 1200
    assert run_code("3.14159 >> Ceil(2).") == 3.15
    assert run_code("1201 >> Ceil(-2).") == 1300
    assert run_code("5 >> Round(400).") == 5
    assert run_code("5 >> Round(-400).") == 0
    expect_error("3.1 >> Round(1.5).", "TypeError")
    expect_error('3.1 >> Round("2").', "TypeError")
    expect_error('"a" >> Floor(1).', "TypeError")


def test_math_standard_functions_report_domain_errors():
    expect_error("-1 >> Sqrt.", "RuntimeError")
    expect_error("0 >> Log.", "RuntimeError")
    expect_error("-1 >> Log.", "RuntimeError")
    expect_error("(8, 1) >> Log.", "RuntimeError")
    expect_error("(8, 0) >> Log.", "RuntimeError")
    expect_error("(-8, 0.5) >> Pow.", "RuntimeError")
    expect_error("(0, -1) >> Pow.", "RuntimeError")
    expect_error("(10, 1000) >> Pow.", "RuntimeError")
    expect_error("1000 >> Exp.", "RuntimeError")
    expect_error('"a" >> Floor.', "TypeError")
    expect_error("(1, 2, 3) >> Pow.", "TypeError")


def test_trim_unique_flatten_enumerate():
    assert run_code('"  hi  " >> Trim.') == "hi"
    assert run_code('"\u3000こんにちは\u3000" >> Trim.') == "こんにちは"
    expect_error("1 >> Trim.", "TypeError")
    assert run_code('[1, 1.0, 2, [1], [1.0], true, true, null, null, "a", "a"] >> Unique.') == [1, 2, [1], True, None, "a"]
    assert run_code("[1, true] >> Unique.") == [1, True]  # 1 と true は、別の値
    assert run_code("[[1, 2], 3, [4], []] >> Flatten.") == [1, 2, 3, 4]
    assert run_code("[[1, [2]]] >> Flatten.") == [1, [2]]  # 1 段だけ
    assert run_code('["a", "b"] >> Enumerate.') == [[0, "a"], [1, "b"]]
    assert run_code("[] >> Enumerate.") == []
    expect_error("1 >> Unique.", "TypeError")
    expect_error('"a" >> Flatten.', "TypeError")


def test_from_entries_is_the_inverse_of_entries():
    assert run_code('[["a", 1], ["b", 2]] >> FromEntries.') == {"a": 1, "b": 2}
    assert run_code('{"a": 1, "b": 2} >> Entries >> FromEntries.') == {"a": 1, "b": 2}
    assert run_code('[["a", 1], ["a", 2]] >> FromEntries.') == {"a": 2}
    assert run_code("[] >> FromEntries.") == {}
    expect_error('[["a"]] >> FromEntries.', "TypeError")
    expect_error("[[1, 2]] >> FromEntries.", "TypeError")
    expect_error("1 >> FromEntries.", "TypeError")


def test_get_path_never_fails_on_missing_keys():
    data = '{"user": {"tags": ["x", "y"], "name": "Ada"}}'
    assert run_code(f'({data}, ["user", "tags", 1]) >> GetPath.') == "y"
    assert run_code(f'({data}, ["user", "name"]) >> GetPath.') == "Ada"
    assert run_code(f'({data}, ["user", "missing"]) >> GetPath.') is None
    assert run_code(f'({data}, ["user", "tags", 5], "none") >> GetPath.') == "none"
    assert run_code(f'({data}, ["user", "tags", -1], "none") >> GetPath.') == "none"
    assert run_code(f'({data}, ["user", "tags", 0.5], "none") >> GetPath.') == "none"
    assert run_code(f'({data}, ["user", 0], "none") >> GetPath.') == "none"
    assert run_code(f'({data}, ["user", "name", "x"], "none") >> GetPath.') == "none"
    assert run_code(f'({data}, []) >> GetPath.') == {"user": {"tags": ["x", "y"], "name": "Ada"}}
    assert run_code(f'{data} >> GetPath(["user", "name"]).') == "Ada"
    expect_error(f'({data}, "user") >> GetPath.', "TypeError")
    expect_error("1 >> GetPath.", "TypeError")


def test_env_reads_environment_variables():
    import os
    os.environ["POPCORN_TEST_VAR"] = "hello"
    try:
        assert run_code('"POPCORN_TEST_VAR" >> Env.') == "hello"
    finally:
        del os.environ["POPCORN_TEST_VAR"]
    assert run_code('"POPCORN_SURELY_UNSET_VARIABLE" >> Env.') is None
    expect_error("1 >> Env.", "TypeError")


def test_args_returns_the_script_arguments():
    assert run_code("Args.") == []
    assert run_code("Args >> Length.") == 0
    evaluator = Evaluator()
    evaluator.script_args = ["a", "b"]
    ast = Parser(Lexer("Args.").tokenize()).parse()
    assert asyncio.run(evaluator.eval(ast, Environment())) == ["a", "b"]


def test_new_standard_functions_are_documented():
    from pathlib import Path
    from popcorn_lang.pop_builtins import BUILTIN_REGISTRY
    root = Path(__file__).resolve().parents[1]
    spec = (root / "popcorn_specification.md").read_text(encoding="utf-8")
    hover = (root / "vscode-popcorn" / "language-features.js").read_text(encoding="utf-8")
    new_names = ("Floor Ceil Sqrt Pow Exp Log Sin Cos Tan Pi E Trim Unique Flatten Enumerate FromEntries GetPath Env Args "
                 "Fixed StartsWith EndsWith IndexOf Prepend Insert First Last Repeat PadStart PadEnd Match FindAll ReplaceAll").split()
    for name in new_names:
        assert name in BUILTIN_REGISTRY, name
        assert f"| `{name}` |" in spec, f"{name} is missing from the spec table"
        assert f"    {name}: {{ description:" in hover, f"{name} is missing from the editor hover table"
def test_retry_recipe_from_the_spec_works():
    # 仕様書の「やり直す」と同じ形（通信の代わりに、2 回失敗してから成功する処理）
    recipe = '''
    (0, null) >> Loop as (attempt, last):
        last >> Break when last != null.
        null >> Break when attempt >= LIMIT.
        attempt >> Try:
            @ >> Check as n:
                when n < FAILS:
                    "boom" >> Throw.
                else:
                    "ok".
        Catch:
            null.
        >> response.
        (attempt + 1, response).
    >> result.
    result.
    '''
    assert run_code(recipe.replace("LIMIT", "5").replace("FAILS", "2")) == "ok"      # 2 回失敗して、3 回目で成功
    assert run_code(recipe.replace("LIMIT", "2").replace("FAILS", "5")) is None      # 上限に達して、あきらめる
    assert run_code(recipe.replace("LIMIT", "5").replace("FAILS", "0")) == "ok"      # 1 回目で成功


FIZZBUZZ_COLON = """
(num) >> pop FizzBuzz:
    num >> Check:
        when num % 15 == 0: "FizzBuzz"
        when num % 3 == 0: "Fizz"
        when num % 5 == 0: "Buzz"
        else: num

(1, 20) >> Range >> Map (@ >> FizzBuzz) >> result.
result.
"""

FIZZBUZZ_EXPECTED = [
    1, 2, "Fizz", 4, "Buzz", "Fizz", 7, 8, "Fizz", "Buzz",
    11, "Fizz", 13, 14, "FizzBuzz", 16, 17, "Fizz", 19, "Buzz",
]


def test_fizzbuzz_with_colon_bodies_and_a_parenthesized_map():
    assert run_code(FIZZBUZZ_COLON) == FIZZBUZZ_EXPECTED


def test_process_name_body_applies_the_process_to_each_item():
    # 処理名渡し: Map FizzBuzz は Map { @ >> FizzBuzz } と同じ
    code = FIZZBUZZ_COLON.replace("Map (@ >> FizzBuzz)", "Map FizzBuzz")
    assert run_code(code) == FIZZBUZZ_EXPECTED


def test_short_stream_bodies():
    is_even = "(n) >> pop IsEven:\n    n % 2 == 0\n\n"
    assert run_code(is_even + "[1, 2, 3, 4] >> Filter IsEven.") == [2, 4]
    assert run_code("[1, 2, 3, 4] >> Filter (@ % 2 == 0).") == [2, 4]
    assert run_code("[1, 2] >> Map as x (x * 10).") == [10, 20]
    assert run_code('[{"a": 1}, {"a": 2}] >> Map Get("a").') == [1, 2]
    assert run_code("[[1, 2], [3]] >> Map Length.") == [2, 1]
    assert run_code('["b", "C", "a"] >> Sort Lowercase.') == ["a", "b", "C"]
    assert run_code("[1, 2, 3] >> Reduce Add.") == 6
    assert run_code("[1, 2, 3] >> Reduce(10) Add.") == 16


def test_process_name_body_rejects_block_forms():
    for code in ("[1] >> Map Check.", "[1] >> Filter Return."):
        try:
            run_code(code)
        except Exception as exc:
            assert "process-name body" in str(exc), str(exc)
        else:
            raise AssertionError(f"must be rejected: {code}")


def test_colon_bodies_for_every_block_form():
    assert run_code("[1, 2] >> Map as x:\n    x * 3\n>> Sum >> t.\nt + 1.") == 10
    assert run_code('0 >> Try:\n    1 >> Get(5)\nCatch as e:\n    e::type\n>> r.\nr.') == "TypeError"
    assert run_code("[1, 2] >> Fork:\n    a: Sum.\n    b: Length\n>> r.\nr.") == {"a": 3, "b": 2}
    assert run_code('{"n": 1} >> Update as d:\n    2 >> d::n\n>> r.\nr.') == {"n": 2}
    loop = "0 >> Loop as i:\n    i >> Break when i >= 3.\n    i + 1\n>> r.\nr."
    assert run_code(loop) == 3


def test_colon_body_ends_at_a_shallower_line_and_inside_brackets():
    code = """
(xs) >> pop Total:
    xs >> Reduce(0) as (acc, x):
        acc + x

[
1, 2,
3
] >> Total >> r.
r.
"""
    assert run_code(code) == 6
    assert run_code("[1, 2] >> Map (@ >> Check:\n    when @ == 1: \"one\"\n    else: \"other\") >> r.\nr.") == ["one", "other"]


def test_colon_body_needs_something_after_the_colon():
    try:
        run_code("(n) >> pop F:\n(1) >> Display.")
    except Exception as exc:
        assert "Expected an indented body" in str(exc), str(exc)
    else:
        raise AssertionError("empty colon body must be rejected")


def test_brace_blocks_are_gone_but_dict_braces_stay():
    for code in ("[1] >> Map { @ }.", "(n) >> pop F { n }", "1 >> Check { when @ == 1: 1\n else: 2 }"):
        try:
            run_code(code)
        except Exception as exc:
            assert "not braces" in str(exc), str(exc)
        else:
            raise AssertionError(f"brace block must be rejected: {code}")
    assert run_code('{"a": {"b": 1}} >> d. d::a::b.') == 1
    assert run_code('[{"a": 1}] >> Map (@::a).') == [1]


def test_migrate_keeps_the_meaning():
    from popcorn_lang.migrate import migrate_braces
    old = 'x >> Check { when @ < 0 { "n" } else { "p" } } >> s.'
    assert migrate_braces(old) == 'x >> Check:\n    when @ < 0:\n        "n"\n    else:\n        "p"\n>> s.'
    old = '"x" >> Try {\n    @ >> Num.\n} Catch as err {\n    0.\n} >> r.'
    assert migrate_braces(old) == '"x" >> Try:\n    @ >> Num.\nCatch as err:\n    0.\n>> r.'
    assert migrate_braces("1 >> x.") == "1 >> x."


def test_count_returns_how_many_items_match():
    code = """
["kati", "tuka", "mimi", "su", "rata", "piku", "nana"] >> words.
words >> Map Slice(-1, Length) >> lasts.
lasts >> Count (@ == "a") >> noun.
lasts >> Count (@ == "i") >> verb.
lasts >> Count (not (@ in ["a", "i"])) >> others.
"NOUN: {noun} times. VERB: {verb} times. OTHERS: {others} times.".
"""
    assert run_code(code) == "NOUN: 3 times. VERB: 2 times. OTHERS: 2 times."
    assert run_code("[] >> Count (@ > 1).") == 0
    assert run_code("[1, 2, 3, 4] >> Count as n:\n    n % 2 == 0\n>> r.\nr.") == 2
    is_even = "(n) >> pop IsEven:\n    n % 2 == 0\n\n"
    assert run_code(is_even + "[1, 2, 3, 4, 6] >> Count IsEven.") == 3
    expect_error("[1] >> Count (@).", "TypeError")
    expect_error("5 >> Count (@ > 1).", "TypeError")


def test_extra_arguments_may_be_pipelines():
    assert run_code('"kati" >> Slice((@ >> Length) - 1, @ >> Length).') == "i"
    assert run_code('["ab", "cd"] >> Map (@ >> Slice((@ >> Length) - 1, @ >> Length)).') == ["b", "d"]


def test_not_in_and_not_binds_looser_than_comparison():
    assert run_code('"u" not in ["a", "i"].') is True
    assert run_code('"a" not in ["a", "i"].') is False
    assert run_code('not "u" in ["a"].') is True
    assert run_code('not 1 == 2.') is True
    assert run_code('["a", "u", "i", "e"] >> Count (@ not in ["a", "i"]).') == 2
    assert run_code('"ab" not in "xaby".') is False


def test_one_line_colon_body_is_only_for_branches_and_functions():
    # `Map: @ * 2 >> d.` は `>> d` まで本体に入ってしまうので、エラーで案内する
    try:
        run_code("[1, 2] >> Map: @ * 2 >> d.")
    except Exception as exc:
        assert "next line" in str(exc) and "Map (...)" in str(exc), str(exc)
    else:
        raise AssertionError("one-line Map body must be rejected")
    assert run_code("(n) >> pop Double: n * 2\n\n3 >> Double.") == 6
    assert run_code('2 >> Check:\n    when @ == 1: "one"\n    else: "other"\n>> r.\nr.') == "other"


def test_negative_indices_count_from_the_end_everywhere():
    assert run_code("[10, 20, 30] >> xs. xs[-1].") == 30
    assert run_code("[10, 20, 30] >> Get(-2).") == 20
    assert run_code("[10, 20, 30] >> Get(-4, 0).") == 0
    assert run_code("[10, 20, 30] >> Set(-1, 99).") == [10, 20, 99]
    expect_error("[10] >> Get(-2).", "IndexError")


def test_process_parameters_take_the_expression_unevaluated():
    my_filter = "(xs, Keep) >> pop MyFilter:\n    xs >> Filter Keep.\n\n"
    assert run_code(my_filter + "[1, 2, 3, 4] >> MyFilter(@ % 2 == 0).") == [2, 4]
    is_even = "(n) >> pop IsEven:\n    n % 2 == 0\n\n"
    assert run_code(is_even + my_filter + "[1, 2, 3, 4] >> MyFilter(IsEven).") == [2, 4]
    fold = "(xs, init, Step) >> pop Fold:\n    xs >> Reduce(init) as (a, x):\n        (a, x) >> Step.\n\n"
    assert run_code(fold + "[1, 2, 3] >> Fold(10, @[0] + @[1]).") == 16
    assert run_code(fold + "3 >> k.\n[1, 2, 3] >> Fold(0, @[0] + @[1] * k).") == 18
    assert run_code("(x, F) >> pop Twice:\n    x >> F >> F.\n\n5 >> Twice(@ * 3).") == 45
    expect_error(my_filter + "([1, 2], 5) >> MyFilter.", "TypeError")
    expect_error("(x, F) >> pop G:\n    x >> F(1).\n\n1 >> G(@).", "RuntimeError")


def test_process_parameter_names_must_not_be_block_forms():
    for code in ("(x, Map) >> pop F:\n    x.", "(X) >> pop F:\n    1."):
        try:
            run_code(code)
        except Exception:
            continue
        raise AssertionError(f"must be rejected: {code}")


# ---- パイプラインの `>?>`（途中を覗く）と `>!>`（失敗したら差し替える） ----


def test_tap_pipe_shows_the_value_with_its_line_and_passes_it_on(capsys):
    result = run_code("(1, 4) >> Range\n    >?> Filter (@ % 2 == 0) >?> Map (@ * 10) >> out.\nout.")
    assert result == [20, 40]
    assert capsys.readouterr().out == (
        "[>?> line 2 after Range] (List) [1, 2, 3, 4]\n"
        "[>?> line 2 after Filter] (List) [2, 4]\n"
    )


def test_tap_pipe_before_a_binding(capsys):
    assert run_code('"7" >> Num >?> d.\nd + 1.') == 8
    assert capsys.readouterr().out == "[>?> line 1 after Num] (Num) 7\n"


def test_tap_pipe_needs_a_next_stage():
    from popcorn_lang.parser import ParseError

    try:
        Parser(Lexer('"x" >?> .').tokenize()).parse()
    except ParseError as exc:
        assert ">?>" in str(exc)
    else:
        assert False, "expected ParseError"


def test_fallback_pipe_replaces_an_error_on_its_left():
    assert run_code('"abc" >> Trim >> Num >!> 200 >> c.\nc.') == 200
    assert run_code('" 5 " >> Trim >> Num >!> 200 >> c.\nc.') == 5


def test_fallback_pipe_gives_the_error_as_current_value():
    assert run_code('"abc" >> Num >!> "{@::type}: failed".') == "TypeError: failed"


def test_fallback_pipe_right_side_runs_only_on_error():
    assert run_code('0 >> n.\n1 >> Num >!> (1 >> n) >> x.\nn.') == 0


def test_fallback_pipe_covers_everything_on_its_left_and_only_that():
    # 左ぜんぶ（Input の代わりに Throw）を守る
    assert run_code('"boom" >> Throw >> Num >!> 1.') == 1
    # 右側のあとで起きたエラーは、守らない
    expect_error('"abc" >> Num >!> 0 >> Throw.', "UserError")
    # 2 つ目の >!> は、1 つ目の差し替えも含めた左ぜんぶを守る
    assert run_code('"abc" >> Num >!> "x" >> Num >!> 9.') == 9


def test_fallback_pipe_value_is_not_a_binding():
    expect_error('"abc" >> Num >!> fallback.', "NameError")


def test_fallback_pipe_lets_break_and_return_through():
    code = "pop F:\n    1 >> Return >!> 2.\n    3.\nF."
    assert run_code(code) == 1


def test_user_input_example_with_tap_and_fallback(monkeypatch, capsys):
    answers = iter([" 42 ", "abc"])
    monkeypatch.setattr("builtins.input", lambda prompt="": next(answers))
    code = (
        '"整数: " >> Input >> Trim >> Num >?> d.\n'
        '"実数: " >> Input >> Trim >> Num >!> 200 >?> c.\n'
        "(d, c)."
    )
    assert run_code(code) == (42, 200)
    out = capsys.readouterr().out
    assert "[>?> line 1 after Num] (Num) 42" in out
    assert "[>?> line 2] (Num) 200" in out


# ---- Fork の 1 行書き ----


def test_fork_one_line_form_returns_a_list_in_order():
    assert run_code("[1, 2, 3] >> Fork(Sum, Average, Max * 10).") == [6, 2, 30]


def test_fork_one_line_form_destructures():
    assert run_code("[4, 8] >> Fork(Min, Max) >> (low, high).\nhigh - low.") == 4


def test_fork_one_line_form_with_alias_and_pipelines():
    assert run_code('"a,b" >> Fork as s (s >> Split(","), s >> Length).') == [["a", "b"], 3]


def test_fork_one_line_form_rejects_labels():
    from popcorn_lang.parser import ParseError

    try:
        Parser(Lexer("[1] >> Fork(total: Sum).").tokenize()).parse()
    except ParseError as exc:
        assert "Fork:" in str(exc)
    else:
        assert False, "expected ParseError"
