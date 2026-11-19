from popcorn_lang.lexer import Lexer, LexerError


def test_lexer_numbers():
    lexer = Lexer("42 3.14")
    tokens = lexer.tokenize()
    assert tokens[0].type == "NUMBER"
    assert tokens[0].value == 42.0
    assert tokens[1].type == "NUMBER"
    assert tokens[1].value == 3.14


def test_integer_followed_by_statement_dot():
    tokens = Lexer("42.").tokenize()
    assert [(t.type, t.value) for t in tokens] == [("NUMBER", 42.0), ("DOT", ".")]


def test_block_delimiters_and_new_keywords():
    tokens = Lexer("when else as pop in { }").tokenize()
    assert [t.type for t in tokens] == [
        "WHEN",
        "ELSE",
        "AS",
        "POP",
        "IN",
        "LBRACE",
        "RBRACE",
    ]


def test_is_and_new_are_now_plain_variables():
    tokens = Lexer("is new").tokenize()
    assert [(t.type, t.value) for t in tokens] == [
        ("VARIABLE", "is"),
        ("VARIABLE", "new"),
    ]


def test_lowercase_type_words_are_plain_variables():
    tokens = Lexer("int bool str list dict num").tokenize()
    assert all(token.type == "VARIABLE" for token in tokens)


def test_nested_braces_and_strings_in_interpolation():
    tokens = Lexer('\'val: { {"a": 1}::a }\'').tokenize()
    assert len(tokens) == 1
    assert tokens[0].type == "INTERP_STRING"
    assert tokens[0].value[0] == ("text", "val: ")
    assert tokens[0].value[1][0] == "expr"
    assert tokens[0].value[1][1].strip() == '{"a": 1}::a'


def test_unclosed_string_is_rejected():
    try:
        Lexer('"unclosed').tokenize()
    except LexerError:
        return
    raise AssertionError("unclosed string must raise LexerError")


def test_ampersand_is_rejected():
    try:
        Lexer("left & right").tokenize()
    except LexerError:
        return
    raise AssertionError("& must not be accepted")


def test_dollar_prefixed_strings_are_rejected():
    try:
        Lexer('$"value"').tokenize()
    except LexerError:
        return
    raise AssertionError("$-prefixed strings must not be accepted")


def test_symbolic_logical_operators_are_rejected():
    for source in ("true && false", "true || false"):
        try:
            Lexer(source).tokenize()
        except LexerError:
            continue
        raise AssertionError(
            f"symbolic logical operator must not be accepted: {source}"
        )
