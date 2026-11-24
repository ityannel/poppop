from typing import List, Optional
from .lexer import Lexer, Token
from .language_meta import KEYWORDS, SPECIAL_FORMS
from .ast_nodes import *

_KEYWORD_TOKEN_TYPES = {kw.upper() for kw in KEYWORDS}
_SIMPLE_STREAM_NAMES = {"Map", "Filter", "Count", "Sort", "SortDesc", "Group"}
# `Map Name` の省略形で、処理名として書けない名前（ブロックや制御の形をもつもの）
_NOT_SHORTHAND_NAMES = set(SPECIAL_FORMS) | {"Return", "Break"}


class ParseError(Exception):
    pass


class Parser:
    def __init__(self, tokens: List[Token], *, legacy_braces: bool = False):
        self.tokens = tokens
        self.pos = 0
        # legacy_braces: 旧形式の `{ … }` ブロックも読む（`popcorn migrate` が、書きかえ位置を知るためだけに使う）
        self.legacy_braces = legacy_braces
        self.brace_blocks: List[tuple] = []  # (開き `{` の位置, 閉じ `}` の位置)
        self._brace_stack: List[int] = []
        # 字下げブロック（`:` のあとに書く本体）のための情報。
        #   _line_starts:  行の最初のトークンの位置
        #   _line_indent:  行ごとの、最初のトークンの列
        #   _layouts:      開いている字下げブロックの、見出し行の列（None は { } や ( ) の中で、字下げを見ない印）
        self._line_starts = set()
        self._line_indent = {}
        prev_line = None
        for index, tok in enumerate(tokens):
            if tok.line != prev_line:
                self._line_starts.add(index)
                self._line_indent.setdefault(tok.line, tok.column)
            prev_line = tok.line
        self._layouts: List[Optional[int]] = []
        self._inline_bodies: set = set()  # `:` と同じ行に書いた本体（_layouts の深さ）

    def _dedent_at(self, index: int) -> Optional[Token]:
        """字下げブロックの外に出た行の先頭なら、仮の DEDENT トークンを返す。"""
        if not self._layouts or self._layouts[-1] is None:
            return None
        tok = self.tokens[index]
        # 閉じかっこは、文の始まりにならないので、行の途中でも字下げブロックを閉じる
        #   Check { when x: "a". }   /   Map (@ >> Check: …)
        if tok.type in ("RBRACE", "RPAREN", "RBRACKET"):
            return Token("DEDENT", "", tok.line, tok.column)
        if index not in self._line_starts:
            return None
        for indent in reversed(self._layouts):
            if indent is None:
                break
            if tok.column <= indent:
                return Token("DEDENT", "", tok.line, tok.column)
        return None

    def current(self) -> Optional[Token]:
        if self.pos < len(self.tokens):
            dedent = self._dedent_at(self.pos)
            if dedent is not None:
                return dedent
            return self.tokens[self.pos]
        return None

    def _at_end(self, end_set) -> bool:
        curr = self.current()
        if curr is None:
            return "DEDENT" in end_set
        return curr.type in end_set

    # ---- ブロックの本体: `:` と字下げ ----
    def _open_body(self, what: str, allow_inline: bool = False) -> str:
        """本体を開く。ふつうは "layout"。旧形式の `{` を読むモードのときだけ "brace" もある。"""
        curr = self.current()
        if curr is not None and curr.type == "COLON":
            self.advance()
            self._layouts.append(self._line_indent.get(curr.line, curr.column))
            nxt = self.current()
            if (
                not allow_inline
                and nxt is not None
                and nxt.type != "DEDENT"
                and nxt.line == curr.line
            ):
                # `Map: @ * 2 >> d.` は、`>> d` まで本体に入ってしまうので、同じ行には書かせない
                hint = f"; for one expression, write '{what} (...)'" if what in _SIMPLE_STREAM_NAMES else ""
                raise ParseError(
                    f"Write the body of {what} on the next line, indented{hint} "
                    f"at line {nxt.line}, column {nxt.column}"
                )
            if nxt is None or nxt.type == "DEDENT":
                raise ParseError(
                    f"Expected an indented body after ':' in {what} at line {curr.line}, column {curr.column}"
                )
            if nxt.line == curr.line:
                self._inline_bodies.add(len(self._layouts))
            return "layout"
        if curr is not None and curr.type == "LBRACE":
            if not self.legacy_braces:
                raise ParseError(
                    f"Blocks are written with ':' and indentation, not braces: "
                    f"start {what} with ':' at line {curr.line}, column {curr.column}"
                )
            self._brace_stack.append(self.pos)
            self.advance()
            return "brace"
        loc = f"at line {curr.line}, column {curr.column}" if curr else "at EOF"
        got = curr.type if curr else "EOF"
        raise ParseError(f"Expected ':' to start {what}, but got {got} {loc}")

    def _close_body(self, kind: str) -> None:
        if kind == "brace":
            close_pos = self.pos
            self.expect("RBRACE")
            self.brace_blocks.append((self._brace_stack.pop(), close_pos))
            return
        curr = self.current()
        if curr is not None and curr.type != "DEDENT":
            raise ParseError(
                f"Unexpected token {curr.type} ({curr.value}) at line {curr.line}, column {curr.column}"
            )
        self._inline_bodies.discard(len(self._layouts))
        self._layouts.pop()

    @staticmethod
    def _body_end(kind: str) -> set:
        return {"RBRACE"} if kind == "brace" else {"DEDENT"}

    def _parse_body(self, what: str, allow_inline: bool = False) -> BlockNode:
        kind = self._open_body(what, allow_inline)
        block = self.parse_block(self._body_end(kind))
        self._close_body(kind)
        return block

    def peek(self, offset: int = 1) -> Optional[Token]:
        if self.pos + offset < len(self.tokens):
            return self.tokens[self.pos + offset]
        return None

    def advance(self):
        # かっこの中では、字下げブロックの終わりを見ない（開きかっこで印を積み、閉じかっこで外す）
        if self.pos < len(self.tokens):
            tok_type = self.tokens[self.pos].type
            if tok_type in ("LPAREN", "LBRACKET", "LBRACE"):
                self._layouts.append(None)
            elif tok_type in ("RPAREN", "RBRACKET", "RBRACE") and None in self._layouts:
                while self._layouts and self._layouts.pop() is not None:
                    pass
        self.pos += 1

    def match(self, token_type: str) -> bool:
        curr = self.current()
        if curr and curr.type == token_type:
            self.advance()
            return True
        return False

    def expect(self, token_type: str) -> Token:
        curr = self.current()
        if curr and curr.type == token_type:
            self.advance()
            return curr
        loc = f"at line {curr.line}, column {curr.column}" if curr else "at EOF"
        raise ParseError(
            f"Expected {token_type}, but got {curr.type if curr else 'EOF'} {loc}"
        )

    def parse(self) -> Program:
        statements = []
        while self.current():
            statements.append(self.parse_top_level_statement())
        line = statements[0].line if statements else 1
        col = statements[0].column if statements else 1
        return Program(line, col, statements)

    def _is_function_def(self) -> bool:
        curr = self.current()
        if not curr:
            return False
        if curr.type == "POP":
            return True
        if curr.type == "LPAREN":
            p = self.pos + 1
            paren_depth = 1
            while p < len(self.tokens):
                tok = self.tokens[p]
                if tok.type == "LPAREN":
                    paren_depth += 1
                elif tok.type == "RPAREN":
                    paren_depth -= 1
                    if paren_depth == 0:
                        if (
                            p + 2 < len(self.tokens)
                            and self.tokens[p + 1].type == "STREAM_OP"
                            and self.tokens[p + 2].type == "POP"
                        ):
                            return True
                        return False
                p += 1
        return False

    def _expect_dot_or_block_end(self, pipeline: Pipeline) -> bool:
        if self.current() and self.current().type == "DOT":
            self.advance()
            return True

        if pipeline.nodes:
            last_node = pipeline.nodes[-1]
            if isinstance(
                last_node,
                (CheckBlock, LoopBlock, StreamBlockNode, TryCatchBlock, FunctionDefNode),
            ):
                return True

        return False

    def parse_top_level_statement(self) -> ASTNode:
        if self._is_function_def():
            return self.parse_function_def()
        return self.parse_statement()

    def parse_statement(self, end_tokens=None) -> ASTNode:
        if self._is_function_def():
            curr = self.current()
            raise ParseError(
                f"Function definitions are only allowed at top level at line {curr.line}, column {curr.column}"
            )
        end_set = end_tokens or set()
        pipeline = self.parse_pipeline()
        if self.current() and self.current().type == "WHEN":
            if len(self._layouts) in self._inline_bodies:
                # `when a: "x" when b` は、2つめの when が分岐に見えて紛らわしい
                tok = self.current()
                raise ParseError(
                    f"A one-line ':' body cannot end with 'when'; start the next branch on a new line, "
                    f"or write the body on the next line at line {tok.line}, column {tok.column}"
                )
            self.advance()
            cond = self.parse_expression()
            if self.match("DOT"):
                return ConditionalStatementNode(
                    pipeline.line, pipeline.column, pipeline, cond
                )
            if end_set and self._at_end(end_set):
                return ConditionalStatementNode(
                    pipeline.line, pipeline.column, pipeline, cond
                )
            self.expect("DOT")
        if self._expect_dot_or_block_end(pipeline):
            return pipeline
        if end_set and self._at_end(end_set):
            return pipeline
        self._reject_branch_on_body_line(end_set)
        self.expect("DOT")
        return pipeline

    def _reject_branch_on_body_line(self, end_tokens, kinds=("ELSE",)) -> None:
        """`when a: 1 else: 2` のように、`:` の本体と同じ行に次の分岐を書いたときの案内。"""
        tok = self.current()
        if "DEDENT" in end_tokens and tok is not None and tok.type in kinds:
            raise ParseError(
                f"A ':' body runs to the end of its line; start '{tok.value}' on a new line "
                f"at line {tok.line}, column {tok.column}"
            )

    def parse_block(self, end_tokens) -> BlockNode:
        pipelines = []
        curr = self.current()
        line = curr.line if curr else 1
        col = curr.column if curr else 1
        while self.current() and self.current().type not in end_tokens:
            self._reject_branch_on_body_line(end_tokens, ("WHEN", "ELSE"))
            pipelines.append(self.parse_statement(end_tokens))
        return BlockNode(line, col, pipelines)

    def _parse_optional_alias_clause(self) -> List[str]:
        if not self.match("AS"):
            return []
        curr = self.current()
        if not curr:
            raise ParseError("Expected alias name after 'as' at EOF")
        if curr.type == "VARIABLE":
            self.advance()
            return [curr.value]
        if curr.type == "LPAREN":
            self.advance()
            names: List[str] = []
            first = self.current()
            if not first or first.type != "VARIABLE":
                loc = f"at line {first.line}, column {first.column}" if first else "at EOF"
                raise ParseError(f"Expected lowercase variable name in alias {loc}")
            names.append(first.value)
            self.advance()
            if not self.match("COMMA"):
                nxt = self.current()
                loc = f"at line {nxt.line}, column {nxt.column}" if nxt else "at EOF"
                raise ParseError(
                    f"Destructuring alias requires at least two variable names {loc}"
                )
            while True:
                tok = self.current()
                if not tok or tok.type != "VARIABLE":
                    loc = f"at line {tok.line}, column {tok.column}" if tok else "at EOF"
                    raise ParseError(f"Expected lowercase variable name in alias {loc}")
                names.append(tok.value)
                self.advance()
                if not self.match("COMMA"):
                    break
            self.expect("RPAREN")
            return names
        raise ParseError(
            f"Expected alias variable name or '(a, b)' after 'as', got {curr.type} at line {curr.line}, column {curr.column}"
        )

    def _parse_short_body(
        self, name: str, alias_names: List[str], allow_paren: bool = True
    ) -> Optional[BlockNode]:
        """ブロックを短く書く2つの形。当てはまらなければ None。

        * 式渡し（expression body）:     `Map (式)` は `Map { 式 }` と同じ（式の中の `@` が、各要素）
        * 処理名渡し（process-name body）: `Map Name` は `Map { @ >> Name }` と同じ
                       （`Map Get("x")` のように補助引数も書ける）
        """
        curr = self.current()
        if curr is None:
            return None
        line, col = curr.line, curr.column
        if allow_paren and curr.type == "LPAREN":
            expr = self._parse_base_primary()
            return BlockNode(line, col, [Pipeline(line, col, [expr], [])])
        if curr.type == "VERB" and not alias_names:
            if curr.value in _NOT_SHORTHAND_NAMES:
                raise ParseError(
                    f"'{name} {curr.value}' is not allowed as a process-name body; write a block: "
                    f"'{name}:' at line {line}, column {col}"
                )
            stage = self._parse_stream_block_or_call()
            implicit = ImplicitVariableNode(line, col, "@")
            return BlockNode(
                line, col, [Pipeline(line, col, [implicit, stage], [">>"])]
            )
        return None

    def _parse_stream_block_or_call(self) -> ASTNode:
        curr = self.current()
        line, col = curr.line, curr.column
        name = curr.value

        # SimpleStreamBlock: Map | Filter | Sort | SortDesc | Group
        if name in _SIMPLE_STREAM_NAMES:
            self.advance()
            alias_names = self._parse_optional_alias_clause()
            block = self._parse_short_body(name, alias_names)
            if block is None:
                block = self._parse_body(name)
            return StreamBlockNode(line, col, name, alias_names, block)

        if name == "Loop":
            self.advance()
            alias_names = self._parse_optional_alias_clause()
            block = self._parse_body("Loop")
            single_alias = alias_names[0] if len(alias_names) == 1 else None
            return LoopBlock(line, col, block, single_alias, alias_names)

        if name == "Reduce":
            self.advance()
            init_expr = None
            if self.match("LPAREN"):
                init_expr = self.parse_expression()
                self.expect("RPAREN")
            alias_names = self._parse_optional_alias_clause()
            block = self._parse_short_body("Reduce", alias_names, allow_paren=False)
            if block is None:
                block = self._parse_body("Reduce")
            return StreamBlockNode(line, col, "Reduce", alias_names, block, init_expr=init_expr)

        if name == "Fork":
            self.advance()
            alias_names = self._parse_optional_alias_clause()
            kind = self._open_body("Fork")
            end = self._body_end(kind)
            if self._at_end(end):
                raise ParseError(
                    f"Fork requires at least one branch at line {line}, column {col}"
                )
            is_labeled = (
                self.current() is not None
                and self.current().type == "VARIABLE"
                and self.peek() is not None
                and self.peek().type == "COLON"
            )
            if is_labeled:
                entries: List[ForkEntryNode] = []
                while not self._at_end(end) and self.current() is not None:
                    tok = self.current()
                    if not (
                        tok.type == "VARIABLE"
                        and self.peek() is not None
                        and self.peek().type == "COLON"
                    ):
                        raise ParseError(
                            f"Cannot mix labeled and unlabeled branches in Fork at line {tok.line}, column {tok.column}"
                        )
                    label = tok.value
                    entry_line, entry_col = tok.line, tok.column
                    self.advance()  # label
                    self.advance()  # ':'
                    stmt = self.parse_statement(end)
                    entries.append(ForkEntryNode(entry_line, entry_col, label, stmt))
                self._close_body(kind)
                return StreamBlockNode(
                    line,
                    col,
                    "Fork",
                    alias_names,
                    BlockNode(line, col, []),
                    labeled_entries=entries,
                )
            else:
                pipelines: List[ASTNode] = []
                while not self._at_end(end) and self.current() is not None:
                    tok = self.current()
                    if (
                        tok.type == "VARIABLE"
                        and self.peek() is not None
                        and self.peek().type == "COLON"
                    ):
                        raise ParseError(
                            f"Cannot mix labeled and unlabeled branches in Fork at line {tok.line}, column {tok.column}"
                        )
                    pipelines.append(self.parse_statement(end))
                self._close_body(kind)
                return StreamBlockNode(
                    line, col, "Fork", alias_names, BlockNode(line, col, pipelines)
                )

        if name == "Update":
            self.advance()
            alias_names = self._parse_optional_alias_clause()
            block = self._parse_body("Update")
            return StreamBlockNode(line, col, "Update", alias_names, block)

        if name == "Check":
            self.advance()
            alias_names = self._parse_optional_alias_clause()
            kind = self._open_body("Check")
            branches: List[Branch] = []
            while self.current() and self.current().type == "WHEN":
                w_tok = self.current()
                self.advance()
                cond = self.parse_expression()
                block = self._parse_body("a when branch", allow_inline=True)
                branches.append(Branch(w_tok.line, w_tok.column, cond, block, "predicate"))
            if not branches:
                raise ParseError(
                    f"Check requires at least one 'when' branch at line {line}, column {col}"
                )
            if not self.current() or self.current().type != "ELSE":
                raise ParseError(
                    f"Check requires a final else branch at line {line}, column {col}"
                )
            e_tok = self.current()
            self.advance()
            else_block = self._parse_body("the else branch", allow_inline=True)
            branches.append(Branch(e_tok.line, e_tok.column, None, else_block, "else"))
            self._close_body(kind)
            single_alias = alias_names[0] if len(alias_names) == 1 else None
            return CheckBlock(line, col, branches, single_alias, alias_names)

        if name == "Try":
            self.advance()
            try_aliases = self._parse_optional_alias_clause()
            try_block = self._parse_body("Try")
            catch_tok = self.current()
            if not catch_tok or catch_tok.type != "VERB" or catch_tok.value != "Catch":
                loc = (
                    f"at line {catch_tok.line}, column {catch_tok.column}"
                    if catch_tok
                    else "at EOF"
                )
                raise ParseError(f"Try requires a matching Catch block {loc}")
            self.advance()
            catch_aliases = self._parse_optional_alias_clause()
            catch_block = self._parse_body("Catch")
            return TryCatchBlock(
                line, col, try_block, catch_block, try_aliases, catch_aliases
            )

        if name == "Catch":
            raise ParseError(
                f"Catch must immediately follow a Try block at line {line}, column {col}"
            )

        if name == "Return":
            self.advance()
            if self.current() and self.current().type == "LPAREN":
                raise ParseError(
                    f"Return does not accept extra arguments at line {line}, column {col}"
                )
            return ReturnNode(line, col)

        if name == "Break":
            self.advance()
            if self.current() and self.current().type == "LPAREN":
                raise ParseError(
                    f"Break does not accept extra arguments at line {line}, column {col}"
                )
            return BreakNode(line, col)

        # ProcessCall = ProcessName [ "(" ArgumentList ")" ]
        self.advance()
        extra_args = None
        if self.match("LPAREN"):
            if self.current() and self.current().type == "RPAREN":
                raise ParseError(
                    f"Argument list cannot be empty at line {line}, column {col}"
                )
            extra_args = []
            while True:
                extra_args.append(self._parse_argument())
                if self.match("RPAREN"):
                    break
                self.expect("COMMA")
                if self.match("RPAREN"):
                    break
        return FunctionCallNode(line, col, name, extra_args)

    def _parse_argument(self) -> ASTNode:
        """補助引数。かっこの中なので、パイプラインもそのまま書ける: Slice(-1, @ >> Length)"""
        pipe = self.parse_pipeline()
        if len(pipe.nodes) == 1:
            return pipe.nodes[0]
        return GroupedPipelineNode(pipe.line, pipe.column, pipe)

    def parse_pipeline(self) -> Pipeline:
        curr = self.current()
        if not curr:
            raise ParseError("Unexpected end of input")
        line, col = curr.line, curr.column

        nodes = [self.parse_expression()]
        ops = []

        while self.current() and self.current().type == "STREAM_OP":
            op = self.current().value
            ops.append(op)
            self.advance()

            curr = self.current()
            if not curr:
                raise ParseError("Expected pipeline stage after '>>' at EOF")

            if curr.type == "VERB":
                step = self._parse_stream_block_or_call()
            else:
                step = self.parse_expression()
                if isinstance(step, VariableNode):
                    step = BindNode(step.line, step.column, step, None)
                elif isinstance(step, IndexAccessNode):
                    step = BindNode(step.line, step.column, step, None)
                elif isinstance(step, ArgumentListNode) and all(
                    isinstance(item, VariableNode) for item in step.items
                ):
                    step = DestructuringBindNode(
                        step.line, step.column, [item.name for item in step.items]
                    )
            nodes.append(step)

        return Pipeline(line, col, nodes, ops)

    def parse_expression(self) -> ASTNode:
        return self.parse_or()

    def parse_or(self, left_node=None) -> ASTNode:
        left = self.parse_and(left_node=left_node)
        while self.current() and self.current().type == "OR":
            tok = self.current()
            self.advance()
            right = self.parse_and()
            left = ExpressionNode(tok.line, tok.column, left, "or", right)
        return left

    def parse_and(self, left_node=None) -> ASTNode:
        left = self.parse_not(left_node=left_node)
        while self.current() and self.current().type == "AND":
            tok = self.current()
            self.advance()
            right = self.parse_not()
            left = ExpressionNode(tok.line, tok.column, left, "and", right)
        return left

    def parse_not(self, left_node=None) -> ASTNode:
        """`not` は比較より弱く結びつく: `not @ in xs` は `not (@ in xs)`、`not a == b` は `not (a == b)`。"""
        curr = self.current()
        if left_node is None and curr is not None and curr.type == "NOT":
            self.advance()
            return UnaryOpNode(curr.line, curr.column, "not", self.parse_not())
        return self.parse_comp(left_node=left_node)

    def _is_comp_token(self, tok: Optional[Token]) -> bool:
        if not tok:
            return False
        if tok.type == "IN":
            return True
        if tok.type == "NOT":  # `not in`（いまのトークンについて呼ぶ）
            nxt = self.peek()
            return tok is self.current() and nxt is not None and nxt.type == "IN"
        return tok.type == "OPERATOR" and tok.value in ("==", "!=", ">", "<", ">=", "<=")

    def parse_comp(self, left_node=None) -> ASTNode:
        left = left_node if left_node else self.parse_additive()
        if self._is_comp_token(self.current()):
            tok = self.current()
            op = tok.value
            self.advance()
            if tok.type == "NOT":  # `not in`
                self.advance()
                op = "not in"
            right = self.parse_additive()
            if self._is_comp_token(self.current()):
                nxt = self.current()
                raise ParseError(
                    f"Comparison operator '{nxt.value}' is non-associative at line {nxt.line}, column {nxt.column}"
                )
            return ExpressionNode(tok.line, tok.column, left, op, right)
        return left

    def parse_additive(self) -> ASTNode:
        left = self.parse_multiplicative()
        while (
            self.current()
            and self.current().type == "OPERATOR"
            and self.current().value in ("+", "-")
        ):
            token = self.current()
            self.advance()
            left = ExpressionNode(
                token.line, token.column, left, token.value, self.parse_multiplicative()
            )
        return left

    def parse_multiplicative(self) -> ASTNode:
        left = self.parse_unary()
        while (
            self.current()
            and self.current().type == "OPERATOR"
            and self.current().value in ("*", "/", "%")
        ):
            token = self.current()
            self.advance()
            left = ExpressionNode(
                token.line, token.column, left, token.value, self.parse_unary()
            )
        return left

    def parse_unary(self) -> ASTNode:
        curr = self.current()
        if not curr:
            raise ParseError("Unexpected end of input")
        if (curr.type == "OPERATOR" and curr.value == "-") or curr.type == "NOT":
            op = "-" if curr.type == "OPERATOR" else "not"
            line, col = curr.line, curr.column
            self.advance()
            right = self.parse_unary()
            return UnaryOpNode(line, col, op, right)
        return self.parse_postfix()

    def _parse_base_primary(self) -> ASTNode:
        curr = self.current()
        if not curr:
            raise ParseError("Unexpected end of input")
        line, col = curr.line, curr.column

        if curr.type == "NUMBER":
            self.advance()
            return LiteralNode(line, col, curr.value)

        if curr.type == "STRING":
            self.advance()
            return LiteralNode(line, col, curr.value)

        if curr.type == "INTERP_STRING":
            self.advance()
            parts = []
            for seg in curr.value:
                if seg[0] == "text":
                    parts.append(seg[1])
                else:
                    _, expr_src, expr_line, expr_col = seg
                    sub_tokens = Lexer(
                        expr_src, line_offset=expr_line, col_offset=expr_col
                    ).tokenize()
                    if not sub_tokens:
                        raise ParseError(
                            f"Empty interpolation at line {expr_line}, column {expr_col}"
                        )
                    sub_parser = Parser(sub_tokens, legacy_braces=self.legacy_braces)
                    sub_pipe = sub_parser.parse_pipeline()
                    if sub_parser.current() is not None:
                        extra = sub_parser.current()
                        raise ParseError(
                            f"Unexpected token {extra.type} ({extra.value}) in interpolation at line {extra.line}, column {extra.column}"
                        )
                    parts.append(sub_pipe)
            return InterpolatedStringNode(line, col, parts)

        if curr.type in ("TRUE", "FALSE", "NULL"):
            self.advance()
            if curr.type == "NULL":
                return LiteralNode(line, col, None)
            return LiteralNode(line, col, curr.type == "TRUE")

        if curr.type == "VARIABLE":
            self.advance()
            return VariableNode(line, col, curr.value)

        if curr.type == "IMPLICIT_VAR":
            self.advance()
            return ImplicitVariableNode(line, col, curr.value)

        if curr.type in ("LBRACKET", "LBRACE", "LPAREN"):
            return self._parse_bracketed_primary(curr)

        if curr.type == "VERB":
            # ブロックの形が必要な処理（Map、Check、Loop、Try など）は、`>>` の右側に、ブロックつきで書く
            if curr.value in SPECIAL_FORMS:
                raise ParseError(
                    f"Cannot call '{curr.value}' without '>>' at line {line}, column {col}"
                )
            # 統一規則: 処理名だけを書くと、`@`（いまの値）を入力にして呼び出す。
            #   Pi * 2          →  (@ >> Pi) * 2
            #   Now::year       →  (@ >> Now)::year
            #   Break when …    →  (@ >> Break) when …
            stage = self._parse_stream_block_or_call()
            implicit = ImplicitVariableNode(line, col, "@")
            return GroupedPipelineNode(
                line, col, Pipeline(line, col, [implicit, stage], [">>"])
            )

        raise ParseError(
            f"Unexpected token {curr.type} ({curr.value}) at line {line}, column {col}"
        )

    def _parse_bracketed_primary(self, curr: Token) -> ASTNode:
        """[ … ]、{ … }（Dict）、( … )。"""
        line, col = curr.line, curr.column
        if curr.type == "LBRACKET":
            self.advance()
            items = []
            if self.match("RBRACKET"):
                return LiteralNode(line, col, items)
            while True:
                items.append(self.parse_expression())
                if self.match("RBRACKET"):
                    break
                self.expect("COMMA")
                if self.match("RBRACKET"):
                    break
            return LiteralNode(line, col, items)

        if curr.type == "LBRACE":
            self.advance()
            keys = []
            values = []
            if self.match("RBRACE"):
                return DictNode(line, col, keys, values)
            while True:
                key_token = self.expect("STRING")
                keys.append(key_token.value)
                self.expect("COLON")
                values.append(self.parse_expression())
                if self.match("RBRACE"):
                    break
                self.expect("COMMA")
                if self.match("RBRACE"):
                    break
            return DictNode(line, col, keys, values)

        if curr.type == "LPAREN":
            self.advance()
            first = self.parse_pipeline()
            if isinstance(first, Pipeline) and len(first.nodes) == 1:
                first_expr = first.nodes[0]
            elif isinstance(first, Pipeline):
                first_expr = GroupedPipelineNode(first.line, first.column, first)
            else:
                first_expr = first
            if self.current() and self.current().type == "COMMA":
                items = [first_expr]
                while self.current() and self.current().type == "COMMA":
                    self.advance()
                    if self.current() and self.current().type == "RPAREN":
                        break
                    items.append(self.parse_expression())
                self.expect("RPAREN")
                if len(items) < 2:
                    raise ParseError(
                        f"A value list requires at least two values at line {line}, column {col}"
                    )
                return ArgumentListNode(line, col, items)
            else:
                self.expect("RPAREN")
                return first_expr

        raise ParseError(
            f"Unexpected token {curr.type} ({curr.value}) at line {line}, column {col}"
        )

    def parse_postfix(self) -> ASTNode:
        curr = self.current()
        line = curr.line if curr else 1
        col = curr.column if curr else 1
        node = self._parse_base_primary()
        while self.current() and self.current().type in ("LBRACKET", "DOUBLE_COLON"):
            if self.current().type == "LBRACKET":
                self.advance()
                idx = self.parse_expression()
                self.expect("RBRACKET")
                node = IndexAccessNode(line, col, node, idx)
            elif self.current().type == "DOUBLE_COLON":
                self.advance()
                prop_token = self.current()
                if prop_token and (
                    prop_token.type in ("VARIABLE", "VERB")
                    or prop_token.type in _KEYWORD_TOKEN_TYPES
                ):
                    self.advance()
                    idx = LiteralNode(
                        prop_token.line, prop_token.column, prop_token.value
                    )
                    node = IndexAccessNode(line, col, node, idx)
                else:
                    loc = (
                        f"at line {prop_token.line}, column {prop_token.column}"
                        if prop_token
                        else "at EOF"
                    )
                    raise ParseError(
                        f"Expected property name after ::, got {prop_token.type if prop_token else 'EOF'} {loc}"
                    )
        return node

    def parse_function_def(self) -> FunctionDefNode:
        curr = self.current()
        line, col = curr.line, curr.column

        params: List[ParamDef] = []
        if self.match("LPAREN"):
            if self.current() and self.current().type == "RPAREN":
                raise ParseError(
                    f"Parameter list cannot be empty at line {line}, column {col}"
                )
            while True:
                param_token = self.current()
                if param_token and param_token.type == "VARIABLE":
                    params.append(ParamDef("any", param_token.value))
                    self.advance()
                else:
                    loc = (
                        f"at line {param_token.line}, column {param_token.column}"
                        if param_token
                        else "at EOF"
                    )
                    raise ParseError(
                        f"Expected parameter name in function def, got {param_token.type if param_token else 'EOF'} {loc}"
                    )
                if self.match("COMMA"):
                    continue
                break
            self.expect("RPAREN")
            self.expect("STREAM_OP")

        self.expect("POP")
        name = self.expect("VERB").value
        block = self._parse_body(f"function '{name}'", allow_inline=True)

        return FunctionDefNode(line, col, name, params, block)
