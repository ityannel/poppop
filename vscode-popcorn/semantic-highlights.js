"use strict";

const { maskNonCode } = require("./assignment-targets");
const { findInterpolatedVariables } = require("./popcorn-strings");
const { forEachBrace } = require("./layout-view");

const VARIABLE_IDENTIFIER = /\b[a-z_][a-zA-Z0-9_]*\b/g;
const PIPELINE_OPERATOR = />[?!]?>/g;
// 式渡し `Map (…)` の丸括弧（複数行にまたがってもよい）。Reduce(初期値) の中の @ も、流れてきた List
const EXPRESSION_BODY_OPEN = />>\s*(?:Map|Filter|Count|Sort|SortDesc|Group|Reduce)(?:\s+as\s+(?:[a-z_][a-zA-Z0-9_]*|\([^)]*\)))?\s*\(/g;
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
        // `{` と `}` を、行の中で出てきた順に読む（閉じと開きが同じ行にあってもよい）
        forEachBrace(code, {
            open: () => blockStack.push({
                start: lineStart,
                isImplicitScope: IMPLICIT_SCOPE_HEADER.test(code)
            }),
            close: () => {
                const block = blockStack.pop();
                if (block && block.isImplicitScope) {
                    ranges.push({ start: block.start, end: lineStart });
                }
            }
        });
    });

    for (const block of blockStack) {
        if (block.isImplicitScope) {
            ranges.push({ start: block.start, end: documentEnd });
        }
    }

    ranges.push(...findExpressionBodyRanges(text));
    return ranges.filter(range => range.end > range.start);
}

function maskedText(text) {
    const state = { inBlockComment: false };
    return text.split("\n").map(line => maskNonCode(line, state)).join("\n");
}

/** 式渡し `xs >> Map (` から、対応する `)` までの範囲（行をまたいでもよい） */
function findExpressionBodyRanges(text) {
    const masked = maskedText(text);
    const ranges = [];
    for (const match of masked.matchAll(EXPRESSION_BODY_OPEN)) {
        const open = match.index + match[0].length - 1;
        let depth = 0;
        let close = masked.length;
        for (let index = open; index < masked.length; index += 1) {
            const ch = masked[index];
            if (ch === "(" || ch === "[" || ch === "{") depth += 1;
            else if (ch === ")" || ch === "]" || ch === "}") {
                depth -= 1;
                if (depth === 0) {
                    close = index;
                    break;
                }
            }
        }
        ranges.push({ start: open + 1, end: close });
    }
    return ranges;
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
    // "…{name}…" の補間の中も、変数の利用
    for (const occurrence of findInterpolatedVariables(text)) {
        if (occurrence.name === variableName) offsets.push({ start: occurrence.start, length: occurrence.length });
    }
    return offsets.sort((left, right) => left.start - right.start);
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
    if (!result) {
        const interpolated = findInterpolatedVariables(text)
            .find(occurrence => offset >= occurrence.start && offset <= occurrence.start + occurrence.length);
        result = interpolated?.name;
    }
    return result;
}

const exported = {
    findExpressionBodyRanges,
    findImplicitVariableOffsets,
    findImplicitVariableScopeRanges,
    findPipelineGuideRanges,
    findVariableReferenceOffsets,
    variableAtOffset
};
// `:` のブロックで書いたテキストも、解析できるようにする（layout-view.js）
module.exports = require("./layout-view").wrapExports(exported, Object.keys(exported));
