"use strict";

const { findFinalAssignmentTargetOffsets, maskNonCode } = require("./assignment-targets");
const { findImplicitVariableScopeRanges, findVariableReferenceOffsets, variableAtOffset } = require("./semantic-highlights");

const IDENTIFIER = /\b[a-z_][a-zA-Z0-9_]*\b/g;
const PIPELINE_OPERATOR = />>/g;
const STREAM_BLOCK = /(?:>>\s*(Map|Filter|Reduce|Loop|Sort|SortDesc|Group|Fork|Update|Check|Try)|(Catch))\b/;
const STREAM_ALIAS_PATTERN = /(?:>>\s*(?:Map|Filter|Reduce(?:\s*\([^)]*\))?|Loop|Sort|SortDesc|Group|Fork|Update|Check|Try)|Catch)\s+as\s+(?:([a-z_][a-zA-Z0-9_]*)|\(\s*([^)]+)\))/g;
const RESERVED_WORDS = new Set([
    "and", "as", "else", "false", "in", "not", "null", "or", "pop", "true", "when"
]);

// PopCorn 1 本体に実装されている標準関数と、エディター上での説明です。
// `output` は型フロー表示で使う、おおまかな戻り値の型です。
const STANDARD_FUNCTIONS = Object.freeze({
    Display: { description: "値を表示し、そのまま次の処理へ渡します。", output: "same" },
    Input: { description: "プロンプトを表示して入力を受け取り、文字列として渡します。", output: "文字列" },
    ReadFile: { description: "ローカルファイルの内容を UTF-8 の文字列として読み込みます。", output: "文字列" },
    WriteFile: { description: "指定した内容をファイルへ書き込み、内容をそのまま返します。", output: "same" },
    Fetch: { description: "URL へ HTTP GET リクエストを送り、応答本文を返します。", output: "文字列" },
    PostFetch: { description: "URL へ HTTP POST リクエストを送り、応答本文を返します。", output: "文字列" },
    HttpRequest: { description: "任意の HTTP リクエストを送り、status・headers・body の辞書を返します。", output: "辞書" },
    Type: { description: "値の型名を文字列で返します。", output: "文字列" },
    Sleep: { description: "指定秒数だけ待機し、値はそのまま渡します。", output: "same" },
    Add: { description: "2 つの値を加算または連結します。", output: "数値" },
    Div: { description: "2 つの整数を 0 の方向へ切り捨てて整数除算します。", output: "数値" },
    Sum: { description: "数値の配列を合計します。", output: "数値" },
    Max: { description: "配列の最大値を返します。", output: "要素" },
    Min: { description: "配列の最小値を返します。", output: "要素" },
    Average: { description: "数値の配列の平均を Num で返します。", output: "数値" },
    Round: { description: "数値を四捨五入して最も近い整数値の Num を返します。", output: "数値" },
    Abs: { description: "数値の絶対値を返します。", output: "数値" },
    Num: { description: "変換できる値を数値（Num）に変換します。", output: "数値" },
    Str: { description: "値を規定の形式の文字列に変換します。", output: "文字列" },
    Bool: { description: "値を厳格なルールで真偽値に変換します。", output: "真偽値" },
    List: { description: "リストまたは値リストをリストとして返します。", output: "配列" },
    Array: { description: "指定した大きさの配列を 0 で埋めて作成します。", output: "配列" },
    Dict: { description: "値が辞書であることを確認して返します。", output: "辞書" },
    Length: { description: "文字列・配列・辞書・値リストの長さを返します。", output: "数値" },
    Sort: { description: "配列をキーで昇順に安定ソートします。", output: "配列" },
    SortDesc: { description: "配列をキーで降順に安定ソートします。", output: "配列" },
    Reverse: { description: "配列または文字列を逆順にします。", output: "same" },
    Uppercase: { description: "文字列をすべて大文字にします。", output: "文字列" },
    Lowercase: { description: "文字列をすべて小文字にします。", output: "文字列" },
    Split: { description: "文字列を区切り文字で分割して配列にします。", output: "配列" },
    Replace: { description: "文字列内の文字列を置き換えます。", output: "文字列" },
    Join: { description: "配列の要素を文字列化して区切り文字で連結します。", output: "文字列" },
    Get: { description: "辞書のキー、または配列の位置から値を取り出します（省略可能な既定値付き）。", output: "要素" },
    Set: { description: "辞書または配列の値を非破壊的に置き換えます。", output: "same" },
    Remove: { description: "辞書から指定キーを取り除いた新しい辞書を返します。", output: "辞書" },
    Keys: { description: "辞書のキー一覧を挿入順の配列で返します。", output: "配列" },
    Values: { description: "辞書の値一覧を挿入順の配列で返します。", output: "配列" },
    Entries: { description: "辞書の [key, value] ペアを挿入順の配列で返します。", output: "配列" },
    Merge: { description: "2 つの辞書を結合した新しい辞書を返します。", output: "辞書" },
    Contains: { description: "値やキー・部分文字列を含むかどうかを調べます。", output: "真偽値" },
    Append: { description: "配列の末尾に値を追加した新しい配列を返します。", output: "配列" },
    Slice: { description: "文字列または配列の一部を切り出します。", output: "same" },
    Format: { description: "位置プレースホルダ {0}, {1} で文字列を整形します。", output: "文字列" },
    Now: { description: "現在日時を辞書で取得します。", output: "辞書" },
    Random: { description: "指定範囲のランダムな整数を生成します。", output: "数値" },
    ToJson: { description: "値を JSON 文字列に変換します。", output: "文字列" },
    FromJson: { description: "JSON 文字列を PopCorn の値へ変換します。", output: "式" },
    Range: { description: "(start, end) の連続した整数の配列を作成します。", output: "配列" },
    Return: { description: "いちばん内側の pop 関数から値を返します。", output: "式" },
    Break: { description: "いちばん内側の Loop を終了して値を返します。", output: "式" },
    Group: { description: "ブロックが返す文字列をキーとして配列をグループ化します。", output: "辞書" },
    Fork: { description: "同じ入力から複数の分岐を評価します。", output: "式" },
    Check: { description: "when / else の条件分岐で 1 つのブロックを選びます。", output: "式" },
    Try: { description: "エラーを Catch で捕捉するブロックを開始します。", output: "式" },
    Catch: { description: "Try ブロックで起きたエラーを受け取って回復します。", output: "式" },
    Debug: { description: "デバッグ用に型と値を表示し、そのまま渡します。", output: "same" },
    Throw: { description: "指定した内容で UserError を発生させます。", output: "エラー" },
    Map: { description: "配列の各要素を変換します。", output: "配列" },
    Filter: { description: "条件に合う配列要素だけを残します。", output: "配列" },
    Reduce: { description: "配列を 1 つの値へ集約します。", output: "要素" },
    Zip: { description: "複数の配列を位置ごとにまとめます。", output: "配列" },
    Loop: { description: "状態値を Break まで繰り返し更新します。", output: "式" },
    Update: { description: "辞書のキーを非破壊的に更新・追加します。", output: "辞書" }
});

