"use strict";

const { findFinalAssignmentTargetOffsets, maskNonCode } = require("./assignment-targets");
const { findImplicitVariableScopeRanges, findVariableReferenceOffsets, variableAtOffset } = require("./semantic-highlights");
const { findInterpolatedVariables, findPlainStringInterpolations } = require("./popcorn-strings");
const { forEachBrace, leadingCloseCount } = require("./layout-view");

const IDENTIFIER = /\b[a-z_][a-zA-Z0-9_]*\b/g;
const PIPELINE_OPERATOR = />[?!]?>/g;
const STREAM_BLOCK = /(?:>>\s*(Map|Filter|Count|Any|All|Reduce|Loop|Sort|SortDesc|Group|Fork|Update|Check|Try)|(Catch))\b/;
const STREAM_ALIAS_PATTERN = /(?:>>\s*(?:Map|Filter|Count|Any|All|Reduce(?:\s*\([^)]*\))?|Loop|Sort|SortDesc|Group|Fork|Update|Check|Try)|Catch)\s+as\s+(?:([a-z_][a-zA-Z0-9_]*)|\(\s*([^)]+)\))/g;
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
    Sleep: { description: "指定秒数だけ待機します。value >> Sleep(秒) なら、待ってから value をそのまま渡します。", output: "same" },
    Add: { description: "2 つの値を加算または連結します。", output: "数値" },
    Div: { description: "2 つの整数を 0 の方向へ切り捨てて整数除算します。", output: "数値" },
    Sum: { description: "数値の配列を合計します。", output: "数値" },
    Max: { description: "配列の最大値を返します。(3, 5) >> Max のように値リストも使えます。", output: "要素" },
    Min: { description: "配列の最小値を返します。(3, 5) >> Min のように値リストも使えます。", output: "要素" },
    Average: { description: "数値の配列の平均を Num で返します。", output: "数値" },
    Round: { description: "数値を四捨五入して最も近い整数値の Num を返します。x >> Round(2) なら小数第2位まで、Round(-2) なら百の位までに丸めます。", output: "数値" },
    Abs: { description: "数値の絶対値を返します。", output: "数値" },
    Floor: { description: "小数点以下を負の方向へ切り捨てた整数値を返します。x >> Floor(2) なら小数第2位までに切り捨てます。", output: "数値" },
    Ceil: { description: "小数点以下を正の方向へ切り上げた整数値を返します。x >> Ceil(2) なら小数第2位までに切り上げます。", output: "数値" },
    Sqrt: { description: "平方根を返します。負の値は RuntimeError です。", output: "数値" },
    Pow: { description: "(base, exponent) の累乗を返します。", output: "数値" },
    Exp: { description: "e の累乗を返します。", output: "数値" },
    Log: { description: "自然対数を返します。x >> Log(base) なら base を底にした対数です。", output: "数値" },
    Sin: { description: "正弦（ラジアン）を返します。", output: "数値" },
    Cos: { description: "余弦（ラジアン）を返します。", output: "数値" },
    Tan: { description: "正接（ラジアン）を返します。", output: "数値" },
    Pi: { description: "円周率を返します。入力は使わず、処理名だけで書けます（Pi * 2）。", output: "数値" },
    E: { description: "ネイピア数を返します。入力は使わず、処理名だけで書けます。", output: "数値" },
    Trim: { description: "前後の空白（全角も）を取り除いた文字列を返します。", output: "文字列" },
    Unique: { description: "重複を取り除いた配列を返します（最初に現れた順）。", output: "配列" },
    Flatten: { description: "要素の配列を 1 段だけ展開した配列を返します。", output: "配列" },
    Enumerate: { description: "[番号, 要素] の配列を返します（番号は 0 から）。", output: "配列" },
    FromEntries: { description: "[キー, 値] の配列から辞書を作ります（Entries の逆）。", output: "辞書" },
    GetPath: { description: "深い辞書・配列の中身を、キーと添字の配列でたどって返します。なければ null（または default）。", output: "any" },
    Env: { description: "環境変数の値を返します。未設定なら null。Playground ではいつも null です。", output: "文字列" },
    Args: { description: "コマンドライン引数の文字列の配列を返します。入力は使わず、処理名だけで書けます。", output: "配列" },
    Num: { description: "変換できる値を数値（Num）に変換します。", output: "数値" },
    Str: { description: "値を規定の形式の文字列に変換します。", output: "文字列" },
    Bool: { description: "値を厳格なルールで真偽値に変換します。", output: "真偽値" },
    List: { description: "リストまたは値リストをリストとして返します。", output: "配列" },
    Array: { description: "指定した大きさの配列を 0 で埋めて作成します。", output: "配列" },
    Dict: { description: "値が辞書であることを確認して返します。", output: "辞書" },
    Length: { description: "文字列・配列・辞書・値リストの長さを返します。", output: "数値" },
    Sort: { description: "配列をキーで昇順に安定ソートします。キーを省くと値そのもの、List のキー [a, b] なら a、同じなら b の順で比べます。", output: "配列" },
    SortDesc: { description: "配列をキーで降順に安定ソートします。キーを省くと値そのもので並べます。", output: "配列" },
    Reverse: { description: "配列または文字列を逆順にします。", output: "same" },
    Uppercase: { description: "文字列をすべて大文字にします。", output: "文字列" },
    Lowercase: { description: "文字列をすべて小文字にします。", output: "文字列" },
    Split: { description: "文字列を区切り文字で分割して配列にします。", output: "配列" },
    Replace: { description: "文字列内の文字列を置き換えます。", output: "文字列" },
    Join: { description: "配列の要素を文字列化して区切り文字で連結します。", output: "文字列" },
    Get: { description: "辞書のキー、配列や文字列の位置から値を取り出します（省略可能な既定値付き）。", output: "要素" },
    Set: { description: "辞書または配列の値を非破壊的に置き換えます。", output: "same" },
    Remove: { description: "辞書から指定キーを、配列から指定位置の要素を取り除いた新しい値を返します。", output: "same" },
    Keys: { description: "辞書のキー一覧を挿入順の配列で返します。", output: "配列" },
    Values: { description: "辞書の値一覧を挿入順の配列で返します。", output: "配列" },
    Entries: { description: "辞書の [key, value] ペアを挿入順の配列で返します。", output: "配列" },
    Merge: { description: "2 つの辞書を結合した新しい辞書を返します。", output: "辞書" },
    Contains: { description: "値やキー・部分文字列を含むかどうかを調べます。", output: "真偽値" },
    Append: { description: "配列の末尾に値を追加した新しい配列を返します。", output: "配列" },
    Slice: { description: "文字列または配列の一部を切り出します。", output: "same" },
    Format: { description: "位置プレースホルダ {0}, {1} で文字列を整形します（\"…\" の中の {0} も補間されません）。", output: "文字列" },
    Now: { description: "現在日時を辞書で取得します（year〜second、millisecond、weekday（0 が日曜）、timestamp）。", output: "辞書" },
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
    Expect: { description: "テスト用。値が期待した値と == で等しいか確かめ、ちがえば AssertionError にします。等しければ値をそのまま渡します。", output: "same" },
    Assert: { description: "テスト用。条件が true か確かめ、false なら AssertionError にします（Assert(\"説明\") で説明つき）。", output: "真偽値" },
    ExpectError: { description: "テスト用。かっこの中の式を、入力を @ にして計算し、エラーになることを確かめます。エラーの {type, message} を返します。", output: "辞書" },
    Use: { description: "ほかの .pop ファイルの関数を読み込みます（\"lib/math.pop\" >> Use、使う名前を選ぶときは Use(Square, Cube)）。ファイルのいちばん外側に書きます。", output: "same" },
    Map: { description: "配列の各要素を変換します。", output: "配列" },
    Filter: { description: "条件に合う配列要素だけを残します。", output: "配列" },
    Count: { description: "条件に合う配列要素の数を返します。", output: "数値" },
    Reduce: { description: "配列を 1 つの値へ集約します。", output: "要素" },
    Zip: { description: "複数の配列を位置ごとにまとめます。", output: "配列" },
    Loop: { description: "状態値を Break まで繰り返し更新します。", output: "式" },
    Update: { description: "辞書のキーを非破壊的に更新・追加します。@::a::b のように入れ子のフィールドも書けます。", output: "辞書" },
    Any: { description: "条件に合う要素が 1 つでもあれば true を返します。条件を省くと Bool の配列をそのまま調べます。", output: "真偽値" },
    All: { description: "すべての要素が条件に合えば true を返します（空の配列は true）。", output: "真偽値" },
    Fixed: { description: "数値を小数第 n 位までの文字列にします。足りない桁は 0 で補います（3.1 >> Fixed(2) は \"3.10\"）。", output: "文字列" },
    StartsWith: { description: "文字列が指定した文字列で始まるかどうかを返します。", output: "真偽値" },
    EndsWith: { description: "文字列が指定した文字列で終わるかどうかを返します。", output: "真偽値" },
    IndexOf: { description: "配列の要素や部分文字列が最初に現れる位置を返します。見つからなければ null です。", output: "数値" },
    Prepend: { description: "配列の先頭に値を追加した新しい配列を返します。", output: "配列" },
    Insert: { description: "配列の指定位置に値を差し込んだ新しい配列を返します（Insert(位置, 値)）。", output: "配列" },
    First: { description: "配列や文字列の最初の要素を返します。", output: "要素" },
    Last: { description: "配列や文字列の最後の要素を返します。", output: "要素" },
    Repeat: { description: "文字列や配列を指定回数くり返してつないだ値を返します。", output: "same" },
    PadStart: { description: "文字列の先頭を埋めて指定の長さにします（\"5\" >> PadStart(3, \"0\") は \"005\"）。", output: "文字列" },
    PadEnd: { description: "文字列の末尾を埋めて指定の長さにします。", output: "文字列" },
    Match: { description: "文字列が正規表現に合う部分を含むかどうかを返します。", output: "真偽値" },
    FindAll: { description: "正規表現に合う部分をすべて、文字列の配列で返します。", output: "配列" },
    ReplaceAll: { description: "正規表現に合う部分をすべて置き換えます。置き換え後の文字列では $1 でグループを使えます。", output: "文字列" }
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

