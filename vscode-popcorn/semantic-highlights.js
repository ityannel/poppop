"use strict";

const { maskNonCode } = require("./assignment-targets");

const VARIABLE_IDENTIFIER = /\b[a-z_][a-zA-Z0-9_]*\b/g;
const PIPELINE_OPERATOR = />>/g;
const IMPLICIT_SCOPE_HEADER = />>\s*(?:Map|Filter|Reduce|Loop|Sort|Group|Fork|Update|Check)\b[^\r\n]*:/;

function scanLines(text, callback) {
    const lines = text.split("\n");
    const state = { inBlockComment: false };
    let lineStart = 0;

    lines.forEach((line, lineNumber) => {
        callback({ line, code: maskNonCode(line, state), lineNumber, lineStart });
        lineStart += line.length + 1;
    });
}

function lastNonWhitespaceIndex(text) {
    for (let index = text.length - 1; index >= 0; index -= 1) {
        if (!/\s/.test(text[index])) {
            return index;
        }
    }
    return -1;
}

function firstNonWhitespaceIndex(text) {
    const match = /\S/.exec(text);
    return match ? match.index : -1;
}

function findPipelineGuideRanges(text) {
    const ranges = [];
    scanLines(text, ({ line, code, lineStart }) => {
        if (!PIPELINE_OPERATOR.test(code)) {
            return;
        }
        PIPELINE_OPERATOR.lastIndex = 0;

        // Use the original line for the start so a quoted input value is part
        // of the visual flow, while `code` still prevents false operators in
        // strings and comments.
        const start = firstNonWhitespaceIndex(line);
        const end = lastNonWhitespaceIndex(code);
        if (start !== -1 && end >= start) {
            ranges.push({ start: lineStart + start, end: lineStart + end + 1 });
        }
    });
    return ranges;
}

function findImplicitVariableOffsets(text) {
    const offsets = [];
    scanLines(text, ({ code, lineStart }) => {
        for (let index = 0; index < code.length; index += 1) {
            if (code[index] === "@") {
                offsets.push({ start: lineStart + index, length: 1 });
            }
        }
    });
    return offsets;
}

/**
 * Finds Map/Filter/etc. blocks. Generic blocks are also kept on the stack so
 * a nested check/fork block cannot accidentally close the surrounding @ scope.
 */
function findImplicitVariableScopeRanges(text) {
    const ranges = [];
    const blockStack = [];
    let documentEnd = text.length;

    scanLines(text, ({ code, lineStart }) => {
        const trimmed = code.trim();

        if (/^\.\./.test(trimmed)) {
            const block = blockStack.pop();
            if (block && block.isImplicitScope) {
                ranges.push({ start: block.start, end: lineStart });
            }
            return;
        }

        // Block headers end in a colon. Inline blocks close on the same line
        // with `..`, so they intentionally do not create a multi-line scope.
        if (trimmed.endsWith(":") && !trimmed.includes("..")) {
            blockStack.push({
                start: lineStart,
                isImplicitScope: IMPLICIT_SCOPE_HEADER.test(code)
            });
        }
    });

    for (const block of blockStack) {
        if (block.isImplicitScope) {
            ranges.push({ start: block.start, end: documentEnd });
        }
    }

    return ranges.filter(range => range.end > range.start);
}

function findVariableReferenceOffsets(text, variableName) {
    const offsets = [];
    scanLines(text, ({ code, lineStart }) => {
        VARIABLE_IDENTIFIER.lastIndex = 0;
        for (const match of code.matchAll(VARIABLE_IDENTIFIER)) {
            const isPropertyName = code.slice(0, match.index).endsWith("::");
            if (match[0] === variableName && !isPropertyName) {
                offsets.push({ start: lineStart + match.index, length: match[0].length });
            }
        }
    });
    return offsets;
}

function variableAtOffset(text, offset) {
    let result;
    scanLines(text, ({ code, lineStart }) => {
        if (result || offset < lineStart || offset > lineStart + code.length) {
            return;
        }

        VARIABLE_IDENTIFIER.lastIndex = 0;
        for (const match of code.matchAll(VARIABLE_IDENTIFIER)) {
            const start = lineStart + match.index;
            const end = start + match[0].length;
            const isPropertyName = code.slice(0, match.index).endsWith("::");
            if (!isPropertyName && offset >= start && offset <= end) {
                result = match[0];
                return;
            }
        }
    });
    return result;
}

module.exports = {
    findImplicitVariableOffsets,
    findImplicitVariableScopeRanges,
    findPipelineGuideRanges,
    findVariableReferenceOffsets,
    variableAtOffset
};