const SYSTEM_KEYWORDS = Object.freeze({
    when: "Check の Bool 条件分岐、または文末の条件付き実行（後置 when）に使います。",
    else: "それまでの条件に一致しない場合の分岐です。",
    as: "ストリームブロックの現在値に別名を付けます。",
    pop: "トップレベルのユーザー定義関数を宣言します。",
    true: "Bool の真を表します。",
    false: "Bool の偽を表します。",
    null: "Null 値を表します。",
    and: "Bool の短絡論理積です。",
    or: "Bool の短絡論理和です。",
    not: "Bool を否定します。",
    in: "要素・キー・部分文字列の含有判定（Bool）を行います。"
});

function scanLines(text, callback) {
    const lines = text.split("\n");
    const state = { inBlockComment: false };
    let lineStart = 0;

    lines.forEach((line, lineNumber) => {
        callback({ line, code: maskNonCode(line, state), lineNumber, lineStart });
        lineStart += line.length + 1;
    });
}

function lineInfoAtOffset(text, offset) {
    let result;
    scanLines(text, info => {
        if (!result && offset >= info.lineStart && offset <= info.lineStart + info.line.length) {
            result = info;
        }
    });
    return result;
}

function lineInfoAtLineNumber(text, lineNumber) {
    let result;
    scanLines(text, info => {
        if (info.lineNumber === lineNumber) {
            result = info;
        }
    });
    return result;
}

function firstNonWhitespaceIndex(text) {
    const match = /\S/.exec(text);
    return match ? match.index : -1;
}

function lastNonWhitespaceIndex(text) {
    for (let index = text.length - 1; index >= 0; index -= 1) {
        if (!/\s/.test(text[index])) {
            return index;
        }
    }
    return -1;
}

function maskedDocument(text) {
    const state = { inBlockComment: false };
    return text.split("\n").map(line => maskNonCode(line, state)).join("\n");
}

function expressionStartOffset(text, candidateStart) {
    const masked = maskedDocument(text);
    const openingFor = { "]": "[", "}": "{", ")": "(" };
    const firstCharacter = masked[candidateStart];
    if (!openingFor[firstCharacter]) {
        return candidateStart;
    }

    const expectedOpenings = [];
    for (let index = candidateStart; index >= 0; index -= 1) {
        const character = masked[index];
        if (openingFor[character]) {
            expectedOpenings.push(openingFor[character]);
        } else if (expectedOpenings.length && character === expectedOpenings.at(-1)) {
            expectedOpenings.pop();
            if (expectedOpenings.length === 0) {
                return index;
            }
        }
    }
    return candidateStart;
}

function findBindings(text) {
    return findFinalAssignmentTargetOffsets(text).map(binding => {
        const line = lineInfoAtOffset(text, binding.start);
        return {
            ...binding,
            kind: "assignment",
            name: text.slice(binding.start, binding.start + binding.length),
            line: line?.lineNumber,
            lineStart: line?.lineStart
        };
    });
}

