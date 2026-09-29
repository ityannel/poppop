import asyncio
from poppop_lang.lexer import Lexer
from poppop_lang.parser import Parser
from poppop_lang.evaluator import Evaluator, EvaluatorError
from poppop_lang.environment import Environment

def run_code(code):
    lexer = Lexer(code)
    tokens = lexer.tokenize()
    parser = Parser(tokens)
    ast = parser.parse()
    env = Environment()
    evaluator = Evaluator()
    asyncio.run(evaluator.eval(ast, env))
    return env.get_current()

def test_evaluator_basic():
    res = run_code("1 >> x. x + 2.")
    assert res == 3

def test_evaluator_builtin_math():
    res = run_code("[1, 2, 3] >> Length.")
    assert res == 3

def test_legacy_error_pipeline_is_rejected():
    try:
        run_code('"abc" >> Int >~> 0.')
    except Exception:
        return
    assert False, "legacy pipeline operators must be rejected"


def test_readme_map_pipeline():
    res = run_code(
        """
        [1, 2, 3] >> Map:
            @ * 2.
        .. >> doubled.
        doubled.
        """
    )
    assert res == [2, 4, 6]


def test_named_map_pipeline():
    res = run_code(
        """
        [1, 2, 3] >> Map(value):
            value * 2.
        .. >> doubled.
        doubled.
        """
    )
    assert res == [2, 4, 6]


def test_filter_pipeline():
    res = run_code(
        """
        [1, 2, 3, 4] >> Filter:
            @ % 2 == 0.
        .. >> evens.
        evens.
        """
    )
    assert res == [2, 4]


def test_reduce_pipeline():
    res = run_code(
        """
        [1, 2, 3, 4] >> Reduce:
            @[0] + @[1].
        .. >> total.
        total.
        """
    )
    assert res == 10


def test_named_reduce_pipeline_binds_the_pair():
    res = run_code(
        """
        [1, 2, 3, 4] >> Reduce(total):
            total[0] + total[1].
        .. >> total.
        total.
        """
    )
    assert res == 10


def test_zip_builtin():
    res = run_code(
        """
        ([1, 2], [10, 20]) >> Zip.
        """
    )
    assert res == [[1, 10], [2, 20]]


def test_zip_composes_with_map():
    res = run_code(
        """
        ([1, 2], [10, 20]) >> Zip >> Map(items):
            items[0] + items[1].
        .. >> sums.
        sums.
        """
    )
    assert res == [11, 22]


def test_sort_pipeline():
    res = run_code(
        """
        [{"name": "B", "score": 2}, {"name": "A", "score": 1}] >> Sort(entry):
            entry::score.
        .. >> ranked.
        ranked.
        """
    )
    assert [entry["name"] for entry in res] == ["A", "B"]


def test_sort_descending_marker_supports_strings():
    res = run_code(
        """
        [{"name": "A"}, {"name": "C"}, {"name": "B"}] >> Sort(entry):
            -entry::name.
        ..
        """
    )
    assert [entry["name"] for entry in res] == ["C", "B", "A"]


def test_group_pipeline():
    res = run_code(
        """
        [{"team": "red", "name": "A"}, {"team": "blue", "name": "B"}, {"team": "red", "name": "C"}] >> Group(entry):
            entry::team.
        .. >> teams.
        teams.
        """
    )
    assert [entry["name"] for entry in res["red"]] == ["A", "C"]
    assert [entry["name"] for entry in res["blue"]] == ["B"]


def test_group_rejects_collection_keys():
    try:
        run_code("[1, 2] >> Group(value): [value]. ..")
    except EvaluatorError:
        return
    assert False, "Group must reject list and dictionary keys"


def test_fork_pipeline():
    res = run_code(
        """
        [1, 2, 3] >> Fork:
            @ >> Sum.
            @ >> Max.
        .. >> statistics.
        statistics.
        """
    )
    assert res == [6, 3]


def test_named_fork_pipeline():
    res = run_code(
        """
        [1, 2, 3] >> Fork(values):
            values >> Sum.
            values >> Max.
        ..
        """
    )
    assert res == [6, 3]


def test_update_pipeline():
    res = run_code(
        """
        {"name": "Ada", "score": 10} >> Update:
            15 >> @::score.
            true >> @::active.
        .. >> user.
        user.
        """
    )
    assert res == {"name": "Ada", "score": 15, "active": True}


def test_named_update_pipeline():
    res = run_code(
        """
        {"name": "Ada", "score": 10} >> Update(user):
            15 >> user::score.
            true >> user::active.
        ..
        """
    )
    assert res == {"name": "Ada", "score": 15, "active": True}


def test_update_statements_see_previous_updates():
    res = run_code(
        """
        {"score": 10} >> Update(user):
            user::score + 5 >> user::score.
            user::score * 2 >> user::double.
        ..
        """
    )
    assert res == {"score": 15, "double": 30}


def test_update_rejects_target_before_value():
    try:
        run_code(
            """
            {"score": 10} >> Update:
                @::score >> 15.
            ..
            """
        )
    except EvaluatorError:
        return
    assert False, "Update must use value >> @::field"


