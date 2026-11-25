"use strict";

// いまの PopCorn の書き方（`:` と字下げ、式渡し、処理名渡し、処理引数、3 種類の文字列）で、
// 解析・診断・折りたたみ・補完・整形が正しく動くこと
const assert = require("assert");
const {
    analyzeDocument,
    completionItems,
    findBlockRanges,
    findFoldingRanges,
    findFunctionDefinitions,
    findVariableReferences,
    findVariableAtOffset,
    formatDocument,
    processInfoAtOffset
} = require("./language-features");

const kindsOf = text => analyzeDocument(text).map(diagnostic => diagnostic.kind);
const slices = (text, items) => items.map(item => text.slice(item.start, item.start + item.length));

// ---- いまの書き方のプログラムには、注意が出ない ----
const program = [
    "(num) >> pop FizzBuzz:",
    "    num >> Check:",
    '        when num % 15 == 0: "FizzBuzz"',
    '        when num % 3 == 0: "Fizz"',
    "        else: num",
    "",
    "(xs, Keep) >> pop MyFilter:",
    "    xs >> Filter Keep.",
    "",
    "(1, 20) >> Range >> Map FizzBuzz >> words.",
    "[1, 2, 3, 4] >> Filter (@ % 2 == 0) >> evens.",
    "[1, 2, 3] >> Reduce(10) Add >> total.",
    "[1, 2, 3] >> Count (@ > 1) >> big.",
    "[3, 1, 2] >> Sort (@) >> sorted.",
    "[1, 2, 3] >> Map (",
    "    @ * 2",
    ") >> doubled.",
    "5 >> Fork:",
    "    double: @ * 2",
    "    triple: @ * 3",
    ">> forked.",
    '"x" >> Try:',
    "    @ >> Num",
    "Catch as err:",
    "    0",
    ">> parsed.",
    "0 >> Loop as i:",
    "    i >> Break when i >= 3.",
    "    i + 1",
    ">> counted.",
    "3 >> Check:",
    '    when @ not in evens: "odd"',
    '    else: "even"',
    ">> parity.",
    '"{words} {total} {big} {sorted} {doubled} {forked} {parsed} {counted} {parity}" >> Display.',
    "Pi * 2 >> Display.",
    "Now::year >> Display.",
    "[1, 2, 3, 4] >> MyFilter(IsBig) >> Display.",
    "(n) >> pop IsBig:",
    "    n > 2"
].join("\n");
assert.deepStrictEqual(analyzeDocument(program), [], JSON.stringify(analyzeDocument(program), null, 2));

// ---- "{name}" の中の変数も、利用・参照・名前の変更の対象 ----
const interpolation = '"Ada" >> person.\n"Hello, {person >> Uppercase}! {{person}}" >> Display.';
assert.ok(!kindsOf(interpolation).includes("unused-assignment"));
assert.deepStrictEqual(slices(interpolation, findVariableReferences(interpolation, "person")), ["person", "person"]);
assert.strictEqual(findVariableAtOffset(interpolation, interpolation.indexOf("{person") + 2), "person");
assert.ok(kindsOf('"{missing}" >> Display.').includes("undefined-variable"));
// '…' と `…` の中は補間されないので、変数ではない
assert.ok(kindsOf("1 >> person.\n'{person}' >> Display.").includes("unused-assignment"));
assert.ok(kindsOf("1 >> person.\n`{person}` >> Display.").includes("unused-assignment"));

// ---- 複数行の式渡しと、ファイルの最後で閉じるブロック ----
assert.deepStrictEqual(analyzeDocument("[1, 2] >> Map (\n    @ * 2\n) >> xs.\nxs >> Display."), []);
assert.ok(kindsOf("[1] >> Map (\n    @\n) >> xs").includes("missing-terminator"), "閉じ括弧の行の '.' の書き忘れ");
assert.deepStrictEqual(analyzeDocument("[1, 2] >> Map:\n    @ * 2"), []);
assert.deepStrictEqual(analyzeDocument("[1, 2] >> Map:\n    @ * 2\n"), []);