function findVariableAtOffset(text, offset) {
    return variableAtOffset(text, offset);
}

function isVariableName(name) {
    return /^[a-z_][a-zA-Z0-9_]*$/.test(name || "") && !RESERVED_WORDS.has(name);
}

function findStreamParameterDefinitions(text, name) {
    const definitions = [];
    scanLines(text, ({ code, lineNumber, lineStart }) => {
        for (const stream of code.matchAll(STREAM_ALIAS_PATTERN)) {
            const parameterText = stream[1] || stream[2] || "";
            const asIndex = stream[0].indexOf("as");
            const parameterStart = stream.index + stream[0].indexOf(parameterText, asIndex + 2);
            for (const parameter of parameterText.matchAll(/[a-z_][a-zA-Z0-9_]*/g)) {
                if (parameter[0] !== name) continue;
                definitions.push({
                    kind: "stream-parameter",
                    name,
                    start: lineStart + parameterStart + parameter.index,
                    length: name.length,
                    line: lineNumber,
                    lineStart
                });
            }
        }
    });
    return definitions;
}

function findVariableDefinitions(text, name) {
    return [
        ...findBindings(text).filter(binding => binding.name === name),
        ...findStreamParameterDefinitions(text, name)
    ].sort((left, right) => left.start - right.start);
}

function findVariableReferences(text, name) {
    return findVariableReferenceOffsets(text, name);
}

function describeBlockHeader(code) {
    const functionMatch = /\bpop\s+([A-Z][a-zA-Z0-9_]*)\s*\{/.exec(code);
    if (functionMatch) {
        return { kind: "function", name: functionMatch[1] };
    }

    const streamMatch = STREAM_BLOCK.exec(code);
    if (streamMatch) {
        const name = streamMatch[1] || streamMatch[2];
        const kind = ["Check", "Loop", "Try", "Catch"].includes(name) ? "control" : "stream";
        return { kind, name };
    }

    return { kind: "block", name: "block" };
}

function findBlockRanges(text) {
    const blocks = [];
    const stack = [];
    let lastLine = 0;

    scanLines(text, ({ code, lineNumber }) => {
        lastLine = lineNumber;
        const trimmed = code.trim();
        const startsWithClose = /^\}/.test(trimmed);

        if (startsWithClose) {
            const block = stack.pop();
            if (block) {
                blocks.push({ ...block, endLine: lineNumber });
            }
        }

        const openCount = (code.match(/\{/g) || []).length;
        const closeCount = (code.match(/\}/g) || []).length;
        const remainingCloses = Math.max(0, closeCount - (startsWithClose ? 1 : 0));
        const netOpens = openCount - remainingCloses;

        if (netOpens > 0) {
            for (let i = 0; i < netOpens; i += 1) {
                stack.push({ ...describeBlockHeader(code), startLine: lineNumber });
            }
        } else if (netOpens < 0) {
            for (let i = 0; i < -netOpens; i += 1) {
                const block = stack.pop();
                if (block) {
                    blocks.push({ ...block, endLine: lineNumber });
                }
            }
        }
    });

    for (const block of stack) {
        blocks.push({ ...block, endLine: lastLine });
    }
    return blocks;
}

