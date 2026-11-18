"""Shared language metadata used by the interpreter and developer tools."""

KEYWORDS = ("is", "else", "new", "true", "false", "null", "and", "or", "not")
STREAM_BLOCKS = ("Map", "Filter", "Reduce", "Fork", "Sort", "Group", "Update")
CONTROL_BLOCKS = ("Check", "Loop")
SPECIAL_FORMS = STREAM_BLOCKS + CONTROL_BLOCKS
