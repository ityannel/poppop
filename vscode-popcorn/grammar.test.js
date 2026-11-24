"use strict";

// 文法ファイル（色分け）が、拡張の設定と、標準関数の一覧に合っているか
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { STANDARD_FUNCTIONS } = require("./language-features");

const manifest = require("./package.json");
for (const grammar of manifest.contributes.grammars) {
    const file = path.join(__dirname, grammar.path);
    assert.ok(fs.existsSync(file), `package.json の文法ファイルがありません: ${grammar.path}`);
    assert.strictEqual(JSON.parse(fs.readFileSync(file, "utf8")).scopeName, grammar.scopeName);
}
for (const language of manifest.contributes.languages) {
    assert.ok(fs.existsSync(path.join(__dirname, language.configuration)), language.configuration);
}

const grammar = JSON.parse(fs.readFileSync(path.join(__dirname, "syntaxes/popcorn.tmLanguage.json"), "utf8"));

// すべての正規表現が読めること（JavaScript で読める書き方だけを使っている）
function visit(node, where) {
    if (Array.isArray(node)) return node.forEach((item, index) => visit(item, `${where}[${index}]`));
    if (!node || typeof node !== "object") return;
    for (const key of ["match", "begin", "end"]) {
        if (typeof node[key] === "string") assert.doesNotThrow(() => new RegExp(node[key]), `${where}.${key}`);
    }
    for (const [key, value] of Object.entries(node)) visit(value, `${where}.${key}`);
}
visit(grammar, "grammar");

// 標準関数は、どれも色分けの一覧に入っている
const named = new Set();
for (const pattern of grammar.repository.processes.patterns) {
    const list = /^\\b\((.*)\)\\b$/.exec(pattern.match);
    if (list) list[1].split("|").forEach(name => named.add(name));
}
const missing = Object.keys(STANDARD_FUNCTIONS).filter(name => !named.has(name));
assert.deepStrictEqual(missing, [], `色分けにない標準関数: ${missing.join(", ")}`);

// `not in` は 1 つの演算子
const notIn = grammar.repository.operators.patterns.find(pattern => pattern.match.includes("not\\s+in"));
assert.ok(notIn && new RegExp(notIn.match).test("@ not in xs"));

console.log("Grammar tests passed.");

// Enter の字下げ: 行末の `:` で 1 段下げる（Playground の nextLineIndent と同じ判定）
const configuration = JSON.parse(fs.readFileSync(path.join(__dirname, "language-configuration.json"), "utf8"));
const onEnter = new RegExp(configuration.onEnterRules[0].beforeText);
for (const line of ["xs >> Map:", "    when x > 0:", "xs >> Map as (a, b): // c", "5 >> Fork:", "else:", "x >> Check: // a: b"]) {
    assert.ok(onEnter.test(line), `字下げする: ${line}`);
}
for (const line of ['"a:" >> x.', '  when a: "b"', "x >> Map // note:", "1 >> x.", "x::"]) {
    assert.ok(!onEnter.test(line), `字下げしない: ${line}`);
}
const outdent = new RegExp(configuration.indentationRules.decreaseIndentPattern);
assert.ok(outdent.test("        else:") && outdent.test("    Catch as err:") && outdent.test("    when x > 1:"));
assert.ok(!outdent.test("    x >> Map:"));
console.log("Indentation rule tests passed.");