function inferValueType(expression) {
    const value = expression.trim();
    if (/^[-+]?\d+(?:\.\d+)?$/.test(value)) return "数値";
    if (/^"/.test(value) || /^'/.test(value)) return "文字列";
    if (/^\[/.test(value)) return "配列";
    if (/^\{/.test(value)) return "辞書";
    if (/^(true|false)$/.test(value)) return "真偽値";
    if (isVariableName(value)) return `変数 ${value}`;
    return "式";
}

function stageName(stage) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\b/.exec(stage.replace(/[.:}]+\s*$/, ""));
    return match?.[1];
}

function bindingTargetName(stage) {
    const match = /^\s*([a-z_][a-zA-Z0-9_]*)\s*\.\s*$/.exec(stage);
    return match?.[1];
}

function outputTypeForStage(stage, inputType) {
    const name = stageName(stage);
    const standard = name && STANDARD_FUNCTIONS[name];
    if (!standard || standard.output === "same") return inputType;
    return standard?.output || "式";
}

function buildTypeFlow(line, operators, inputEnd, end, inputExpression, carriedType) {
    const stages = [];
    let currentType = carriedType || inferValueType(inputExpression ?? line.code.slice(0, inputEnd));
    for (let index = 0; index < operators.length; index += 1) {
        const stageStart = operators[index].index + operators[index][0].length;
        const stageEnd = index + 1 < operators.length ? operators[index + 1].index : end + 1;
        const source = line.code.slice(stageStart, stageEnd).trim();
        const bindingTarget = bindingTargetName(source);
        const outputType = outputTypeForStage(source, currentType);
        stages.push({
            name: stageName(source) || "処理",
            inputType: currentType,
            outputType,
            bindingTarget
        });
        currentType = outputType;
    }
    return stages;
}

function typeFlowSummary(typeFlow) {
    if (!typeFlow.length) return "型を推定できません";
    const first = typeFlow[0];
    const binding = typeFlow.find(stage => stage.bindingTarget);
    return [
        `入力（${first.inputType}）`,
        ...typeFlow
            .filter(stage => !stage.bindingTarget)
            .map(stage => `${stage.name}（${stage.outputType}）`),
        ...(binding ? [`最終代入先: ${binding.bindingTarget}`] : [])
    ].join(" → ");
}

function findPipelineAtOffset(text, offset) {
    const line = lineInfoAtOffset(text, offset);
    if (!line) return undefined;

    const operators = [...line.code.matchAll(PIPELINE_OPERATOR)];
    PIPELINE_OPERATOR.lastIndex = 0;
    const operator = operators.find(match => {
        const start = line.lineStart + match.index;
        return offset >= start && offset <= start + match[0].length;
    });
    if (!operator) return undefined;

    const start = firstNonWhitespaceIndex(line.line);
    const end = lastNonWhitespaceIndex(line.code);
    const operatorIndex = operators.indexOf(operator);
    const stageStart = operator.index + operator[0].length;
    const stageEnd = operatorIndex + 1 < operators.length ? operators[operatorIndex + 1].index : end + 1;
    const inputEnd = operators[0].index;
    const bindings = findBindings(text).filter(binding => binding.line === line.lineNumber);

    let pipelineStart = expressionStartOffset(text, line.lineStart + start);
    let pipelineEnd = line.lineStart + end + 1;
    const blocks = findBlockRanges(text);
    const block = blocks.find(candidate => candidate.startLine === line.lineNumber || candidate.endLine === line.lineNumber);
    if (block) {
        const blockStartLine = lineInfoAtLineNumber(text, block.startLine);
        const blockEndLine = lineInfoAtLineNumber(text, block.endLine);
        pipelineStart = Math.min(pipelineStart, blockStartLine.lineStart + firstNonWhitespaceIndex(blockStartLine.line));
        pipelineEnd = Math.max(pipelineEnd, blockEndLine.lineStart + lastNonWhitespaceIndex(blockEndLine.code) + 1);
    }

    const carriedType = block && /^\s*\}/.test(line.code)
        ? STANDARD_FUNCTIONS[block.name]?.output
        : undefined;
    const typeFlow = buildTypeFlow(
        line,
        operators,
        inputEnd,
        end,
        text.slice(pipelineStart, line.lineStart + inputEnd),
        carriedType
    );
    const currentStage = typeFlow[operatorIndex];
    return {
        start: pipelineStart,
        end: pipelineEnd,
        operator: operator[0],
        stage: line.code.slice(stageStart, stageEnd).trim(),
        stageNumber: operatorIndex + 1,
        inputType: currentStage?.inputType || inferValueType(text.slice(pipelineStart, line.lineStart + inputEnd)),
        outputType: currentStage?.outputType || "式",
        typeFlow,
        target: bindings.at(-1)?.name
    };
}

function allVariableOccurrences(text) {
    const occurrences = [];
    scanLines(text, ({ code, lineStart }) => {
        IDENTIFIER.lastIndex = 0;
        for (const match of code.matchAll(IDENTIFIER)) {
            const before = code.slice(0, match.index);
            const after = code.slice(match.index + match[0].length);
            const isPropertyName = before.endsWith("::");
            const isForkLabel = /^\s*$/.test(before) && /^\s*:(?!:)/.test(after);
            if (isVariableName(match[0]) && !isPropertyName && !isForkLabel) {
                occurrences.push({ name: match[0], start: lineStart + match.index, length: match[0].length });
            }
        }
    });
    return occurrences;
}

function namedImplicitVariables(text) {
    const names = new Set();
    scanLines(text, ({ code }) => {
        for (const match of code.matchAll(/@([a-z_][a-zA-Z0-9_]*)/g)) {
            names.add(match[1]);
        }
    });
    return names;
}

function functionParameters(text) {
    const names = new Set();
    scanLines(text, ({ code }) => {
        const functionOperator = code.indexOf(">> pop");
        if (functionOperator === -1) return;
        const parameterPart = code.slice(0, functionOperator);
        IDENTIFIER.lastIndex = 0;
        for (const match of parameterPart.matchAll(IDENTIFIER)) {
            if (isVariableName(match[0])) {
                names.add(match[0]);
            }
        }
    });
    return names;
}

function streamParameters(text) {
    const names = new Set();
    scanLines(text, ({ code }) => {
        for (const stream of code.matchAll(STREAM_ALIAS_PATTERN)) {
            const parameterText = stream[1] || stream[2] || "";
            for (const match of parameterText.matchAll(/[a-z_][a-zA-Z0-9_]*/g)) {
                names.add(match[0]);
            }
        }
    });
    return names;
}

function tokenAtOffset(text, offset) {
    let result;
    scanLines(text, ({ code, lineStart }) => {
        if (result || offset < lineStart || offset > lineStart + code.length) return;
        for (const match of code.matchAll(/\b[A-Za-z_][A-Za-z0-9_]*\b/g)) {
            const start = lineStart + match.index;
            const end = start + match[0].length;
            if (offset >= start && offset <= end) {
                result = { word: match[0], start, length: match[0].length };
                return;
            }
        }
    });
    return result;
}

