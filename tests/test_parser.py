from popcorn_lang.lexer import Lexer
from popcorn_lang.parser import ParseError, Parser
from popcorn_lang.ast_nodes import *


def parse_code(code):
    lexer = Lexer(code)
    tokens = lexer.tokenize()
    parser = Parser(tokens)
    return parser.parse()


def test_parser_pipeline():
    ast = parse_code("1 >> x.")
    assert len(ast.statements) == 1
    pipe = ast.statements[0]
    assert isinstance(pipe, Pipeline)
    assert len(pipe.nodes) == 2
    assert isinstance(pipe.nodes[0], LiteralNode)
    assert pipe.nodes[0].value == 1.0
    assert isinstance(pipe.nodes[1], BindNode)


def test_parser_single_node_no_bind():
    ast = parse_code("x.")
    pipe = ast.statements[0]
    assert len(pipe.nodes) == 1
    assert isinstance(pipe.nodes[0], VariableNode)


def test_parser_fstring():
    ast = parse_code('"Hello {name}".')
    pipe = ast.statements[0]
    fstr = pipe.nodes[0]
    assert isinstance(fstr, InterpolatedStringNode)
    assert len(fstr.parts) == 2


def test_parenthesized_values_are_function_input():
    ast = parse_code("(first, second) >> Add.")
    values = ast.statements[0].nodes[0]
    assert isinstance(values, ArgumentListNode)
    assert len(values.items) == 2


def test_pipe_extra_arguments():
    ast = parse_code('"a,b,c" >> Split(",") >> Join("-").')
    nodes = ast.statements[0].nodes
    assert isinstance(nodes[1], FunctionCallNode)
    assert nodes[1].name == "Split"
    assert len(nodes[1].args) == 1
    assert isinstance(nodes[2], FunctionCallNode)
    assert nodes[2].name == "Join"
    assert len(nodes[2].args) == 1


def test_standalone_function_call_without_pipe_is_rejected():
    for bad in ("Add(1, 2).", 'Split("a,b", ",").', "Display."):
        try:
            parse_code(bad)
        except ParseError:
            continue
        assert False, f"standalone call must be rejected: {bad}"


def test_implicit_value_is_allowed_as_program_input():
    ast = parse_code("@ >> Display.")
    assert isinstance(ast.statements[0].nodes[0], ImplicitVariableNode)


def test_implicit_value_is_allowed_after_program_input():
    ast = parse_code("1 >> @ >> Display.")
    assert isinstance(ast.statements[0].nodes[1], ImplicitVariableNode)


def test_reduce_accepts_initial_value_and_destructuring_alias():
    ast = parse_code("[1, 2] >> Reduce(0) as (acc, item) { acc + item. }")
    block = ast.statements[0].nodes[1]
    assert isinstance(block, StreamBlockNode)
    assert block.stream_type == "Reduce"
    assert isinstance(block.init_expr, LiteralNode)
    assert block.init_expr.value == 0.0
    assert block.var_names == ["acc", "item"]


def test_stream_block_rejects_legacy_block_delimiters():
    for legacy in (
        "[1] >> Map(x): x * 2. ..",
        "[1] >> Map as x (: x * 2. :)",
    ):
        try:
            parse_code(legacy)
        except ParseError:
            continue
        assert False, f"legacy block syntax must be rejected: {legacy}"


def test_double_colon_rejects_numeric_list_index():
    try:
        parse_code("values::0.")
    except ParseError:
        return
    assert False, ":: must not accept a numeric list index"


def test_brackets_accept_list_index():
    ast = parse_code("values[0].")
    assert isinstance(ast.statements[0].nodes[0], IndexAccessNode)


def test_fork_labeled_and_unlabeled():
    unlabeled = parse_code(
        "[1, 2] >> Fork as values { values >> Sum. values >> Max. }"
    ).statements[0].nodes[1]
    assert unlabeled.var_names == ["values"]
    assert unlabeled.labeled_entries is None
    assert len(unlabeled.block.pipelines) == 2

    labeled = parse_code(
        "[1, 2] >> Fork as values { total: values >> Sum. max: values >> Max. }"
    ).statements[0].nodes[1]
    assert labeled.var_names == ["values"]
    assert labeled.labeled_entries is not None
    assert [e.label for e in labeled.labeled_entries] == ["total", "max"]


