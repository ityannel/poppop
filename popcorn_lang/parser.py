from typing import List, Optional
from .lexer import Token, Lexer
from .language_meta import STREAM_BLOCKS
from .ast_nodes import *

class ParseError(Exception):
    pass

class Parser:
    def __init__(self, tokens: List[Token]):
        self.tokens = tokens
        self.pos = 0

    def current(self) -> Optional[Token]:
        if self.pos < len(self.tokens):
            return self.tokens[self.pos]
        return None

    def peek(self) -> Optional[Token]:
        if self.pos + 1 < len(self.tokens):
            return self.tokens[self.pos + 1]
        return None

    def advance(self):
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
        raise ParseError(f"Expected {token_type}, but got {curr.type if curr else 'EOF'} at line {curr.line if curr else 'EOF'}")

    def parse(self) -> Program:
        statements = []
        while self.current():
            statements.append(self.parse_statement())
        line = statements[0].line if statements else 1
        col = statements[0].column if statements else 0
        return Program(line, col, statements)

    def _is_function_def(self) -> bool:
        curr = self.current()
        if not curr: return False
        if curr.type == 'NEW':
            return True
        if curr.type == 'LPAREN':
            p = self.pos + 1
            paren_depth = 1
            while p < len(self.tokens):
                tok = self.tokens[p]
                if tok.type == 'LPAREN':
                    paren_depth += 1
                elif tok.type == 'RPAREN':
                    paren_depth -= 1
                    if paren_depth == 0:
                        if p + 2 < len(self.tokens):
                            if self.tokens[p+1].type == 'STREAM_OP' and self.tokens[p+2].type == 'NEW':
                                return True
                        return False
                p += 1
        return False

    def _is_implicit_target(self, node):
        """Check if the root target of an IndexAccessNode is an ImplicitVariableNode."""
        if isinstance(node, ImplicitVariableNode):
            return True
        if isinstance(node, IndexAccessNode):
            return self._is_implicit_target(node.target)
        return False

    def _expect_dot_or_block_end(self, pipeline: Pipeline):
        if self.current() and self.current().type == 'DOT':
            self.advance()
            return True

        if hasattr(pipeline, 'nodes') and len(pipeline.nodes) > 0:
            last_node = pipeline.nodes[-1]
            if isinstance(last_node, (CheckBlock, LoopBlock, StreamBlockNode, FunctionDefNode)):
                return True
                
        return False

    def parse_statement(self) -> ASTNode:
        if self._is_function_def():
            return self.parse_function_def()
        
        # Otherwise, it's a pipeline
        pipeline = self.parse_pipeline()
        if not self._expect_dot_or_block_end(pipeline):
            self.expect('DOT')
        return pipeline

    def parse_block(self, end_tokens) -> BlockNode:
        pipelines = []
        curr = self.current()
        line = curr.line if curr else 1
        col = curr.column if curr else 0
        while self.current() and self.current().type not in end_tokens:
            pipeline = self.parse_pipeline()
            if not self._expect_dot_or_block_end(pipeline):
                self.expect('DOT')
            pipelines.append(pipeline)
        return BlockNode(line, col, pipelines)

    def parse_pipeline(self) -> Pipeline:
        curr = self.current()
        line, col = curr.line, curr.column
        
        nodes = [self.parse_node()]
        ops = []
        
        while self.current() and self.current().type == 'STREAM_OP':
            op = self.current().value
            ops.append(op)
            self.advance()
            
            # Check for Keyword Block (e.g. >> map:)
            curr = self.current()
            if curr and curr.type == 'VERB' and curr.value in STREAM_BLOCKS:
                # A stream block is either unnamed (`Map:`) or gives its
                # single current value a name (`Map(value):`).
                p = 1
                if self.pos + p < len(self.tokens) and self.tokens[self.pos + p].type == 'LPAREN':
                    p += 1
                    if self.pos + p < len(self.tokens) and self.tokens[self.pos + p].type in ('VARIABLE', 'IDENTIFIER'):
                        p += 1
                    if self.pos + p < len(self.tokens) and self.tokens[self.pos + p].type == 'RPAREN':
                        p += 1

                if self.pos + p < len(self.tokens) and self.tokens[self.pos + p].type == 'COLON':
                    kw_type = curr.value
                    kw_line, kw_col = curr.line, curr.column
                    self.advance()

                    var_names = []
                    if self.current() and self.current().type == 'LPAREN':
                        self.advance() # consume LPAREN
                        if not self.current() or self.current().type not in ('VARIABLE', 'IDENTIFIER'):
                            raise ParseError("A stream block name must be a variable")
                        var_names.append(self.current().value)
                        self.advance()
                        self.expect('RPAREN')

                    if not var_names:
                        var_names = ['@']
                    self.expect('COLON')
                    block = self.parse_block({'END'})
                    self.expect('END')
                    step = StreamBlockNode(kw_line, kw_col, kw_type, var_names, block)
                else:
                    step = self.parse_node()
                    if op == '>>':
                        if isinstance(step, VariableNode):
                            step = BindNode(step.line, step.column, step, None)
                        elif isinstance(step, IndexAccessNode) and not self._is_implicit_target(step):
                            step = BindNode(step.line, step.column, step, None)
                        elif isinstance(step, ArgumentListNode) and all(isinstance(i, VariableNode) for i in step.items):
                            step = DestructuringBindNode(step.line, step.column, [i.name for i in step.items])
            else:
                step = self.parse_node()
                if op == '>>':
                    if isinstance(step, VariableNode):
                        step = BindNode(step.line, step.column, step, None)
                    elif isinstance(step, IndexAccessNode) and not self._is_implicit_target(step):
                        step = BindNode(step.line, step.column, step, None)
                    elif isinstance(step, ArgumentListNode) and all(isinstance(i, VariableNode) for i in step.items):
                        step = DestructuringBindNode(step.line, step.column, [i.name for i in step.items])
            nodes.append(step)
            
        return Pipeline(line, col, nodes, ops)

    def parse_node(self) -> ASTNode:
        curr = self.current()
        line, col = curr.line, curr.column

        return self.parse_expression()

    def parse_expression(self) -> ASTNode:
        curr = self.current()
        line, col = curr.line, curr.column

        if curr.type == 'VERB' and curr.value == 'Check':
            self.advance()
            alias = self._parse_optional_block_alias()
            self.expect('COLON')
            branches = []
            while self.current() and self.current().type in ('IS', 'ELSE'):
                if self.match('IS'):
                    cond, mode = self.parse_check_condition()
                    self.expect('COLON')
                    block = self.parse_block({'IS', 'ELSE', 'END'})
                    branches.append(Branch(line, col, cond, block, mode))
                elif self.match('ELSE'):
                    self.expect('COLON')
                    block = self.parse_block({'END'})
                    branches.append(Branch(curr.line, curr.column, None, block, 'else'))
            if not branches or branches[-1].mode != 'else':
                raise ParseError("Check requires a final else branch")
            self.expect('END')
            return CheckBlock(line, col, branches, alias)
            
        if curr.type == 'VERB' and curr.value == 'Loop':
            self.advance()
            alias = self._parse_optional_block_alias()
            self.expect('COLON')
            block = self.parse_block({'END'})
            self.expect('END')
            return LoopBlock(line, col, block, alias)
            
        if curr.type == 'VERB' and curr.value == 'Break':
            self.advance()
            return BreakNode(line, col)

        return self.parse_or()

    def _parse_optional_block_alias(self) -> Optional[str]:
        if not self.match('LPAREN'):
            return None
        token = self.current()
        if not token or token.type != 'VARIABLE':
            raise ParseError("A block alias must be a single lowercase variable name")
        self.advance()
        self.expect('RPAREN')
        return token.value

    def parse_check_condition(self):
        """Parse `is` candidates or an explicit Boolean predicate.

        A bare literal sequence such as `is 1 or 2` is a candidate list.  Any
        expression referring to `@` (or the Check alias) is a predicate and
        must evaluate to Bool at runtime.
        """
        first = self.parse_and()
        if isinstance(first, ExpressionNode):
            # `is @ == 1 or @ == 2` remains an ordinary Boolean predicate.
            while self.current() and self.current().type == 'OR':
                token = self.current(); self.advance()
                first = ExpressionNode(token.line, token.column, first, 'or', self.parse_and())
            return first, 'predicate'
        candidates = [first]
        while self.current() and self.current().type == 'OR':
            self.advance()
            candidate = self.parse_and()
            if isinstance(candidate, ExpressionNode):
                raise ParseError("Check candidates must be values; use @ for a predicate")
            candidates.append(candidate)
        if not all(self._is_check_candidate(candidate) for candidate in candidates):
            raise ParseError("Check candidates must be literal values")
        return ArgumentListNode(first.line, first.column, candidates), 'candidates'

    def _is_check_candidate(self, node: ASTNode) -> bool:
        if isinstance(node, LiteralNode):
            if isinstance(node.value, list):
                return all(
                    isinstance(item, Pipeline)
                    and not item.ops
                    and len(item.nodes) == 1
                    and self._is_check_candidate(item.nodes[0])
                    for item in node.value
                )
            return True
        if isinstance(node, DictNode):
            return all(
                isinstance(value, Pipeline)
                and not value.ops
                and len(value.nodes) == 1
                and self._is_check_candidate(value.nodes[0])
                for value in node.values
            )
        if isinstance(node, ArgumentListNode):
            return all(self._is_check_candidate(item) for item in node.items)
        return (
            isinstance(node, UnaryOpNode)
            and node.operator == '-'
            and isinstance(node.right, LiteralNode)
            and type(node.right.value) in (int, float)
        )

    def parse_or(self, left_node=None) -> ASTNode:
        left = self.parse_and(left_node=left_node)
        while self.current() and (self.current().value == 'or' or self.current().type == 'OR'):
            op = self.current().value
            line, col = self.current().line, self.current().column
            self.advance()
            right = self.parse_and()
            left = ExpressionNode(line, col, left, op, right)
        return left

    def parse_and(self, left_node=None) -> ASTNode:
        left = self.parse_comp(left_node=left_node)
        while self.current() and (self.current().value == 'and' or self.current().type == 'AND'):
            op = self.current().value
            line, col = self.current().line, self.current().column
            self.advance()
            right = self.parse_comp()
            left = ExpressionNode(line, col, left, op, right)
        return left

    def parse_comp(self, left_node=None) -> ASTNode:
        left = left_node if left_node else self.parse_additive()
        while self.current() and self.current().type == 'OPERATOR' and self.current().value in ('==', '!=', '>', '<', '>=', '<='):
            op = self.current().value
            line, col = self.current().line, self.current().column
            self.advance()
            right = self.parse_additive()
            left = ExpressionNode(line, col, left, op, right)
        return left

    def parse_additive(self) -> ASTNode:
        left = self.parse_multiplicative()
        while self.current() and self.current().type == 'OPERATOR' and self.current().value in ('+', '-'):
            token = self.current(); self.advance()
            left = ExpressionNode(token.line, token.column, left, token.value, self.parse_multiplicative())
        return left

    def parse_multiplicative(self) -> ASTNode:
        left = self.parse_primary()
        while self.current() and self.current().type == 'OPERATOR' and self.current().value in ('*', '/', '%'):
            token = self.current(); self.advance()
            left = ExpressionNode(token.line, token.column, left, token.value, self.parse_primary())
        return left

    def _parse_base_primary(self) -> ASTNode:
        curr = self.current()
        line, col = curr.line, curr.column

        if (curr.type == 'OPERATOR' and curr.value == '-') or curr.type == 'NOT':
            op = curr.value if curr.type == 'OPERATOR' else 'not'
            self.advance()
            right = self.parse_primary()
            return UnaryOpNode(line, col, op, right)

        if curr.type == 'DOUBLE_COLON':
            # Do NOT advance. parse_primary will consume the DOUBLE_COLON
            return ImplicitVariableNode(line, col, '@')

        if curr.type == 'NUMBER':
            self.advance()
            return LiteralNode(line, col, curr.value)
        if curr.type == 'STRING':
            self.advance()
            val = curr.value
            if isinstance(val, str) and ('{' in val or '}' in val):
                parts = []
                literal = []
                i = 0
                has_expr = False
                while i < len(val):
                    if val.startswith('{{', i):
                        literal.append('{')
                        i += 2
                        continue
                    if val.startswith('}}', i):
                        literal.append('}')
                        i += 2
                        continue
                    if val[i] == '{':
                        j = val.find('}', i + 1)
                        if j < 0:
                            raise ParseError(f"Unclosed interpolation at line {line}")
                        if literal:
                            parts.append(''.join(literal))
                            literal = []
                        expr_str = val[i+1:j]
                        from .lexer import Lexer
                        sub_tokens = Lexer(expr_str).tokenize()
                        if not sub_tokens:
                            raise ParseError(f"Empty interpolation at line {line}")
                        parts.append(Parser(sub_tokens).parse_pipeline())
                        has_expr = True
                        i = j + 1
                        continue
                    if val[i] == '}':
                        raise ParseError(f"Unescaped }} at line {line}; use }}}} for a literal brace")
                    literal.append(val[i])
                    i += 1
                if literal:
                    parts.append(''.join(literal))
                if has_expr:
                    return InterpolatedStringNode(line, col, parts)
                return LiteralNode(line, col, ''.join(part for part in parts if isinstance(part, str)))
            return LiteralNode(line, col, val)
        if curr.type in ('TRUE', 'FALSE', 'NULL'):
            self.advance()
            if curr.type == 'NULL':
                return LiteralNode(line, col, None)
            return LiteralNode(line, col, True if curr.type == 'TRUE' else False)
        if curr.type == 'VARIABLE':
            self.advance()
            return VariableNode(line, col, curr.value)
        if curr.type == 'IMPLICIT_VAR':
            self.advance()
            return ImplicitVariableNode(line, col, curr.value)
        if curr.type == 'LBRACKET':
            self.advance()
            items = []
            if self.match('RBRACKET'):
                return LiteralNode(line, col, items)
            while True:
                items.append(self.parse_pipeline())
                if self.match('RBRACKET'):
                    break
                self.expect('COMMA')
                if self.match('RBRACKET'):
                    break
            return ListNode(line, col, items) if hasattr(self, 'ListNode') else LiteralNode(line, col, items)

        if curr.type == 'LBRACE':
            self.advance()
            keys = []
            values = []
            if self.match('RBRACE'):
                return DictNode(line, col, keys, values)
            while True:
                key_token = self.expect('STRING')
                keys.append(key_token.value)
                self.expect('COLON')
                values.append(self.parse_pipeline())
                if self.match('RBRACE'):
                    break
                self.expect('COMMA')
                if self.match('RBRACE'):
                    break
            return DictNode(line, col, keys, values)
            
        if curr.type == 'LPAREN':
            self.advance()
            first = self.parse_pipeline()
            if self.current() and self.current().type == 'COMMA':
                items = [first]
                while self.current() and self.current().type == 'COMMA':
                    self.advance() # consume COMMA
                    if self.current() and self.current().type == 'RPAREN':
                        break
                    items.append(self.parse_pipeline())
                self.expect('RPAREN')
                if len(items) < 2:
                    raise ParseError("A value list requires at least two values")
                return ArgumentListNode(line, col, items)
            else:
                self.expect('RPAREN')
                return first

        if curr.type == 'VERB':
            self.advance()
            if curr.value == 'Return':
                return ReturnNode(line, col)
            if self.current() and self.current().type == 'LPAREN':
                raise ParseError("Parentheses after a function name are reserved for block aliases")
            return FunctionCallNode(line, col, curr.value)

        raise ParseError(f"Unexpected token {curr.type} ({curr.value}) at line {line}")

    def parse_primary(self) -> ASTNode:
        curr = self.current()
        line = curr.line if curr else 1
        col = curr.column if curr else 0
        node = self._parse_base_primary()
        while self.current() and self.current().type in ('LBRACKET', 'DOUBLE_COLON'):
            if self.current().type == 'LBRACKET':
                self.advance()
                idx = self.parse_expression()
                self.expect('RBRACKET')
                node = IndexAccessNode(line, col, node, idx)
            elif self.current().type == 'DOUBLE_COLON':
                self.advance()
                prop_token = self.current()
                if prop_token and prop_token.type == 'VARIABLE':
                    self.advance()
                    idx = LiteralNode(prop_token.line, prop_token.column, prop_token.value)
                    node = IndexAccessNode(line, col, node, idx)
                else:
                    raise ParseError(f"Expected property name after ::, got {prop_token.type if prop_token else 'EOF'}")
        return node

    def parse_function_def(self) -> FunctionDefNode:
        # (a, b) >> new Plus: ... end.
        # or new Plus: ... end.
        curr = self.current()
        line, col = curr.line, curr.column
        
        params = []
        if self.match('LPAREN'):
            # parse parameters
            if not self.match('RPAREN'):
                while True:
                    type_token = self.current()
                    if type_token.type == 'VARIABLE':
                        param_type = 'any'
                        var_name = type_token.value
                        self.advance()
                    else:
                        raise ParseError(f"Expected parameter name in function def, got {type_token.type}")
                    
                    params.append(ParamDef(param_type, var_name))
                    
                    if self.current() and self.current().type == 'COMMA':
                        self.advance()
                    else:
                        break
                self.expect('RPAREN')
            self.expect('STREAM_OP')
            
        self.expect('NEW')
        name = self.expect('VERB').value
        self.expect('COLON')

        block = self.parse_block({'END'})
        self.expect('END')

        return FunctionDefNode(line, col, name, params, block)
