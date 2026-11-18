from dataclasses import dataclass, field, field
from typing import List, Optional, Any, Dict, Union

import dataclasses

@dataclass
class ASTNode:
    line: int
    column: int

    def to_dict(self):
        d = {"type": self.__class__.__name__}
        for field in dataclasses.fields(self):
            val = getattr(self, field.name)
            d[field.name] = self._serialize(val)
        return d
    
    def _serialize(self, val):
        if isinstance(val, ASTNode):
            return val.to_dict()
        elif isinstance(val, list):
            return [self._serialize(v) for v in val]
        elif isinstance(val, dict):
            return {k: self._serialize(v) for k, v in val.items()}
        elif hasattr(val, '__dict__'):
            return {k: self._serialize(v) for k, v in val.__dict__.items()}
        else:
            return val

@dataclass
class Program(ASTNode):
    statements: List[ASTNode]

@dataclass
class Pipeline(ASTNode):
    nodes: List[ASTNode]
    ops: List[str] = field(default_factory=list)

@dataclass
class BlockNode(ASTNode):
    pipelines: List[Pipeline]

@dataclass
class LiteralNode(ASTNode):
    value: Any

@dataclass
class DictNode(ASTNode):
    keys: List[str]
    values: List[ASTNode]

@dataclass
class VariableNode(ASTNode):
    name: str

@dataclass
class ImplicitVariableNode(ASTNode):
    name: str

@dataclass
class ExpressionNode(ASTNode):
    left: ASTNode
    operator: str
    right: ASTNode

@dataclass
class FunctionCallNode(ASTNode):
    name: str
    args: Optional[List[ASTNode]] = None

@dataclass
class ArgumentListNode(ASTNode):
    items: List[ASTNode]

@dataclass
class IndexAccessNode(ASTNode):
    target: ASTNode
    index: ASTNode

@dataclass
class BindNode(ASTNode):
    target: Union[VariableNode, IndexAccessNode]
    type_name: Optional[str] = None

@dataclass
class DestructuringBindNode(ASTNode):
    targets: List[str]

@dataclass
class InterpolatedStringNode(ASTNode):
    parts: List[Union[str, ASTNode]]

# Block Nodes
@dataclass
class Branch(ASTNode):
    condition: Optional[ASTNode] # None for else
    block: BlockNode
    mode: str = 'predicate'  # predicate, candidates, or else

@dataclass
class CheckBlock(ASTNode):
    branches: List[Branch]
    alias: Optional[str] = None

@dataclass
class StreamBlockNode(ASTNode):
    stream_type: str
    var_names: List[str]
    block: BlockNode

@dataclass
class LoopBlock(ASTNode):
    block: BlockNode
    alias: Optional[str] = None

@dataclass
class BreakNode(ASTNode):
    pass

# Function Definition
@dataclass
class ParamDef:
    type_name: str
    name: str

@dataclass
class FunctionDefNode(ASTNode):
    name: str
    params: List[ParamDef]
    block: BlockNode

@dataclass
class ReturnNode(ASTNode):
    pass

@dataclass
class UnaryOpNode(ASTNode):
    operator: str
    right: ASTNode