def test_update_rejects_field_deletion():
    try:
        run_code(
            """
            {"score": 10} >> Update:
                Drop >> @::score.
            ..
            """
        )
    except EvaluatorError:
        return
    assert False, "Update must reject field deletion"


def test_dictionary_access():
    res = run_code('{"name": "PopPop"} >> project. project::name.')
    assert res == "PopPop"


def test_parenthesized_function_arguments():
    res = run_code(
        """
        (a, b) >> new AddTwo:
            a + b >> Return.
        ..
        (1, 2) >> AddTwo.
        """
    )
    assert res == 3


def test_plain_string_interpolation():
    res = run_code('7 >> value. "Value: {value}".')
    assert res == "Value: 7"


def test_standard_conversion_functions():
    assert run_code('"42" >> Int.') == 42
    assert run_code('0 >> Bool.') is False
    assert run_code('42 >> Str.') == "42"
    assert run_code('[1, 2] >> List.') == [1, 2]
    assert run_code('{"answer": 42} >> Dict.') == {"answer": 42}


def test_bool_accepts_only_booleans_zero_and_one():
    assert run_code('1 >> Bool.') is True
    assert run_code('1.0 >> Bool.') is True
    assert run_code('0.0 >> Bool.') is False
    for source in ('2 >> Bool.', '-1 >> Bool.', '"false" >> Bool.', 'null >> Bool.'):
        try:
            run_code(source)
        except EvaluatorError:
            continue
        assert False, f"Bool should reject {source}"


def test_interpolation_escaped_braces():
    assert run_code('"{{name}}".') == "{name}"
    assert run_code('7 >> value. "{{Value: {value}}}".') == "{Value: 7}"


def test_interpolation_undefined_name_is_an_error():
    try:
        run_code('"Hello, {missing}.".')
    except EvaluatorError:
        return
    assert False, "undefined interpolation names must raise a PopPop NameError"


def test_word_logical_operators():
    assert run_code("true and false.") is False
    assert run_code("false or true.") is True


def test_initial_implicit_value_is_null():
    assert run_code("@.") is None


def test_display_uses_poppop_value_spellings(capsys):
    assert run_code("@ >> Display.") is None
    assert capsys.readouterr().out == "null\n"

    assert run_code('[null, true, {"name": "PopPop"}] >> Display.') == [
        None,
        True,
        {"name": "PopPop"},
    ]
    assert capsys.readouterr().out == '[null, true, {"name": "PopPop"}]\n'


def test_boolean_operators_are_strict_and_short_circuit():
    assert run_code("false and missing.") is False
    assert run_code("true or missing.") is True
    try:
        run_code("1 and true.")
    except EvaluatorError:
        return
    assert False, "and must require Bool operands"


def test_map_rejects_dict_and_filter_requires_bool():
    for source in ('{"a": 1} >> Map: @. ..', '[1] >> Filter: @. ..'):
        try:
            run_code(source)
        except EvaluatorError:
            continue
        assert False, source


def test_set_is_non_destructive():
    assert run_code('([1, 2], 0, 9) >> Set.') == [9, 2]
    assert run_code('[1, 2] >> original. (original, 0, 9) >> Set. original.') == [1, 2]


def test_check_candidates_and_predicates_are_distinct():
    assert run_code('2 >> Check: is 1 or 2: "yes". else: "no". ..') == "yes"
    assert run_code('3 >> Check: is @ > 2: "yes". else: "no". ..') == "yes"


def test_type_returns_poppop_type_names():
    cases = {
        'null >> Type.': 'Null',
        'true >> Type.': 'Bool',
        '1 >> Type.': 'Int',
        '1.5 >> Type.': 'Num',
        '"x" >> Type.': 'Str',
        '[] >> Type.': 'List',
        '{} >> Type.': 'Dict',
    }
    for source, expected in cases.items():
        assert run_code(source) == expected


def test_equality_is_type_aware_and_recursive():
    assert run_code('true == 1.') is False
    assert run_code('[true, {"x": 1}] == [true, {"x": 1.0}].') is True


def test_user_function_arity_is_exact():
    try:
        run_code('(left, right) >> new AddTwo: left + right. .. [1] >> AddTwo.')
    except EvaluatorError:
        return
    assert False, "multi-parameter functions require the exact number of values"


def test_destructuring_bind_arity_is_exact():
    try:
        run_code('[1] >> (left, right).')
    except EvaluatorError:
        return
    assert False, "destructuring requires the exact number of values"


def test_builtin_errors_report_the_real_problem():
    import pytest
    from poppop_lang.evaluator import PopPopError

    with pytest.raises(PopPopError) as length_error:
        run_code("5 >> Length.")
    assert "Cannot get length" in str(length_error.value)
    assert "local variable" not in str(length_error.value)

    with pytest.raises(PopPopError) as thrown:
        run_code('"boom" >> Throw.')
    assert "boom" in str(thrown.value)
