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
        [1, 2, 3] >> Map {
            @ * 2.
        } >> doubled.
        doubled.
        """
    )
    assert res == [2, 4, 6]


def test_inline_map_pipeline():
    assert run_code("[1, 2, 3] >> Map as x { x * 2. } >> doubled. doubled.") == [2, 4, 6]


def test_named_map_pipeline():
    res = run_code(
        """
        [1, 2, 3] >> Map as value {
            value * 2.
        } >> doubled.
        doubled.
        """
    )
    assert res == [2, 4, 6]


def test_filter_pipeline():
    res = run_code(
        """
        [1, 2, 3, 4] >> Filter {
            @ % 2 == 0.
        } >> evens.
        evens.
        """
    )
    assert res == [2, 4]


def test_reduce_with_and_without_initial_value():
    assert run_code("[1, 2, 3, 4] >> Reduce(0) as (acc, item) { acc + item. }") == 10
    assert run_code("[] >> Reduce(42) as (acc, item) { acc + item. }") == 42
    assert run_code("[1, 2, 3, 4] >> Reduce as (acc, item) { acc + item. }") == 10
    assert run_code("[1, 2, 3, 4] >> Reduce { @[0] + @[1]. }") == 10
    expect_error("[] >> Reduce as (acc, item) { acc + item. }", "RuntimeError")


def test_zip_builtin_and_pipe_extra_args():
    assert run_code("([1, 2], [10, 20]) >> Zip.") == [[1, 10], [2, 20]]
    assert run_code("[1, 2] >> Zip([10, 20]).") == [[1, 10], [2, 20]]
    assert (
        run_code("([1, 2], [10, 20]) >> Zip >> Map as (a, b) { a + b. }")
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
    asc = run_code(code + "users >> Sort as u { u::score. }")
    assert [u["name"] for u in asc] == ["Bob", "Ada", "Cara"]

    desc = run_code(code + "users >> SortDesc as u { u::score. }")
    assert [u["name"] for u in desc] == ["Ada", "Cara", "Bob"]

    by_name_desc = run_code(code + "users >> SortDesc as u { u::name. }")
    assert [u["name"] for u in by_name_desc] == ["Cara", "Bob", "Ada"]

    expect_error('[1, "a"] >> Sort { @. }', "RuntimeError")
    expect_error("[true, false] >> Sort { @. }", "RuntimeError")


def test_group_pipeline():
    res = run_code(
        """
        [
            {"team": "red", "name": "A"},
            {"team": "blue", "name": "B"},
            {"team": "red", "name": "C"}
        ] >> Group as member {
            member::team.
        } >> teams.
        teams.
        """
    )
    assert list(res.keys()) == ["red", "blue"]
    assert [entry["name"] for entry in res["red"]] == ["A", "C"]
    assert [entry["name"] for entry in res["blue"]] == ["B"]
    expect_error("[1, 2] >> Group as value { [value]. }", "TypeError")


def test_fork_unlabeled_and_labeled():
    assert (
        run_code(
            """
            [1, 2, 3] >> Fork {
                @ >> Sum.
                @ >> Max.
            }
            """
        )
        == [6, 3]
    )
    stats = run_code(
        """
        [1, 2, 3] >> Fork as values {
            total: values >> Sum.
            max:   values >> Max.
        }
        """
    )
    assert stats == {"total": 6, "max": 3}
    assert list(stats.keys()) == ["total", "max"]


def test_update_pipeline():
    res = run_code(
        """
        {"name": "Ada", "score": 10} >> Update as user {
            15 >> user::score.
            user::score * 2 >> user::double.
            true >> user::active.
        }
        """
    )
    assert res == {"name": "Ada", "score": 15, "double": 30, "active": True}
    expect_error('{"score": 10} >> Update { @::score >> 15. }', "RuntimeError")


def test_dictionary_access_and_error_types():
    assert run_code('{"name": "PopCorn"} >> project. project::name.') == "PopCorn"
    expect_error('{"name": "PopCorn"} >> p. p::missing.', "KeyError")
    expect_error("[1, 2] >> xs. xs[5].", "IndexError")
    expect_error("[1, 2] >> xs. xs[-1].", "IndexError")
    expect_error("[1, 2] >> xs. xs[1.5].", "TypeError")
    expect_error('[1, 2] >> xs. xs["a"].', "TypeError")
    expect_error('{"a": 1} >> d. d[0].', "TypeError")


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
    (left, right) >> pop AddTwo {
        left + right.
    }
    """
    assert run_code(code + "(10, 20) >> AddTwo.") == 30
    assert run_code(code + "10 >> AddTwo(20).") == 30
    expect_error(code + "[10, 20] >> AddTwo.", "RuntimeError")

    single = """
    (items) >> pop Head {
        items[0].
    }
    [10, 20] >> Head.
    """
    assert run_code(single) == 10


