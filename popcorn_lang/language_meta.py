"""Shared language metadata used by the interpreter and developer tools."""

KEYWORDS = (
    "when",
    "else",
    "as",
    "pop",
    "true",
    "false",
    "null",
    "and",
    "or",
    "not",
    "in",
    "from",
)
STREAM_BLOCKS = (
    "Map",
    "Filter",
    "Count",
    "Reduce",
    "Sort",
    "SortDesc",
    "Group",
    "Fork",
    "Update",
)
CONTROL_BLOCKS = ("Check", "Loop", "Try", "Catch")
SPECIAL_FORMS = STREAM_BLOCKS + CONTROL_BLOCKS
