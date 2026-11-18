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
    assert pipe.nodes[0].value == 1
    assert isinstance(pipe.nodes[1], BindNode) # x should be bound

def test_parser_single_node_no_bind():
    ast = parse_code("x.")
    pipe = ast.statements[0]
    assert len(pipe.nodes) == 1
    # Should not be coerced to BindNode anymore
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


def test_implicit_value_is_allowed_as_program_input():
    ast = parse_code("@ >> Display.")
    assert isinstance(ast.statements[0].nodes[0], ImplicitVariableNode)


def test_implicit_value_is_allowed_after_program_input():
    ast = parse_code("1 >> @ >> Display.")
    assert isinstance(ast.statements[0].nodes[1], ImplicitVariableNode)


def test_stream_block_accepts_one_parenthesized_name():
    ast = parse_code("[1] >> Reduce(pair): pair[0]. ..")
    block = ast.statements[0].nodes[1]
    assert isinstance(block, StreamBlockNode)
    assert block.var_names == ["pair"]


def test_stream_block_rejects_two_names():
    try:
        parse_code("[1] >> Reduce(total, value): total >> Return. ..")
    except ParseError:
        return
    assert False, "stream blocks must reject more than one name"


def test_double_colon_rejects_numeric_list_index():
    try:
        parse_code("values::0.")
    except ParseError:
        return
    assert False, ":: must not accept a numeric list index"


def test_brackets_accept_list_index():
    ast = parse_code("values[0].")
    assert isinstance(ast.statements[0].nodes[0], IndexAccessNode)


def test_fork_and_update_accept_one_block_value_name():
    fork = parse_code("1 >> Fork(value): value. ..").statements[0].nodes[1]
    update = parse_code('{"a": 1} >> Update(value): 2 >> value::a. ..').statements[0].nodes[1]
    assert fork.var_names == ["value"]
    assert update.var_names == ["value"]


def test_zip_is_not_a_stream_block():
    try:
        parse_code("([1], [2]) >> Zip(row): row. ..")
    except ParseError:
        return
    assert False, "Zip must be a standard function, not a stream block"


def test_at_name_is_not_a_variable_form():
    try:
        parse_code("@value.")
    except ParseError:
        return
    assert False, "@name must not be accepted"


def test_check_candidate_requires_literal_or_predicate():
    try:
        parse_code('1 >> value. 1 >> Check: is value: "yes". else: "no". ..')
    except ParseError:
        return
    assert False, "a variable alone is neither a literal candidate nor a Boolean predicate"