function findPropertyAtOffset(text, offset) {
    let result;
    scanLines(text, ({ code, lineStart }) => {
        if (result || offset < lineStart || offset > lineStart + code.length) return;
        for (const match of code.matchAll(/::([a-z_][a-zA-Z0-9_]*)/g)) {
            const start = lineStart + match.index + 2;
            const end = start + match[1].length;
            if (offset >= start && offset <= end) {
                result = { name: match[1], start, length: match[1].length };
                return;
            }
        }
    });
    return result;
}

function streamContextFromHeader(code) {
    const match = /(?:>>\s*(Map|Filter|Reduce|Loop|Sort|SortDesc|Group|Fork|Update|Check|Try)|(Catch))\b(?:\s*\([^)]*\))?(?:\s+as\s+(?:([a-z_][a-zA-Z0-9_]*)|\(\s*([^)]+)\)))?\s*\{/.exec(code);
    if (!match) return undefined;
    const stream = match[1] || match[2];
    const paramText = match[3] || match[4] || "";
    const parameters = paramText.match(/[a-z_][a-zA-Z0-9_]*/g) || [];
    return {
        stream,
        parameters,
        value: parameters.length > 1 ? `(${parameters.join(", ")})` : (parameters[0] || "@")
    };
}

/**
 * Resolves the implicit @ at an offset. Update and other nested blocks retain
 * the nearest surrounding stream context, so `::name` can explain its source.
 */
function implicitContextAtOffset(text, offset) {
    const stack = [];
    let context;
    scanLines(text, ({ code, lineStart }) => {
        if (context || lineStart > offset) return;
        const trimmed = code.trim();
        const startsWithClose = /^\}/.test(trimmed);
        if (startsWithClose) {
            stack.pop();
        }
        const openCount = (code.match(/\{/g) || []).length;
        const closeCount = (code.match(/\}/g) || []).length;
        const remainingCloses = Math.max(0, closeCount - (startsWithClose ? 1 : 0));
        const netOpens = openCount - remainingCloses;
        if (netOpens > 0) {
            for (let i = 0; i < netOpens; i += 1) {
                stack.push({ streamContext: streamContextFromHeader(code) });
            }
        } else if (netOpens < 0) {
            for (let i = 0; i < -netOpens; i += 1) stack.pop();
        }
        if (offset >= lineStart && offset <= lineStart + code.length) {
            context = [...stack].reverse().find(block => block.streamContext)?.streamContext;
        }
    });
    return context;
}

function isImplicitMarkerAtOffset(text, offset) {
    let result = false;
    scanLines(text, ({ code, lineStart }) => {
        const index = offset - lineStart;
        if (index >= 0 && index < code.length && code[index] === "@") result = true;
    });
    return result;
}

function implicitValueAtOffset(text, offset) {
    const lineStart = text.lastIndexOf("\n", offset - 1) + 1;
    const lineEnd = text.indexOf("\n", offset);
    const line = text.slice(lineStart, lineEnd < 0 ? text.length : lineEnd);
    const markerIndex = offset - lineStart;
    if (line[markerIndex] !== "@") return undefined;

    const before = line.slice(0, markerIndex).replace(/\/\/.*$/, "");
    const operators = [...before.matchAll(/>>/g)];
    const currentOperator = operators.at(-1);
    if (!currentOperator) return undefined;
    const previousOperator = operators.at(-2);
    const expressionStart = previousOperator
        ? previousOperator.index + previousOperator[0].length
        : 0;
    const expression = before.slice(expressionStart, currentOperator.index).trim();
    return expression ? { expression, type: inferValueType(expression) } : undefined;
}

function findPropertyDefinitions(text, name) {
    const definitions = [];
    const pattern = new RegExp(`"${name}"\\s*:`, "g");
    for (const match of text.matchAll(pattern)) {
        definitions.push({
            kind: "property-definition",
            name,
            start: match.index + 1,
            length: name.length
        });
    }
    return definitions;
}

function findPropertyReferences(text, name) {
    const references = [...findPropertyDefinitions(text, name)];
    scanLines(text, ({ code, lineStart }) => {
        const pattern = new RegExp(`::(${name})\\b`, "g");
        for (const match of code.matchAll(pattern)) {
            references.push({
                kind: "property-reference",
                name,
                start: lineStart + match.index + 2,
                length: name.length
            });
        }
    });
    return references.sort((left, right) => left.start - right.start);
}

function objectLiteralKeys(text) {
    const keys = new Set();
    for (const match of text.matchAll(/"([^"\\]+)"\s*:/g)) {
        keys.add(match[1]);
    }
    return keys;
}