// ---- いまの言語にない書き方の案内 ----
const legacy = analyzeDocument("[1] >> Map { @ } >> x.\nx >> Display.");
assert.deepStrictEqual(legacy.map(d => d.kind), ["legacy-brace-block"]);
assert.strictEqual(legacy[0].severity, "error");
assert.ok(legacy[0].message.includes("'Map:'"));
assert.ok(kindsOf("(x) >> pop F {\n    x\n}").includes("legacy-brace-block"));
assert.ok(kindsOf("1 >> Check:\n    when @ > 0 {\n        1\n    }\n    else: 2").includes("legacy-brace-block"));
assert.ok(!kindsOf('{"a": 1} >> d.\nd >> Display.').includes("legacy-brace-block"), "辞書の { } はブロックではない");

const sameLine = analyzeDocument("[1, 2] >> Map: @ * 2 >> d.");
assert.ok(sameLine.some(d => d.kind === "same-line-block-body" && d.message.includes("Map (…)")));
assert.ok(!kindsOf('1 >> Check:\n    when @ > 0: "a"\n    else: "b"\n>> r.\nr >> Display.').includes("same-line-block-body"));
assert.ok(!kindsOf("(x) >> pop Twice: x * 2\n1 >> Twice >> Display.").includes("same-line-block-body"));

const typo = analyzeDocument("[1, 2] >> Fliter (@ > 1) >> Display.").find(d => d.kind === "unknown-process");
assert.ok(typo && typo.message.includes("'Filter'"), JSON.stringify(typo));
assert.ok(!kindsOf("(x) >> pop Fliter:\n    x\n\n1 >> Fliter >> Display.").includes("unknown-process"), "自分で定義した名前");
assert.ok(!kindsOf("1 >> SomethingImported >> Display.").includes("unknown-process"), "似た名前がなければ注意しない");
assert.ok(!kindsOf("[1] >> Fliter (@) >> Display. // popcorn-ignore: unknown-process").includes("unknown-process"));
assert.ok(!kindsOf('"lib/text.pop" >> Use(Shout).\n"hi" >> Shout >> Display.').includes("unknown-process"), "Use(…) で読み込んだ名前");
assert.ok(!kindsOf('"lib/text.pop" >> Use.\n"hi" >> Shout >> Display.').includes("unknown-process"), "Use. はすべて読み込むので判断しない");
assert.ok(!kindsOf("3 >> Expect(3).\ntrue >> Assert.").includes("unknown-process"), "テスト用の標準関数");

const plain = analyzeDocument("'Hello {name}' >> t.\nt >> Display.");
assert.deepStrictEqual(plain.map(d => d.kind), ["plain-string-interpolation"]);
assert.deepStrictEqual(analyzeDocument("'{{name}}' >> t.\nt >> Display."), []);
assert.deepStrictEqual(analyzeDocument('\'{"name": "Ada"}\' >> t.\nt >> Display.'), []);

// ---- 関数と処理引数 ----
const functions = findFunctionDefinitions(program);
assert.deepStrictEqual(
    functions.map(f => [f.name, f.params.map(p => `${p.name}${p.process ? "*" : ""}`).join(",")]),
    [["FizzBuzz", "num"], ["MyFilter", "xs,Keep*"], ["IsBig", "n"]]
);
assert.strictEqual(processInfoAtOffset(program, program.indexOf("Filter Keep") + 8).kind, "process-parameter");
assert.strictEqual(processInfoAtOffset(program, program.indexOf("Map FizzBuzz") + 5).definition.name, "FizzBuzz");
assert.strictEqual(processInfoAtOffset(program, program.indexOf("Display")), undefined);

