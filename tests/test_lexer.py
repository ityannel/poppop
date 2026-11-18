from popcorn_lang.lexer import Lexer, LexerError

def test_lexer_numbers():
    lexer = Lexer("42 3.14")
    tokens = lexer.tokenize()
    assert tokens[0].type == 'NUMBER'
    assert tokens[0].value == 42
    assert tokens[1].type == 'NUMBER'
    assert tokens[1].value == 3.14


def test_lowercase_type_words_are_plain_variables():
    tokens = Lexer("int bool str list dict").tokenize()
    assert all(token.type == "VARIABLE" for token in tokens)


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
        raise AssertionError(f"symbolic logical operator must not be accepted: {source}")