function findUpdatePropertyOffsets(text) {
    const knownKeys = objectLiteralKeys(text);
    const properties = [];
    const stack = [];

    scanLines(text, ({ code, lineStart }) => {
        const trimmed = code.trim();
        const startsWithClose = /^\}/.test(trimmed);
        if (startsWithClose) {
            stack.pop();
        }

        const updateBlock = [...stack].reverse().find(block => block.kind === "update");
        if (updateBlock) {
            const targetPrefix = updateBlock.alias ? `(?:@|${updateBlock.alias})` : "@";
            const pattern = new RegExp(`>>\\s*${targetPrefix}::([a-z_][a-zA-Z0-9_]*)`, "g");
            for (const match of code.matchAll(pattern)) {
                const name = match[1];
                const nameOffset = match[0].lastIndexOf(name);
                const isNew = !knownKeys.has(name);
                properties.push({ start: lineStart + match.index + nameOffset, length: name.length, name, isNew });
                knownKeys.add(name);
            }
        }

        const openCount = (code.match(/\{/g) || []).length;
        const closeCount = (code.match(/\}/g) || []).length;
        const remainingCloses = Math.max(0, closeCount - (startsWithClose ? 1 : 0));
        const netOpens = openCount - remainingCloses;
        if (netOpens > 0) {
            const updateMatch = />>\s*Update(?:\s+as\s+([a-z_][a-zA-Z0-9_]*))?\s*\{/.exec(code);
            for (let i = 0; i < netOpens; i += 1) {
                stack.push(
                    updateMatch
                        ? { kind: "update", alias: updateMatch[1] || "" }
                        : { kind: "block", alias: "" }
                );
            }
        } else if (netOpens < 0) {
            for (let i = 0; i < -netOpens; i += 1) stack.pop();
        }
    });
    return properties;
}

function differsByOneNonNumericCharacter(left, right) {
    if (left === right || Math.abs(left.length - right.length) > 1) return false;

    let leftIndex = 0;
    let rightIndex = 0;
    let differences = 0;
    while (leftIndex < left.length && rightIndex < right.length) {
        if (left[leftIndex] === right[rightIndex]) {
            leftIndex += 1;
            rightIndex += 1;
            continue;
        }
        differences += 1;
        if (differences > 1) return false;

        if (left.length === right.length) {
            if (/\d/.test(left[leftIndex]) && /\d/.test(right[rightIndex])) return false;
            leftIndex += 1;
            rightIndex += 1;
        } else if (left.length > right.length) {
            if (/\d/.test(left[leftIndex])) return false;
            leftIndex += 1;
        } else {
            if (/\d/.test(right[rightIndex])) return false;
            rightIndex += 1;
        }
    }

    if (leftIndex < left.length || rightIndex < right.length) {
        differences += 1;
        const remainder = leftIndex < left.length ? left[leftIndex] : right[rightIndex];
        if (/\d/.test(remainder)) return false;
    }
    return differences === 1;
}

function findUpdateScopeRanges(text) {
    const ranges = [];
    const stack = [];
    scanLines(text, ({ code, lineStart }) => {
        const trimmed = code.trim();
        const startsWithClose = /^\}/.test(trimmed);
        if (startsWithClose) {
            const block = stack.pop();
            if (block?.kind === "update") ranges.push({ start: block.start, end: lineStart });
        }
        const openCount = (code.match(/\{/g) || []).length;
        const closeCount = (code.match(/\}/g) || []).length;
        const remainingCloses = Math.max(0, closeCount - (startsWithClose ? 1 : 0));
        const netOpens = openCount - remainingCloses;
        if (netOpens > 0) {
            for (let i = 0; i < netOpens; i += 1) {
                stack.push({
                    kind: />>\s*Update\b/.test(code) ? "update" : "block",
                    start: lineStart
                });
            }
        } else if (netOpens < 0) {
            for (let i = 0; i < -netOpens; i += 1) {
                const block = stack.pop();
                if (block?.kind === "update") ranges.push({ start: block.start, end: lineStart });
            }
        }
    });
    for (const block of stack) {
        if (block.kind === "update") ranges.push({ start: block.start, end: text.length });
    }
    return ranges;
}

function isOffsetInsideUpdate(text, offset) {
    return findUpdateScopeRanges(text).some(range => offset >= range.start && offset < range.end);
}

function inferVariableType(text, name) {
    const definition = findVariableDefinitions(text, name)[0];
    if (!definition) return "不明";
    if (definition.kind === "stream-parameter") return "ストリーム要素";

    const line = lineInfoAtLineNumber(text, definition.line);
    const operator = line && [...line.code.matchAll(PIPELINE_OPERATOR)].at(-1);
    if (!line || !operator) return "式";
    const pipeline = findPipelineAtOffset(text, line.lineStart + operator.index + 1);
    return pipeline?.outputType || "式";
}

function typeMismatchDiagnostic(inputType, functionName, start, length) {
    const expected = {
        Num: ["数値", "文字列"],
        Uppercase: ["文字列"],
        Lowercase: ["文字列"],
        Sum: ["配列"],
        Average: ["配列"],
        Sort: ["配列"],
        SortDesc: ["配列"],
        Update: ["辞書"],
        Keys: ["辞書"],
        Values: ["辞書"],
        Entries: ["辞書"],
        Map: ["配列"],
        Filter: ["配列"],
        Reduce: ["配列"],
        Group: ["配列"],
        Zip: ["配列"]
    };
    if (!expected[functionName] || inputType === "式" || inputType.startsWith("変数 ")) return undefined;
    if (expected[functionName].includes(inputType)) return undefined;
    return {
        kind: "pipeline-type-mismatch",
        severity: "warning",
        start,
        length,
        message: `${functionName} は ${expected[functionName].join(" または ")} を受け取りますが、入力は ${inputType} です。`
    };
}

