"use strict";

const { maskNonCode } = require("./assignment-targets");

const VARIABLE_IDENTIFIER = /\b[a-z_][a-zA-Z0-9_]*\b/g;
const PIPELINE_OPERATOR = />>/g;
const IMPLICIT_SCOPE_HEADER = /(?:>>\s*(?:Map|Filter|Count|Reduce|Loop|Sort|SortDesc|Group|Fork|Update|Check|Try)|Catch)\b[^\r\n]*\{/;

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
 * Finds Map/Filter/etc. blocks delimited by `{` and `}`.
 * Generic blocks (such as `pop Func {`) are also kept on the stack so
 * nested blocks cannot accidentally close a surrounding @ scope.
 */
function findImplicitVariableScopeRanges(text) {
    const ranges = [];
    const blockStack = [];
    const documentEnd = text.length;

    scanLines(text, ({ code, lineStart }) => {
        const trimmed = code.trim();
        const startsWithClose = /^\}/.test(trimmed);

        if (startsWithClose) {
            const block = blockStack.pop();
            if (block && block.isImplicitScope) {
                ranges.push({ start: block.start, end: lineStart });
            }
        }

        const openCount = (code.match(/\{/g) || []).length;
        const closeCount = (code.match(/\}/g) || []).length;
        const remainingCloses = Math.max(0, closeCount - (startsWithClose ? 1 : 0));
        const netOpens = openCount - remainingCloses;

        if (netOpens > 0) {
            for (let i = 0; i < netOpens; i += 1) {
                blockStack.push({
                    start: lineStart,
                    isImplicitScope: IMPLICIT_SCOPE_HEADER.test(code)
                });
            }
        } else if (netOpens < 0) {
            for (let i = 0; i < -netOpens; i += 1) {
                const block = blockStack.pop();
                if (block && block.isImplicitScope) {
                    ranges.push({ start: block.start, end: lineStart });
                }
            }
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

const exported = {
    findImplicitVariableOffsets,
    findImplicitVariableScopeRanges,
    findPipelineGuideRanges,
    findVariableReferenceOffsets,
    variableAtOffset
};
// `:` のブロックで書いたテキストも、解析できるようにする（layout-view.js）
module.exports = require("./layout-view").wrapExports(exported, Object.keys(exported));
