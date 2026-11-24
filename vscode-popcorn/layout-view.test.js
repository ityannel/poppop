const assert = require("assert");
const { toBraceView, fromView, toView } = require("./layout-view");
const { analyzeDocument, findVariableReferences, findBlockRanges, findVariableAtOffset } = require("./language-features");

const fizz = [
    "(num) >> pop FizzBuzz:",
    "    num >> Check:",
    '        when num % 15 == 0: "FizzBuzz"',
    "        else: num",
    "",
    "(1, 20) >> Range >> Map (@ >> FizzBuzz) >> Display.",
].join("\n");

// `:` は `{` に、ブロックの終わりには `} ` が入る。行の数は変わらない
const view = toBraceView(fizz);
assert.strictEqual(view.text.split("\n").length, fizz.split("\n").length);
assert.ok(view.text.startsWith("(num) >> pop FizzBuzz{"));
assert.ok(view.text.includes("} } } (1, 20) >> Range"));

// 位置は、元のテキストへ戻る
const rangeStart = fizz.indexOf("(1, 20)");
assert.strictEqual(fromView(view, toView(view, rangeStart)), rangeStart);

// `:` のブロックで書いても、誤った注意が出ない
const tryCode = '"abc" >> Try:\n    @ >> Num.\nCatch as err:\n    0.\n>> number.\nnumber >> Display.';
assert.deepStrictEqual(analyzeDocument(tryCode), []);
assert.deepStrictEqual(analyzeDocument(fizz), []);

// 変数の参照の位置は、元のテキストの位置
const loop = "5 >> Loop as count:\n    count >> Display.\n    count - 1\n>> result.\nresult >> Display.";
const refs = findVariableReferences(loop, "result").map(ref => loop.slice(ref.start, ref.start + ref.length));
assert.deepStrictEqual(refs, ["result", "result"]);
const atOffset = findVariableAtOffset(loop, loop.lastIndexOf("result") + 1);
assert.strictEqual(atOffset, "result");

// ブロックの範囲（行）
const blocks = findBlockRanges(fizz).map(block => [block.name, block.startLine, block.endLine]);
assert.ok(blocks.some(([name, start]) => name === "FizzBuzz" && start === 0), JSON.stringify(blocks));

// 辞書と Fork のラベルの `:` は、ブロックではない
assert.strictEqual(toBraceView('{"a": 1} >> d.').text, '{"a": 1} >> d.');
assert.ok(toBraceView("[1] >> Fork:\n    a: Sum.\n>> r.").text.includes("    a: Sum."));

console.log("Layout view tests passed.");