function pipelineDiagnostics(text) {
    const diagnostics = [];
    scanLines(text, ({ line, code, lineStart }) => {
        const operators = [...code.matchAll(PIPELINE_OPERATOR)];
        PIPELINE_OPERATOR.lastIndex = 0;
        if (!operators.length) return;

        const firstStage = line.slice(0, operators[0].index).trim();
        if (!firstStage && !code.trimStart().startsWith("}")) {
            diagnostics.push({
                kind: "empty-pipeline-input",
                severity: "warning",
                start: lineStart + operators[0].index,
                length: operators[0][0].length,
                message: "パイプラインの先頭に入力値がありません。"
            });
        }

        const typeFlow = buildTypeFlow({ code: line }, operators, operators[0].index, lastNonWhitespaceIndex(code));
        for (let index = 0; index < operators.length; index += 1) {
            const stageStart = operators[index].index + operators[index][0].length;
            const stageEnd = index + 1 < operators.length ? operators[index + 1].index : code.length;
            const stage = code.slice(stageStart, stageEnd).trim();
            if (!stage || stage === ".") {
                diagnostics.push({
                    kind: "empty-pipeline-stage",
                    severity: "warning",
                    start: lineStart + operators[index].index,
                    length: operators[index][0].length,
                    message: "'>>' の後に処理または代入先を指定してください。"
                });
                continue;
            }
            const name = stageName(stage);
            const mismatch = typeMismatchDiagnostic(
                typeFlow[index]?.inputType || "式",
                name,
                lineStart + stageStart,
                name?.length || stage.length
            );
            if (mismatch) diagnostics.push(mismatch);
        }
    });
    return diagnostics;
}

function isInsideRange(offset, ranges) {
    return ranges.some(range => offset >= range.start && offset < range.end);
}

function isDiagnosticIgnoredAtOffset(text, diagnostic, offset) {
    const lineStart = text.lastIndexOf("\n", offset - 1) + 1;
    const lineEnd = text.indexOf("\n", offset);
    const line = text.slice(lineStart, lineEnd < 0 ? text.length : lineEnd);
    const directive = /\/\/\s*popcorn-ignore\s*:\s*([a-z0-9_-]+|all)\b/i.exec(line);
    return Boolean(directive && (directive[1] === "all" || directive[1] === diagnostic.kind));
}

function analyzeDocument(text) {
    const diagnostics = [];
    const bindings = findBindings(text);
    const defined = new Set(bindings.map(binding => binding.name));
    for (const name of namedImplicitVariables(text)) defined.add(name);
    for (const name of functionParameters(text)) defined.add(name);
    for (const name of streamParameters(text)) defined.add(name);
    const occurrences = allVariableOccurrences(text);
    const seenUndefined = new Set();

    for (const occurrence of occurrences) {
        if (!defined.has(occurrence.name) && !seenUndefined.has(`${occurrence.name}:${occurrence.start}`)) {
            diagnostics.push({
                kind: "undefined-variable",
                severity: "warning",
                start: occurrence.start,
                length: occurrence.length,
                message: `未定義の変数 '${occurrence.name}' です。`
            });
            seenUndefined.add(`${occurrence.name}:${occurrence.start}`);
        }
    }

    const bindingCounts = new Map();
    for (const binding of bindings) {
        bindingCounts.set(binding.name, (bindingCounts.get(binding.name) || 0) + 1);
    }
    const referenceCounts = new Map();
    for (const occurrence of occurrences) {
        referenceCounts.set(occurrence.name, (referenceCounts.get(occurrence.name) || 0) + 1);
    }
    for (const binding of bindings) {
        if (referenceCounts.get(binding.name) <= bindingCounts.get(binding.name)) {
            diagnostics.push({
                kind: "unused-assignment",
                severity: "information",
                start: binding.start,
                length: binding.length,
                message: `変数 '${binding.name}' は代入後に使われていません。`
            });
        }
    }

    const standardNamesByLowercase = new Map(
        Object.keys(STANDARD_FUNCTIONS).map(name => [name.toLowerCase(), name])
    );
    for (const binding of bindings) {
        const standardName = standardNamesByLowercase.get(binding.name.toLowerCase());
        if (standardName && binding.name !== standardName) {
            diagnostics.push({
                kind: "standard-name-case-collision",
                severity: "information",
                start: binding.start,
                length: binding.length,
                message: `変数 '${binding.name}' は標準処理 '${standardName}' と大文字・小文字だけが異なります。`
            });
        }
    }

    const implicitScopes = findImplicitVariableScopeRanges(text);
    scanLines(text, ({ code, lineStart }) => {
        const trimmed = code.trim();
        for (let index = 0; index < code.length; index += 1) {
            if (code[index] === "@") {
                const inlineStream = STREAM_BLOCK.test(code);
                if (!isInsideRange(lineStart + index, implicitScopes) && !inlineStream) {
                    diagnostics.push({
                        kind: "implicit-variable-scope",
                        severity: "warning",
                        start: lineStart + index,
                        length: 1,
                        message: "@ は Map、Filter、Reduce などのストリーム処理内で使います。"
                    });
                }
            }
        }
        STREAM_BLOCK.lastIndex = 0;

        if (PIPELINE_OPERATOR.test(code)) {
            PIPELINE_OPERATOR.lastIndex = 0;
            const end = lastNonWhitespaceIndex(code);
            if (
                end !== -1
                && code[end] !== "."
                && !trimmed.endsWith("{")
                && !trimmed.endsWith("}")
                && !trimmed.endsWith(":")
            ) {
                diagnostics.push({
                    kind: "missing-terminator",
                    severity: "warning",
                    start: lineStart + end,
                    length: 1,
                    message: "パイプライン末尾には '.' を付けます。"
                });
            }
        }
        PIPELINE_OPERATOR.lastIndex = 0;
    });

    diagnostics.push(...pipelineDiagnostics(text));

    const knownUpdateKeys = objectLiteralKeys(text);
    for (const property of findUpdatePropertyOffsets(text)) {
        if (property.isNew) {
            const similar = [...knownUpdateKeys].find(key =>
                differsByOneNonNumericCharacter(property.name, key)
            );
            if (similar) {
                diagnostics.push({
                    kind: "likely-update-key-typo",
                    severity: "warning",
                    start: property.start,
                    length: property.length,
                    message: `新規キー '${property.name}' は '${similar}' と一文字だけ異なります。誤字でなければそのまま追加できます。`
                });
            }
        }
        knownUpdateKeys.add(property.name);
    }

    return diagnostics.filter(diagnostic => !isDiagnosticIgnoredAtOffset(text, diagnostic, diagnostic.start));
}