def test_pipe_extra_arguments_chain():
    assert run_code('"a,b,c" >> Split(",") >> Join("-") >> Uppercase.') == "A-B-C"
    assert run_code('{"name": "Ada"} >> Get("nickname", "名無し").') == "名無し"
    assert run_code('{"name": "Ada"} >> Get("name", "名無し").') == "Ada"


def test_at_resets_across_statements_in_block():
    code = """
    [5] >> Map {
        @ * 2 >> doubled.
        @ + doubled.
    }
    """
    assert run_code(code) == [15]


def test_parenthesized_pipeline_in_expression():
    assert run_code("([1, 2] >> Length) + 1.") == 3
    assert run_code("[10] >> Map { ([1, 2] >> Length) + @. }") == [12]


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
    assert run_code('"[1, 2.5]" >> FromJson >> Map { @ >> Type. }') == ["Num", "Num"]

    # Int builtin is removed
    expect_error('"42" >> Int.', "NameError")

    # Interpolation
    assert run_code('"Ada" >> person. "Hello, {person}!".') == "Hello, Ada!"
    assert run_code('"{{name}}".') == "{name}"
    assert run_code('7 >> value. "{{Value: {value}}}".') == "{Value: 7}"
    assert run_code('\'Dict: { {"a": 1}::a }\'.') == "Dict: 1"
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
    expect_error("[1] >> Filter { @. }", "TypeError")
    expect_error('1 >> Check { when @ { "yes". } else { "no". } }', "TypeError")


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
    expect_error("[1, 2, 3] >> Slice(-1, 2).", "IndexError")
    expect_error("[1, 2, 3] >> Slice(2, 1).", "IndexError")
    expect_error("[1, 2, 3] >> Slice(0, 5).", "IndexError")
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
            (0, 0) >> Loop as (count, total) {
                total >> Break when count >= 5.
                (count + 1, total + count).
            } >> result.
            result.
            """
        )
        == 10
    )

    # Spec Section 4 Return with postfix when
    assert (
        run_code(
            """
            (items) >> pop FirstOrSelf {
                items >> Return when (items >> Length) <= 1.
                items[0].
            }
            [42] >> FirstOrSelf.
            """
        )
        == [42]
    )
    assert (
        run_code(
            """
            (items) >> pop FirstOrSelf {
                items >> Return when (items >> Length) <= 1.
                items[0].
            }
            [10, 20] >> FirstOrSelf.
            """
        )
        == 10
    )


def test_check_block():
    assert (
        run_code(
            """
            2 >> Check as value {
                when value == 0 {
                    "zero".
                }
                when value in [1, 2, 3] {
                    "small".
                }
                when value >= 4 {
                    "large".
                }
                else {
                    value >> Str.
                }
            }
            """
        )
        == "small"
    )


def test_try_and_catch():
    assert (
        run_code(
            """
            "abc" >> Try {
                @ >> Num.
            } Catch as err {
                [err::type, err::message].
            }
            """
        )[0]
        == "TypeError"
    )
    assert (
        run_code(
            """
            "42" >> Try {
                @ >> Num.
            } Catch as err {
                0.
            }
            """
        )
        == 42
    )
    assert (
        run_code(
            """
            "boom" >> Try {
                @ >> Throw.
            } Catch as err {
                err::type + ":" + err::message.
            }
            """
        )
        == "UserError:boom"
    )
    assert (
        run_code(
            """
            (x) >> pop Early {
                x >> Try {
                    99 >> Return.
                } Catch as err {
                    -1.
                }
            }
            1 >> Early.
            """
        )
        == 99
    )
    assert (
        run_code(
            """
            0 >> Loop {
                @ >> Try {
                    7 >> Break.
                } Catch as err {
                    -1.
                }
            }
            """
        )
        == 7
    )


def test_functions_closures_mutual_recursion_and_return():
    assert (
        run_code(
            """
            10 >> base.
            (x) >> pop AddBase {
                x + base.
            }
            999 >> base.
            5 >> AddBase.
            """
        )
        == 15
    )
    assert (
        run_code(
            """
            (n) >> pop IsEven {
                true >> Return when n == 0.
                (n - 1) >> IsOdd.
            }
            (n) >> pop IsOdd {
                false >> Return when n == 0.
                (n - 1) >> IsEven.
            }
            6 >> IsEven.
            """
        )
        is True
    )
    assert (
        run_code(
            """
            (value, min, max) >> pop Clamp {
                value >> Check {
                    when @ < min {
                        min >> Return.
                    }
                    when @ > max {
                        max >> Return.
                    }
                    else {
                        @.
                    }
                }
            }
            150 >> Clamp(0, 100).
            """
        )
        == 100
    )
    assert (
        run_code(
            """
            (xs) >> pop FindNeg {
                xs >> Map as x {
                    x >> Return when x < 0.
                    x.
                }
                0.
            }
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
    assert run_code("[1, 2, 3] >> Map as x { x * 2 }") == [2, 4, 6]
    assert run_code("[1, 2, 3] >> Map as x { x * 2 >> y. y + 1 }") == [3, 5, 7]
    assert (
        run_code(
            """
            (a, b) >> pop Add {
                a + b
            }
            10 >> Add(20).
            """
        )
        == 30
    )
    assert (
        run_code(
            """
            2 >> Check as v {
                when v == 0 {
                    "zero"
                }
                when v in [1, 2, 3] {
                    "small"
                }
                else {
                    "other"
                }
            }
            """
        )
        == "small"
    )
    # Postfix when inside a Check branch followed by another Check branch
    assert (
        run_code(
            """
            (n) >> pop Classify {
                n >> Check {
                    when @ > 0 {
                        "huge" >> Return when @ > 100.
                        "positive"
                    }
                    when @ == 0 {
                        "zero"
                    }
                    else {
                        "negative"
                    }
                }
            }
            [200, 5, 0, -3] >> Map as x { x >> Classify }
            """
        )
        == ["huge", "positive", "zero", "negative"]
    )
    assert (
        run_code(
            """
            [1, 2, 3] >> Fork as xs {
                total: xs >> Sum.
                max: xs >> Max
            }
            """
        )
        == {"total": 6, "max": 3}
    )
    assert (
        run_code(
            """
            {"score": 10} >> Update as u {
                u::score + 5 >> u::score
            }
            """
        )
        == {"score": 15}
    )
    assert (
        run_code(
            """
            (0, 0) >> Loop as (count, total) {
                total >> Break when count >= 5.
                (count + 1, total + count)
            }
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
    assert run_code('{"name": "ada", "score": 1} >> Update as user { user::name >> Uppercase >> user::name. } >> u. u.') == {"name": "ADA", "score": 1}
    assert run_code('{"name": "ada"} >> Update { @::name >> Uppercase >> @::name. } >> u. u.') == {"name": "ADA"}
    assert run_code('{"n": 2} >> Update as d { d::n >> Add(5) >> d::n. d::n >> Add(1) >> d::n. } >> u. u.') == {"n": 8}
    assert run_code('{"score": 1} >> Update as user { 15 >> user::score. } >> u. u.') == {"score": 15}


def test_update_rejects_a_target_that_is_not_a_field():
    expect_error('{"n": 1} >> Update as d { 5 >> d. } >> u.', "RuntimeError")


def test_check_branches_use_braces():
    code = """
    2 >> Check as value {
        when value == 0 { "zero". }
        when value in [1, 2, 3] { "small" }
        else { "large" }
    } >> label.
    label.
    """
    assert run_code(code) == "small"


def test_check_with_the_old_colon_form_explains_the_new_shape():
    for code in ('1 >> Check { when @ == 1: "yes". else { "no". } }', '1 >> Check { when @ == 1 { "yes". } else: "no". }'):
        try:
            run_code(code)
        except Exception as exc:
            assert "Check branches use braces" in str(exc), str(exc)
        else:
            raise AssertionError("old Check form must be rejected")