def test_fork_rejects_mixing_labeled_and_unlabeled():
    try:
        parse_code("[1, 2] >> Fork { total: @ >> Sum. @ >> Max. }")
    except ParseError:
        return
    assert False, "Fork must reject mixing labeled and unlabeled branches"


def test_zip_is_not_a_stream_block():
    try:
        parse_code("([1], [2]) >> Zip as row { row. }")
    except ParseError:
        return
    assert False, "Zip must be a standard function, not a stream block"


def test_at_name_is_not_a_variable_form():
    try:
        parse_code("@value.")
    except ParseError:
        return
    assert False, "@name must not be accepted"


def test_check_requires_when_and_else():
    for bad in (
        '1 >> Check { else: "no". }',
        '1 >> Check { when @ == 1: "yes". }',
    ):
        try:
            parse_code(bad)
        except ParseError:
            continue
        assert False, f"invalid Check must be rejected: {bad}"


def test_postfix_when_statement():
    ast = parse_code("items >> Return when (items >> Length) <= 1.")
    stmt = ast.statements[0]
    assert isinstance(stmt, ConditionalStatementNode)
    assert isinstance(stmt.pipeline, Pipeline)
    assert isinstance(stmt.condition, ExpressionNode)


def test_try_catch_syntax():
    ast = parse_code("1 >> Try { @. } Catch as err { err::message. }")
    node = ast.statements[0].nodes[1]
    assert isinstance(node, TryCatchBlock)
    assert node.catch_alias_names == ["err"]

    try:
        parse_code("1 >> Try { @. }")
    except ParseError:
        return
    assert False, "Try without Catch must be rejected"


def test_nested_function_def_is_rejected():
    try:
        parse_code("[1] >> Map { (x) >> pop Inner { x. } @. }")
    except ParseError:
        return
    assert False, "FunctionDefinition must only be allowed at top level"


def test_comparison_operators_are_non_associative():
    try:
        parse_code("1 < 2 < 3.")
    except ParseError:
        return
    assert False, "chained comparisons must be rejected as non-associative"


def test_parenthesized_pipeline_in_expression():
    ast = parse_code("([1, 2] >> Length) + 1.")
    expr = ast.statements[0].nodes[0]
    assert isinstance(expr, ExpressionNode)
    assert isinstance(expr.left, GroupedPipelineNode)


def test_optional_trailing_dot_inside_blocks():
    # Single statement in block without trailing dot
    parse_code("[1, 2, 3] >> Map as x { x * 2 } >> doubled.")
    # Multi-statement block: earlier statement requires dot, last omits dot
    parse_code("[1, 2] >> Map as x { x * 2 >> y. y + 1 }")
    # Function body omitting trailing dot
    parse_code("(a, b) >> pop Add { a + b }")
    # Check branches omitting trailing dot before next when / else / }
    parse_code('2 >> Check as v { when v == 0: "zero" when v == 2: "two" else: "other" }')
    # Fork unlabeled and labeled omitting trailing dot on last branch
    parse_code("[1, 2] >> Fork { @ >> Sum. @ >> Max }")
    parse_code("[1, 2] >> Fork { total: @ >> Sum. max: @ >> Max }")
    # Update omitting trailing dot on last statement
    parse_code('{"a": 1} >> Update as u { 2 >> u::a }')
    # Postfix when as last statement in block omitting trailing dot
    parse_code("0 >> Loop as x { x >> Break when x >= 5 }")

    # Non-last statement inside block STILL requires dot
    try:
        parse_code("[1, 2] >> Map as x { x * 2 >> y\n y + 1 }")
    except ParseError:
        pass
    else:
        assert False, "non-last statement inside block must still require '.'"

    # Top-level statement not ending in block STILL requires dot
    try:
        parse_code("42 >> answer")
    except ParseError:
        pass
    else:
        assert False, "top-level non-block statement must still require '.'"