function normalizePipelineSpacing(line, code) {
    let result = "";
    let index = 0;
    while (index < line.length) {
        const match = /^(>>)/.exec(code.slice(index));
        if (match) {
            result = result.replace(/[ \t]+$/, "");
            result += ` ${match[1]} `;
            index += match[1].length;
            while (index < line.length && /[ \t]/.test(line[index])) index += 1;
        } else {
            result += line[index];
            index += 1;
        }
    }
    return result.trimEnd();
}

function formatDocument(text, indentSize = 4) {
    const eol = text.includes("\r\n") ? "\r\n" : "\n";
    const rawLines = text.split(/\r?\n/);
    const state = { inBlockComment: false };
    const stack = [];
    const formatted = rawLines.map(rawLine => {
        const trimmed = rawLine.trim();
        if (!trimmed) return "";

        const trimmedCode = maskNonCode(trimmed, state);
        const startsWithClose = /^\}/.test(trimmedCode);
        const isBranchHeader = /^(?:when\b[\s\S]*|else)\s*:\s*$/.test(trimmedCode.trim());

        if (startsWithClose) {
            if (stack.at(-1) === "branch") stack.pop();
            if (stack.at(-1) === "block") stack.pop();
        } else if (isBranchHeader && stack.at(-1) === "branch") {
            stack.pop();
        }

        const line = " ".repeat(stack.length * indentSize) + normalizePipelineSpacing(trimmed, trimmedCode);
        const lineCode = maskNonCode(line.trim(), { inBlockComment: false });
        const openCount = (lineCode.match(/\{/g) || []).length;
        const closeCount = (lineCode.match(/\}/g) || []).length;
        const remainingCloses = Math.max(0, closeCount - (startsWithClose ? 1 : 0));
        const netOpens = openCount - remainingCloses;

        if (netOpens > 0) {
            for (let i = 0; i < netOpens; i += 1) stack.push("block");
        } else if (netOpens < 0) {
            for (let i = 0; i < -netOpens; i += 1) {
                if (stack.at(-1) === "branch") stack.pop();
                if (stack.at(-1) === "block") stack.pop();
            }
        } else if (isBranchHeader) {
            stack.push("branch");
        }

        return line;
    });
    return formatted.join(eol);
}

module.exports = {
    analyzeDocument,
    findUpdatePropertyOffsets,
    findUpdateScopeRanges,
    findBindings,
    findBlockRanges,
    findPipelineAtOffset,
    implicitContextAtOffset,
    implicitValueAtOffset,
    isImplicitMarkerAtOffset,
    findPropertyAtOffset,
    findPropertyDefinitions,
    findPropertyReferences,
    findStreamParameterDefinitions,
    inferVariableType,
    findVariableAtOffset,
    findVariableDefinitions,
    findVariableReferences,
    formatDocument,
    isVariableName,
    STANDARD_FUNCTIONS,
    SYSTEM_KEYWORDS,
    tokenAtOffset,
    typeFlowSummary
};
