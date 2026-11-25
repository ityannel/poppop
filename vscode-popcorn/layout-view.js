"use strict";

// PopCorn のブロックは `:` と字下げで書きます。
// この拡張の解析（変数の範囲、@ の範囲、Update のキーなど）は、行ごとに `{` と `}` を数える作りなので、
// 解析の前に、`:` のブロックを、同じ意味の `{ … }` に見立てたテキスト（ブレース・ビュー）へ置きかえ、
// 結果の位置を、元のテキストの位置へ戻します。
//   * ブロックを開く `:` は、同じ位置の `{` に置きかえます（長さは変わりません）。
//   * ブロックが終わる行の先頭（字下げのあと）に `} ` を差しこみます。
//   * ファイルの終わりで閉じるブロックだけは、最後に `}` の行を 1 行足します（行の番号は、それより前は変わりません）。

// assignment-targets.js もこのファイルを読むので、maskNonCode は使うときに読む（循環を避ける）
function maskNonCode(line, state) {
    return require("./assignment-targets").maskNonCode(line, state);
}

const KEYWORDS = new Set(["when", "else", "as", "pop", "true", "false", "null", "and", "or", "not", "in"]);
const IDENTITY = Object.freeze({ inserts: [] });

function isForkLabelColon(code, colonIndex) {
    const match = /^(\s*)([a-z_][a-zA-Z0-9_]*)\s*:/.exec(code);
    if (!match || KEYWORDS.has(match[2])) return false;
    return match[0].length - 1 === colonIndex;
}

function toBraceView(text) {
    if (typeof text !== "string" || !text.includes(":")) return { text, ...IDENTITY };
    const lines = text.split("\n");
    const state = { inBlockComment: false };
    const stack = [];
    const inserts = [];
    const outLines = [];
    let depth = 0;
    let offset = 0;
    let changed = false;

    for (const line of lines) {
        const code = maskNonCode(line, state);
        const trimmed = code.trim();
        let outLine = line;

        // 字下げは、元の行で数える（行頭の文字列は、隠すと空白になるため）
        const indentOfLine = line.length - line.trimStart().length;
        if (trimmed && depth === 0) {
            const indent = indentOfLine;
            let closes = 0;
            while (stack.length && indent <= stack[stack.length - 1]) {
                stack.pop();
                closes += 1;
            }
            if (closes) {
                const insert = "} ".repeat(closes);
                inserts.push([offset + indent, insert.length]);
                outLine = line.slice(0, indent) + insert + line.slice(indent);
                changed = true;
            }
        }

        const chars = outLine.split("");
        const shift = outLine.length - line.length;
        for (let index = 0; index < code.length; index += 1) {
            const ch = code[index];
            if (ch === "(" || ch === "[" || ch === "{") depth += 1;
            else if (ch === ")" || ch === "]" || ch === "}") depth = Math.max(0, depth - 1);
            else if (ch === ":" && depth === 0) {
                if (code[index + 1] === ":" || code[index - 1] === ":") continue;
                if (isForkLabelColon(code, index)) continue;
                const position = index >= indentOfLine ? index + shift : index;
                chars[position] = "{";
                stack.push(indentOfLine);
                changed = true;
            }
        }
        outLines.push(chars.join(""));
        offset += line.length + 1;
    }

    if (!changed) return { text, ...IDENTITY };
    let braceText = outLines.join("\n");
    if (stack.length) {
        // ファイルの終わりで閉じるブロックは、最後の行のあとに、閉じる行を 1 行足す
        // （最後の行の中で閉じると、その行が範囲の外に出てしまうため）
        const insert = "\n" + "} ".repeat(stack.length).trimEnd();
        inserts.push([text.length, insert.length]);
        braceText += insert;
    }
    return { text: braceText, inserts };
}

function toView(view, position) {
    if (typeof position !== "number") return position;
    let result = position;
    for (const [origin, count] of view.inserts) {
        if (origin <= position) result += count;
    }
    return result;
}

function fromView(view, position) {
    if (typeof position !== "number") return position;
    let shift = 0;
    for (const [origin, count] of view.inserts) {
        const viewOrigin = origin + shift;
        if (position >= viewOrigin + count) shift += count;
        else if (position >= viewOrigin) return origin;
        else break;
    }
    return position - shift;
}

const POSITION_KEY = /^(start|end|offset)$|(Start|End|Offset)$/;

function mapResult(view, value, seen = new Set()) {
    if (Array.isArray(value)) return value.map(item => mapResult(view, item, seen));
    if (!value || typeof value !== "object" || seen.has(value)) return value;
    seen.add(value);
    const mapped = {};
    for (const [key, item] of Object.entries(value)) {
        if (typeof item === "number" && POSITION_KEY.test(key)) mapped[key] = fromView(view, item);
        else mapped[key] = mapResult(view, item, seen);
    }
    return mapped;
}

// (text, …) を受け取る関数を、ブレース・ビューで動かす。名前が AtOffset で終わる関数は、2つめの引数が位置
function withLayout(fn, name) {
    return function layoutAware(text, ...rest) {
        const view = toBraceView(text);
        if (!view.inserts.length && view.text === text) return fn(text, ...rest);
        const args = /AtOffset$/.test(name) && typeof rest[0] === "number"
            ? [toView(view, rest[0]), ...rest.slice(1)]
            : rest;
        return mapResult(view, fn(view.text, ...args));
    };
}

function wrapExports(exportsObject, names) {
    const wrapped = { ...exportsObject };
    for (const name of names) {
        if (typeof exportsObject[name] === "function") wrapped[name] = withLayout(exportsObject[name], name);
    }
    return wrapped;
}

// 行の中の `{` と `}` を、出てきた順に open() / close() へ渡す（from より前は読まない）
function forEachBrace(code, { open, close }, from = 0) {
    for (let index = from; index < code.length; index += 1) {
        if (code[index] === "{") open();
        else if (code[index] === "}") close();
    }
}

// 行頭（空白を除く）に続く `}` の数
function leadingCloseCount(code) {
    return (/^[\s}]*/.exec(code)[0].match(/\}/g) || []).length;
}

module.exports = { toBraceView, toView, fromView, wrapExports, forEachBrace, leadingCloseCount };
