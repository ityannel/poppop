"use strict";

// PopCorn の 3 種類の文字列（"…" 補間あり、'…' 補間なし、`…` 生）を、行ごとに読みます。
// maskNonCode は文字列を丸ごと空白にするので、"{name}" の中の変数は、ここで別に拾います。

const RESERVED_WORDS = new Set([
    "and", "as", "else", "false", "in", "not", "null", "or", "pop", "true", "when"
]);

// '…' の中で、補間に見える {名前}（{{名前}} は対象外）。popcorn_lang/lexer.py の _LOOKS_INTERPOLATED と同じ
const LOOKS_INTERPOLATED = /(?<!\{)\{\s*[@A-Za-z_(][^{}\n]*\}(?!\})/g;

// 引用符 quote の文字列を index（開きの次）から読み、閉じの位置を返す（なければ行末）
function skipQuoted(line, index, quote) {
    while (index < line.length) {
        if (line[index] === "\\" && quote !== "`") index += 2;
        else if (line[index] === quote) return index;
        else index += 1;
    }
    return line.length;
}

// "…" の中の {式} の範囲を、index（開きの " の次）から集める。閉じの " の位置を返す
function scanInterpolated(line, index, lineStart, out) {
    while (index < line.length) {
        const ch = line[index];
        if (ch === "\\") {
            index += 2;
        } else if (ch === "\"") {
            return index;
        } else if (ch === "{" && line[index + 1] === "{") {
            index += 2;
        } else if (ch === "}" && line[index + 1] === "}") {
            index += 2;
        } else if (ch === "{") {
            const exprStart = index + 1;
            let depth = 1;
            index += 1;
            while (index < line.length && depth > 0) {
                const inner = line[index];
                if (inner === "\"" || inner === "'" || inner === "`") {
                    index = skipQuoted(line, index + 1, inner) + 1;
                    continue;
                }
                if (inner === "{") depth += 1;
                else if (inner === "}") depth -= 1;
                index += 1;
            }
            const exprEnd = depth === 0 ? index - 1 : index;
            out.push({ kind: "interpolation", start: lineStart + exprStart, end: lineStart + exprEnd });
        } else {
            index += 1;
        }
    }
    return line.length;
}

/**
 * 文字列の位置を返します。
 *   { kind: "interpolation", start, end }  "…" の中の {式} の中身
 *   { kind: "plain", start, end }          '…' の中身
 */
function findStringParts(text) {
    const parts = [];
    let lineStart = 0;
    for (const line of text.split("\n")) {
        let index = 0;
        while (index < line.length) {
            const ch = line[index];
            if (ch === "/" && line[index + 1] === "/") break;
            if (ch === "`") {
                index = skipQuoted(line, index + 1, "`") + 1;
            } else if (ch === "'") {
                const end = skipQuoted(line, index + 1, "'");
                parts.push({ kind: "plain", start: lineStart + index + 1, end: lineStart + end });
                index = end + 1;
            } else if (ch === "\"") {
                index = scanInterpolated(line, index + 1, lineStart, parts) + 1;
            } else {
                index += 1;
            }
        }
        lineStart += line.length + 1;
    }
    return parts;
}

// 式の中の文字列を空白にする（位置は変えない）
function maskInnerStrings(expression) {
    const chars = expression.split("");
    let index = 0;
    while (index < chars.length) {
        const ch = expression[index];
        if (ch === "\"" || ch === "'" || ch === "`") {
            const end = Math.min(skipQuoted(expression, index + 1, ch), expression.length - 1);
            for (let i = index; i <= end; i += 1) chars[i] = " ";
            index = end + 1;
        } else {
            index += 1;
        }
    }
    return chars.join("");
}

/** "{name}" の補間の中で使われている変数（小文字の名前）の位置 */
function findInterpolatedVariables(text) {
    const occurrences = [];
    for (const part of findStringParts(text)) {
        if (part.kind !== "interpolation") continue;
        const expression = maskInnerStrings(text.slice(part.start, part.end));
        for (const match of expression.matchAll(/\b[a-z_][a-zA-Z0-9_]*\b/g)) {
            if (RESERVED_WORDS.has(match[0])) continue;
            if (expression.slice(0, match.index).endsWith("::")) continue;
            if (expression[match.index - 1] === "@") continue;
            occurrences.push({ name: match[0], start: part.start + match.index, length: match[0].length });
        }
    }
    return occurrences;
}

/** '…' の中の、補間に見える {…} の位置（補間されないことを知らせるため） */
function findPlainStringInterpolations(text) {
    const found = [];
    for (const part of findStringParts(text)) {
        if (part.kind !== "plain") continue;
        const content = text.slice(part.start, part.end);
        for (const match of content.matchAll(LOOKS_INTERPOLATED)) {
            found.push({ start: part.start + match.index, length: match[0].length, text: match[0] });
        }
    }
    return found;
}

module.exports = { findStringParts, findInterpolatedVariables, findPlainStringInterpolations };