// `Name(…)` の補助引数の中か。補助引数の中の @ は、左から流れてくる値（処理引数なら、呼ばれたときの値）
function isInsideCallArguments(code, index) {
    const stack = [];
    for (let i = 0; i < index; i += 1) {
        if (code[i] === "(") {
            stack.push(/[A-Z][A-Za-z0-9_]*$/.test(code.slice(0, i)));
        } else if (code[i] === ")") {
            stack.pop();
        }
    }
    return stack.includes(true);
}

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

    const branchMatch = /^\s*(?:\}\s*)*(when\b[^{]*?|else)\s*\{/.exec(code);
    if (branchMatch) {
        return { kind: "branch", name: branchMatch[1].trim() };
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
        // `{` と `}` を、行の中で出てきた順に読む（`} } (x) >> pop F{` のように、閉じと開きが同じ行にある）
        forEachBrace(code, {
            open: () => stack.push({ ...describeBlockHeader(code), startLine: lineNumber }),
            close: () => {
                const block = stack.pop();
                if (block) blocks.push({ ...block, endLine: lineNumber });
            }
        });
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
    // `:` のブロックは、いくつも同じ行で閉じることがある。いちばん外側のブロックが、この行のパイプラインの入力
    const block = blocks
        .filter(candidate => candidate.startLine === line.lineNumber || candidate.endLine === line.lineNumber)
        .sort((left, right) => left.startLine - right.startLine)[0];
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
    // "…{name}…" の補間の中で使った変数も、利用として数える
    for (const occurrence of findInterpolatedVariables(text)) {
        if (isVariableName(occurrence.name)) occurrences.push(occurrence);
    }
    return occurrences.sort((left, right) => left.start - right.start);
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
    const match = /(?:>>\s*(Map|Filter|Count|Any|All|Reduce|Loop|Sort|SortDesc|Group|Fork|Update|Check|Try)|(Catch))\b(?:\s*\([^)]*\))?(?:\s+as\s+(?:([a-z_][a-zA-Z0-9_]*)|\(\s*([^)]+)\)))?\s*\{/.exec(code);
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
        forEachBrace(code, {
            open: () => stack.push({ streamContext: streamContextFromHeader(code) }),
            close: () => stack.pop()
        });
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
    const operators = [...before.matchAll(/>[?!]?>/g)];
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
        // 行頭の `}` で閉じてから、この行のキーを調べる
        const leading = leadingCloseCount(code);
        for (let i = 0; i < leading; i += 1) stack.pop();

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

        const updateMatch = />>\s*Update(?:\s+as\s+([a-z_][a-zA-Z0-9_]*))?\s*\{/.exec(code);
        forEachBrace(code, {
            open: () => stack.push(
                updateMatch
                    ? { kind: "update", alias: updateMatch[1] || "" }
                    : { kind: "block", alias: "" }
            ),
            close: () => stack.pop()
        }, leading);
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
        forEachBrace(code, {
            open: () => stack.push({
                kind: />>\s*Update\b/.test(code) ? "update" : "block",
                start: lineStart
            }),
            close: () => {
                const block = stack.pop();
                if (block?.kind === "update") ranges.push({ start: block.start, end: lineStart });
            }
        });
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
        Count: ["配列"],
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
                    message: `'${operators[index][0]}' の後に処理または代入先を指定してください。`
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
    const scannedLines = [];
    scanLines(text, info => scannedLines.push(info));
    // 丸括弧・角括弧の深さ（行の始めと終わり）。括弧の中で改行した行は、文の終わりではない
    let bracketDepth = 0;
    for (const info of scannedLines) {
        for (const ch of info.code) {
            if (ch === "(" || ch === "[") bracketDepth += 1;
            else if ((ch === ")" || ch === "]") && bracketDepth > 0) bracketDepth -= 1;
        }
        info.depthAfter = bracketDepth;
    }
    scannedLines.forEach(({ code, lineStart, depthAfter }, lineIndex) => {
        const trimmed = code.trim();
        for (let index = 0; index < code.length; index += 1) {
            if (code[index] === "@") {
                const inlineStream = STREAM_BLOCK.test(code);
                if (!isInsideRange(lineStart + index, implicitScopes) && !inlineStream && !isInsideCallArguments(code, index)) {
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
            let nextTrimmed = "";
            for (let nextIndex = lineIndex + 1; nextIndex < scannedLines.length; nextIndex += 1) {
                const candidate = scannedLines[nextIndex].code.trim();
                if (candidate) {
                    nextTrimmed = candidate;
                    break;
                }
            }
            const followedByBlockEnd = /^\}/.test(nextTrimmed)
                || /^(?:when\b[\s\S]*|else)\s*:\s*$/.test(nextTrimmed);
            if (
                end !== -1
                && depthAfter === 0
                && code[end] !== "."
                && !trimmed.endsWith("{")
                && !trimmed.endsWith("}")
                && !trimmed.endsWith(":")
                && !followedByBlockEnd
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
        const match = /^(>[?!]?>)/.exec(code.slice(index));
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
    // 行頭の `>>`（ブロックのあとに外側のパイプラインを続ける行）の前には、空白を入れない
    return result.trim();
}

// 行の中の、ブロックを開く `:`（`::`、辞書のキー、Fork のラベルは除く）。辞書・リストの括弧の中の `:` は、ブロックではない
function isBlockColon(code, index, innermostBracket) {
    if (innermostBracket === "{" || innermostBracket === "[") return false;
    if (code[index + 1] === ":" || code[index - 1] === ":") return false;
    const label = /^\s*([a-z_][a-zA-Z0-9_]*)\s*:/.exec(code);
    return !(label && label[0].length - 1 === index && !/^(when|else)$/.test(label[1]));
}

/**
 * 字下げをそろえ、`>>` の前後の空白を 1 つにします。
 *   * `:` のブロックの本体は、見出しの行より 1 段深く。見出しと同じか浅い行で、ブロックは終わります。
 *   * 丸括弧・角括弧・波括弧の中で改行した行は、括弧 1 つ（開いた行 1 つ）につき 1 段深く。
 *     閉じ括弧で、その中で開いたブロックも終わります。
 *   * コメントだけの行は、ブロックを閉じません（字下げは、その行の字下げで残るブロックの段にそろえます）。
 *   * 行末の `:` のすぐ次の行は、字下げを忘れていても本体として 1 段下げます（本体のないブロックはないため）。
 *     そのときは、`>>` や `when` / `else` / `Catch` で始まる行、空行、それより浅い行までを本体とみなします。
 */
function formatDocument(text, indentSize = 4) {
    const eol = text.includes("\r\n") ? "\r\n" : "\n";
    const rawLines = text.split(/\r?\n/);
    const state = { inBlockComment: false };
    // { indent: 見出しの行の元の字下げ, depth: 開いたときの括弧の深さ,
    //   awaitingBody: 行末が `:`（本体は次の行から）, flushIndent: 字下げを忘れた本体の、元の字下げ }
    const blocks = [];
    const brackets = [];    // 開いている括弧ごとに { ch: 括弧, line: 開いた行の番号 }
    const levelOf = openBrackets => new Set(openBrackets.map(bracket => bracket.line)).size;

    let previousBlank = false;

    const formatted = rawLines.map((rawLine, lineIndex) => {
        const trimmed = rawLine.trim();
        if (!trimmed) {
            previousBlank = true;
            return "";
        }

        const code = maskNonCode(trimmed, state);
        const rawIndent = rawLine.length - rawLine.trimStart().length;
        const isCommentOnly = trimmed.startsWith("//");
        // 行頭の閉じ括弧は、開いた行と同じ段にそろえる
        const leadingCloses = (/^[)\]}]+/.exec(code.replace(/\s+/g, "")) || [""])[0].length;
        const visibleBrackets = brackets.slice(0, Math.max(0, brackets.length - leadingCloses));
        if (!isCommentOnly) {
            const top = blocks[blocks.length - 1];
            if (top?.awaitingBody) {
                // 行末の `:` の次の行は、いつも本体
                top.awaitingBody = false;
                if (rawIndent <= top.indent) top.flushIndent = rawIndent;
            } else {
                // 同じ括弧の中で開いたブロックは、見出しと同じか浅い字下げの行で終わる
                // `>>`、`when` / `else` / `Catch` の行は、字下げを忘れた本体を 1 つだけ閉じる
                let siblingUsed = false;
                while (blocks.length && blocks[blocks.length - 1].depth === visibleBrackets.length) {
                    const block = blocks[blocks.length - 1];
                    let ends;
                    if (block.flushIndent === undefined) {
                        ends = rawIndent <= block.indent;
                    } else if (previousBlank || rawIndent < block.flushIndent) {
                        ends = true;
                    } else if (!siblingUsed && /^\s*(?:>>|(?:when|else|Catch)\b)/.test(code)) {
                        ends = true;
                        siblingUsed = true;
                    } else {
                        ends = false;
                    }
                    if (!ends) break;
                    blocks.pop();
                }
            }
            previousBlank = false;
        }
        let openBlocks = blocks.filter(block => block.depth <= visibleBrackets.length).length;
        if (isCommentOnly) {
            // コメントだけの行はブロックを閉じないが、浅く書いたコメントは、その字下げで残るブロックの段にそろえる
            let kept = 0;
            for (const block of blocks.slice(0, openBlocks)) {
                const inside = block.flushIndent === undefined ? rawIndent > block.indent : rawIndent >= block.flushIndent;
                if (!inside) break;
                kept += 1;
            }
            openBlocks = kept;
        }
        const level = openBlocks + levelOf(visibleBrackets);
        const line = " ".repeat(level * indentSize) + normalizePipelineSpacing(trimmed, code);

        if (!isCommentOnly) {
            let opened;
            let openedAt = -1;
            for (let index = 0; index < code.length; index += 1) {
                const ch = code[index];
                if (ch === "(" || ch === "[" || ch === "{") brackets.push({ ch, line: lineIndex });
                else if (ch === ")" || ch === "]" || ch === "}") {
                    brackets.pop();
                    while (blocks.length && blocks[blocks.length - 1].depth > brackets.length) blocks.pop();
                    if (opened && opened.depth > brackets.length) opened = undefined;
                } else if (ch === ":" && !opened && isBlockColon(code, index, brackets[brackets.length - 1]?.ch)) {
                    opened = { indent: rawIndent, depth: brackets.length };
                    openedAt = index;
                }
            }
            if (opened) {
                // `:` のあとがコメントだけなら、本体は次の行から（文字列は隠してあるので、元の行で調べる）
                opened.awaitingBody = /^\s*(?:\/\/.*)?$/.test(trimmed.slice(openedAt + 1));
                blocks.push(opened);
            }
        }
        return line;
    });
    return formatted.join(eol);
}

// ---- ここから下の関数は、元のテキスト（`:` のブロックのまま）を読みます ----

const STREAM_NAMES = ["Map", "Filter", "Count", "Any", "All", "Reduce", "Loop", "Sort", "SortDesc", "Group", "Fork", "Update", "Check", "Try", "Catch"];
// `:` の同じ行に本体を書けないブロック（書けるのは when / else と pop だけ）
const NEXT_LINE_BODY = new RegExp(
    String.raw`(?:>>\s*(Map|Filter|Count|Any|All|Reduce(?:\s*\([^)]*\))?|Loop|Sort|SortDesc|Group|Fork|Update|Check|Try)|^\s*(Catch))`
    + String.raw`(?:\s+as\s+(?:[a-z_][a-zA-Z0-9_]*|\([^)]*\)))?\s*:(?!:)\s*(\S)`
);
// 以前の `{ … }` のブロック
const LEGACY_BRACE_BLOCK = new RegExp(
    String.raw`(?:>>\s*(Map|Filter|Count|Any|All|Reduce(?:\s*\([^)]*\))?|Loop|Sort|SortDesc|Group|Fork|Update|Check|Try)`
    + String.raw`(?:\s+as\s+(?:[a-z_][a-zA-Z0-9_]*|\([^)]*\)))?`
    + String.raw`|\bpop\s+([A-Z][a-zA-Z0-9_]*)|(?:^|\}\s*)(Catch)(?:\s+as\s+(?:[a-z_][a-zA-Z0-9_]*|\([^)]*\)))?`
    + String.raw`|^\s*(?:\}\s*)?(when\b[^{]*?|else))\s*\{`
);

function maskedLines(text) {
    const lines = [];
    scanLines(text, info => lines.push(info));
    return lines;
}

/** `(a, Keep) >> pop Name:` の関数定義。大文字で始まる 2 番目以降の引数は処理引数 */
function findFunctionDefinitions(text) {
    const definitions = [];
    for (const { code, lineNumber, lineStart } of maskedLines(text)) {
        const match = /^\s*(?:(\([^)]*\)|[a-z_][a-zA-Z0-9_]*)\s*>>\s*)?pop\s+([A-Z][a-zA-Z0-9_]*)/.exec(code);
        if (!match) continue;
        const parameterText = (match[1] || "").replace(/^\(|\)$/g, "");
        const params = parameterText.split(",").map(part => part.trim()).filter(Boolean).map((name, index) => ({
            name,
            process: index > 0 && /^[A-Z]/.test(name)
        }));
        definitions.push({
            name: match[2],
            params,
            line: lineNumber,
            start: lineStart + match.index + match[0].length - match[2].length,
            length: match[2].length
        });
    }
    return definitions;
}

function editDistance(left, right) {
    const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
    for (let i = 1; i <= left.length; i += 1) {
        let diagonal = previous[0];
        previous[0] = i;
        for (let j = 1; j <= right.length; j += 1) {
            const above = previous[j];
            previous[j] = Math.min(
                previous[j] + 1,
                previous[j - 1] + 1,
                diagonal + (left[i - 1].toLowerCase() === right[j - 1].toLowerCase() ? 0 : 1)
            );
            diagonal = above;
        }
    }
    return previous[right.length];
}

/** 知っている処理名のうち、name に近いもの（書き間違いの候補） */
function similarProcessName(name, knownNames) {
    const limit = name.length <= 4 ? 1 : 2;
    let best;
    for (const known of knownNames) {
        const distance = editDistance(name, known);
        if (distance <= limit && (!best || distance < best.distance)) best = { name: known, distance };
    }
    return best?.name;
}

function sourceDiagnostics(text) {
    const diagnostics = [];
    const lines = maskedLines(text);
    const functions = findFunctionDefinitions(text);
    const knownProcesses = new Set([
        ...Object.keys(STANDARD_FUNCTIONS),
        ...functions.map(definition => definition.name),
        ...functions.flatMap(definition => definition.params.filter(param => param.process).map(param => param.name)),
        "Use",
        // `"lib/x.pop" >> Use(Square, Shout).` で名前を書いて読み込んだ関数
        ...[...text.matchAll(/>>\s*Use\s*\(([^)]*)\)/g)].flatMap(match => match[1].split(",").map(name => name.trim()).filter(Boolean))
    ]);
    // `"lib/x.pop" >> Use.` は別のファイルの関数をすべて読み込むので、名前の書き間違いは判断できない
    const importsEverything = /"[^"\n]*"\s*>>\s*Use\s*\./.test(text);
    const reportedUnknown = new Set();

    for (const { code, lineStart } of lines) {
        const legacy = LEGACY_BRACE_BLOCK.exec(code);
        if (legacy) {
            const brace = legacy.index + legacy[0].length - 1;
            const name = (legacy[1] || "").replace(/\(.*$/, "").trim() || (legacy[2] ? `pop ${legacy[2]}` : legacy[3] || legacy[4].trim().split(/\s/)[0]);
            diagnostics.push({
                kind: "legacy-brace-block",
                severity: "error",
                start: lineStart + brace,
                length: 1,
                message: `ブロックは { } ではなく、':' と字下げで書きます（'${name}:' のあと、本体を 1 段下げます）。'popcorn ファイル名 --migrate' で、まとめて書き換えられます。`
            });
        }

        const sameLine = NEXT_LINE_BODY.exec(code);
        if (sameLine) {
            const name = (sameLine[1] || sameLine[2]).replace(/\(.*$/, "").trim();
            const bodyStart = sameLine.index + sameLine[0].length - 1;
            const hint = ["Map", "Filter", "Count", "Sort", "SortDesc", "Group"].includes(name)
                ? `1 行で書くときは、式渡し '${name} (…)' を使います。`
                : "";
            diagnostics.push({
                kind: "same-line-block-body",
                severity: "error",
                start: lineStart + bodyStart,
                length: Math.max(1, lastNonWhitespaceIndex(code) - bodyStart + 1),
                message: `${name} の本体は、次の行から字下げして書きます。${hint}`
            });
        }

        // 標準関数にも、このファイルの関数にもない大文字の名前で、知っている名前に近いもの（書き間違い）
        for (const match of code.matchAll(/(?<![A-Za-z0-9_:@])[A-Z][A-Za-z0-9_]*\b/g)) {
            const name = match[0];
            if (importsEverything || knownProcesses.has(name)) continue;
            const similar = similarProcessName(name, knownProcesses);
            if (!similar) continue;
            const key = `${name}:${lineStart + match.index}`;
            if (reportedUnknown.has(key)) continue;
            reportedUnknown.add(key);
            diagnostics.push({
                kind: "unknown-process",
                severity: "warning",
                start: lineStart + match.index,
                length: name.length,
                message: `'${name}' という処理は見つかりません。'${similar}' の書き間違いではありませんか？`,
                suggestion: similar
            });
        }
    }

    for (const plain of findPlainStringInterpolations(text)) {
        diagnostics.push({
            kind: "plain-string-interpolation",
            severity: "warning",
            start: plain.start,
            length: plain.length,
            message: `'…' の中の ${plain.text} は補間されません。値を入れたいときは "…" を使います。`
        });
    }
    return diagnostics;
}

// `:` のブロックを読める（layout-view.js で包んだ）関数。モジュールを読み終えたあとで使う
const layoutAware = () => module.exports;

/** 関数の本体の中なら、その関数の定義 */
function enclosingFunction(text, lineNumber, functions = findFunctionDefinitions(text)) {
    return layoutAware().findBlockRanges(text)
        .filter(block => block.kind === "function" && block.startLine <= lineNumber && lineNumber <= block.endLine)
        .map(block => functions.find(definition => definition.line === block.startLine))
        .find(Boolean);
}

/** 折りたたみの範囲（行）。`:` のブロックと、複数行にまたがる括弧 */
function findFoldingRanges(text) {
    const lines = maskedLines(text);
    const lastLine = lines.length - 1;
    const indentOf = info => info.line.length - info.line.trimStart().length;
    const isBlank = lineNumber => !lines[lineNumber].code.trim();
    const ranges = [];
    for (const block of layoutAware().findBlockRanges(text)) {
        let end;
        if (block.endLine > lastLine) {
            end = lastLine;                       // ファイルの終わりで閉じたブロック
        } else {
            const closing = lines[block.endLine];
            const header = lines[block.startLine];
            // 字下げで閉じたブロックの終わりの行（と `}` の行）は、外側の行
            end = /^\s*\}/.test(closing.code) || indentOf(closing) <= indentOf(header) ? block.endLine - 1 : block.endLine;
        }
        while (end > block.startLine && isBlank(end)) end -= 1;
        if (end > block.startLine) ranges.push({ start: block.startLine, end, kind: block.kind });
    }
    const stack = [];
    for (const { code, lineNumber } of lines) {
        for (const ch of code) {
            if (ch === "(" || ch === "[" || ch === "{") stack.push(lineNumber);
            else if ((ch === ")" || ch === "]" || ch === "}") && stack.length) {
                const start = stack.pop();
                if (lineNumber - 1 > start) ranges.push({ start, end: lineNumber - 1, kind: "bracket" });
            }
        }
    }
    const seen = new Set();
    return ranges
        .filter(range => {
            const key = `${range.start}:${range.end}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .sort((left, right) => left.start - right.start || right.end - left.end);
}

/** offset の位置の、このファイルの関数か処理引数（ホバー用） */
function processInfoAtOffset(text, offset) {
    const token = tokenAtOffset(text, offset);
    if (!token || !/^[A-Z]/.test(token.word)) return undefined;
    const functions = findFunctionDefinitions(text);
    const owner = enclosingFunction(text, lineNumberOf(text, offset), functions);
    const parameter = owner?.params.find(param => param.process && param.name === token.word);
    if (parameter) return { kind: "process-parameter", token, definition: owner };
    const definition = functions.find(candidate => candidate.name === token.word);
    if (definition) return { kind: "function", token, definition };
    return undefined;
}

function lineNumberOf(text, offset) {
    return text.slice(0, offset).split("\n").length - 1;
}

const BLOCK_SNIPPETS = Object.freeze({
    Map: "Map:\n\t${0:@}",
    Filter: "Filter:\n\t${0:@ > 0}",
    Count: "Count:\n\t${0:@ > 0}",
    Reduce: "Reduce(${1:0}) as (${2:acc}, ${3:item}):\n\t${0:acc + item}",
    Sort: "Sort:\n\t${0:@}",
    SortDesc: "SortDesc:\n\t${0:@}",
    Group: "Group:\n\t${0:@}",
    Loop: "Loop:\n\t${0:@}",
    Fork: "Fork:\n\t${0:@}",
    Update: "Update:\n\t${0:@::key} >> @::${1:key}",
    Check: "Check:\n\twhen ${1:@ > 0}: ${2:\"yes\"}\n\telse: ${0:\"no\"}",
    Try: "Try:\n\t${1:@}\nCatch as ${2:err}:\n\t${0:null}"
});

/**
 * 補完の候補。kind は "function"（標準の処理）、"user-function"、"process-parameter"、
 * "keyword"、"variable"、"property"、"snippet"（ブロックのひな形。snippet を VS Code のスニペットとして挿入する）のどれか
 */
function completionItems(text, offset) {
    const before = text.slice(0, offset);
    const items = [];
    const seen = new Set();
    const add = item => {
        if (seen.has(item.label)) return;
        seen.add(item.label);
        items.push(item);
    };

    // `::` のあとは、辞書のキー
    if (/::[a-z_]*$/.test(before)) {
        const keys = new Set([...objectLiteralKeys(text)]);
        for (const match of text.matchAll(/::([a-z_][a-zA-Z0-9_]*)/g)) keys.add(match[1]);
        for (const key of keys) add({ label: key, kind: "property", detail: "辞書のキー" });
        return items;
    }

    const functions = findFunctionDefinitions(text);
    const enclosing = enclosingFunction(text, lineNumberOf(text, offset), functions);
    for (const param of enclosing?.params || []) {
        add(param.process
            ? { label: param.name, kind: "process-parameter", detail: `処理引数（${enclosing.name} の引数）`, documentation: "呼ぶ側が丸括弧に書いた式を、いまの入力を @ にして計算します。" }
            : { label: param.name, kind: "variable", detail: `${enclosing.name} の引数` });
    }
    for (const definition of functions) {
        const params = definition.params.map(param => param.name).join(", ");
        add({ label: definition.name, kind: "user-function", detail: `(${params}) >> pop ${definition.name}`, documentation: "このファイルで定義した関数です。" });
    }
    for (const [name, standard] of Object.entries(STANDARD_FUNCTIONS)) {
        add({
            label: name,
            kind: "function",
            detail: standard.output === "same" ? "入力と同じ型" : `→ ${standard.output}`,
            documentation: standard.description
        });
    }
    // ブロックのひな形（`Map:` と、字下げした本体）
    for (const [name, snippet] of Object.entries(BLOCK_SNIPPETS)) {
        add({ label: `${name}:`, kind: "snippet", detail: `${name} のブロック`, documentation: STANDARD_FUNCTIONS[name].description, snippet });
    }
    for (const [word, description] of Object.entries(SYSTEM_KEYWORDS)) {
        add({ label: word, kind: "keyword", documentation: description });
    }
    add({ label: "not in", kind: "keyword", documentation: "要素・キー・部分文字列を含まないかどうか（Bool）を調べます。" });
    for (const occurrence of allVariableOccurrences(text)) {
        add({ label: occurrence.name, kind: "variable", detail: "変数" });
    }
    return items;
}

const exported = {
    analyzeDocument,
    completionItems,
    findFoldingRanges,
    findFunctionDefinitions,
    processInfoAtOffset,
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
// `:` のブロックで書いたテキストも、解析できるようにする（layout-view.js）。整形は、元のテキストのまま
// 下の関数は、元のテキストをそのまま読む（中で、包んだ関数を使う）
const LAYOUT_NEUTRAL = new Set([
    "completionItems", "findFoldingRanges", "findFunctionDefinitions", "formatDocument",
    "isVariableName", "processInfoAtOffset", "typeFlowSummary"
]);
const wrapped = require("./layout-view").wrapExports(
    exported,
    Object.keys(exported).filter(name => typeof exported[name] === "function" && !LAYOUT_NEUTRAL.has(name))
);
// 診断は、ブレース・ビューで調べるもの（変数・@・Update）と、元のテキストで調べるもの（書き方）を合わせる
const analyzeLayout = wrapped.analyzeDocument;
wrapped.analyzeDocument = function analyzeDocumentWithSource(text) {
    const fromSource = sourceDiagnostics(text)
        .filter(diagnostic => !isDiagnosticIgnoredAtOffset(text, diagnostic, diagnostic.start));
    return [...analyzeLayout(text), ...fromSource].sort((left, right) => left.start - right.start);
};
module.exports = wrapped;