// ---- ブロックの範囲と折りたたみ ----
const blocks = findBlockRanges(program);
assert.ok(blocks.some(block => block.kind === "branch" && block.name === "else"));
assert.ok(blocks.some(block => block.kind === "function" && block.name === "MyFilter" && block.startLine === 6));
const folds = findFoldingRanges(program).map(range => `${range.start}-${range.end}`);
assert.ok(folds.includes("0-4"), `FizzBuzz の本体（空行は含めない）: ${folds}`);
assert.ok(folds.includes("6-7"), folds);
assert.ok(folds.includes("14-15"), `複数行の Map (…): ${folds}`);
assert.ok(folds.includes("38-39"), `ファイルの最後で閉じる関数: ${folds}`);
assert.ok(!folds.some(fold => /^(2|3|4)-/.test(fold)), `1 行の分岐は折りたたまない: ${folds}`);

// ---- 補完 ----
const labels = (text, offset) => completionItems(text, offset).map(item => `${item.kind}:${item.label}`);
const insideMyFilter = labels(program, program.indexOf("Filter Keep"));
assert.ok(insideMyFilter.includes("process-parameter:Keep"));
assert.ok(insideMyFilter.includes("variable:xs"));
assert.ok(insideMyFilter.includes("user-function:FizzBuzz"));
assert.ok(insideMyFilter.includes("function:Count"));
assert.ok(insideMyFilter.includes("snippet:Map:"));
assert.ok(insideMyFilter.includes("keyword:not in"));
assert.ok(!labels(program, program.indexOf("Pi * 2")).includes("process-parameter:Keep"), "関数の外では処理引数は出さない");
const keys = labels('{"name": "Ada", "age": 3} >> user.\nuser::', 43);
assert.deepStrictEqual(keys.sort(), ["property:age", "property:name"]);

// ---- 整形 ----
assert.strictEqual(
    formatDocument("[1,2]>>Map as x:\n  x*2\n>>doubled.\n{\n\"a\": [\n1\n]\n}>>d.\n[1]>>Map (\n@ + 1\n)>>e."),
    "[1,2] >> Map as x:\n    x*2\n>> doubled.\n{\n    \"a\": [\n        1\n    ]\n} >> d.\n[1] >> Map (\n    @ + 1\n) >> e."
);
assert.strictEqual(formatDocument(program), program, "いまの書き方のプログラムは、整形しても変わらない");
// 行末の `:` の次の行は、字下げを忘れていても本体として下げる
assert.strictEqual(formatDocument("xs >> Map:\n@ * 2\n>> d."), "xs >> Map:\n    @ * 2\n>> d.");
assert.strictEqual(
    formatDocument('(n) >> pop F:\nn >> Check:\nwhen n > 0:\n"pos"\nelse:\n"neg"\n\n1 >> F >> Display.'),
    '(n) >> pop F:\n    n >> Check:\n        when n > 0:\n            "pos"\n        else:\n            "neg"\n\n1 >> F >> Display.'
);
assert.strictEqual(formatDocument('"a" >> Try:\n@ >> Num\nCatch as e:\n0\n>> n.'), '"a" >> Try:\n    @ >> Num\nCatch as e:\n    0\n>> n.');
assert.strictEqual(formatDocument('1 >> Check:\n    when @ > 0: "a"\n    else: "b"\n>> r.'), '1 >> Check:\n    when @ > 0: "a"\n    else: "b"\n>> r.');

console.log("Current syntax tests passed.");

// ---- ファイルの読み込み（Use）とテスト関数 ----
assert.deepStrictEqual(analyzeDocument('"lib/math.pop" >> Use.\n3 >> Sums >> Display.'), [], "読み込んだ関数は書き間違いにしない");
assert.ok(!kindsOf('"lib/math.pop" >> Use(Sums).\n3 >> Sums >> Display.').includes("unknown-process"));
assert.ok(kindsOf('"lib/math.pop" >> Use(Cube).\n3 >> Sums >> Display.').includes("unknown-process"));
assert.deepStrictEqual(
    analyzeDocument("pop TestAdd:\n    (1, 2) >> Add >> Expect(3).\n    true >> Assert.\n    0 >> ExpectError(1 / @, \"RuntimeError\")"),
    []
);
console.log("Use and test syntax tests passed.");
