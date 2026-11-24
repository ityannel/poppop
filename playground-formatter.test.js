"use strict";

import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { formatDocument: formatInExtension } = require("./vscode-popcorn/language-features");
await import("./popcorn-formatter.js");
const { formatDocument: formatInPlayground } = globalThis.PopCornFormatter;

const cases = [
  "1>>value.\n[1]>>Map as item {\nitem>>Display.\n}",
  '"a>>b"   >> Display. // >> inside a comment\n',
  '1>>Check as value {\nwhen value > 0 {\n"yes".\n}\nelse {\n"no".\n}\n}',
  "[1, 2]\r\n    >>Map as value {\r\nvalue*2.\r\n}",
  '"x">>Try {\n@>>Num.\n} Catch as err {\n0.\n}',
  "[1, 2, 3]>>Map as x { x * 2. }>>doubled.",
  "`a>>b {` >> Display.",
  "'a>>b {' >> Display.",
  "`x`>>Map as v {\nv.\n}",
  '1>>Check {\nwhen @ == 1 { "one" }\nelse { "other" }\n}>>r.',
  '1>>Check {\nwhen @ == 1 {\n"one".\n} else {\n"other".\n}\n}>>r.',
  "(0, 0)>>Loop as (count, total) {\ntotal>>Break when count >= 5.\n(count + 1, total + count).\n}>>result.",
];

for (const source of cases) {
  assert.strictEqual(
    formatInPlayground(source),
    formatInExtension(source),
    `Playground formatter diverged for:\n${source}`,
  );
}

assert.strictEqual(
  formatInPlayground('2>>Check as value {\nwhen value == 0 {\n"zero".\n}\nwhen value in [1, 2, 3] {\n"small".\n}\nelse {\n"other".\n}\n}>>label.'),
  [
    "2 >> Check as value {",
    "    when value == 0 {",
    '        "zero".',
    "    }",
    "    when value in [1, 2, 3] {",
    '        "small".',
    "    }",
    "    else {",
    '        "other".',
    "    }",
    "} >> label.",
  ].join("\n"),
);


// ---- `:` の字下げブロックは、元の字下げで閉じる ----
const colonForm = [
  "(num) >> pop FizzBuzz:",
  "    num >> Check:",
  '        when num % 15 == 0: "FizzBuzz"',
  "        else: num",
  "",
  "(1, 20) >> Range >> Map (@ >> FizzBuzz) >> Display.",
].join("\n");
const colonMessy = colonForm.replace(/\n {8}/g, "\n   ").replace(/\n {4}/g, "\n  ").replace(">> Range >>", ">>Range>>");
assert.strictEqual(formatInPlayground(colonForm), colonForm);
assert.strictEqual(formatInPlayground(colonMessy), colonForm);
assert.strictEqual(formatInExtension(colonMessy), colonForm);


// ---- 旧形式の Check を、新しい書き方へ直す ----
const { hasOldCheckSyntax, migrateOldCheckSyntax } = globalThis.PopCornFormatter;
const oldForm = [
  "2 >> Check as value {",
  "    when value == 0:",
  '        "zero".',
  "    when value in [1, 2, 3]:",
  '        "small".',
  "    else:",
  '        "large".',
  "} >> label.",
].join("\n");
const newForm = [
  "2 >> Check as value {",
  "    when value == 0 {",
  '        "zero".',
  "    }",
  "    when value in [1, 2, 3] {",
  '        "small".',
  "    }",
  "    else {",
  '        "large".',
  "    }",
  "} >> label.",
].join("\n");
assert.strictEqual(hasOldCheckSyntax(oldForm), true);
assert.strictEqual(hasOldCheckSyntax(newForm), false);
assert.strictEqual(migrateOldCheckSyntax(oldForm), newForm);
assert.strictEqual(migrateOldCheckSyntax(newForm), newForm, "新しい形は、そのまま");
assert.strictEqual(
  migrateOldCheckSyntax(oldForm.replace(/\n/g, "\r\n")),
  newForm.replace(/\n/g, "\r\n"),
  "CRLF も保つ",
);
assert.strictEqual(migrateOldCheckSyntax(migrateOldCheckSyntax(oldForm)), newForm, "2回直しても、同じ");
assert.strictEqual(
  hasOldCheckSyntax('"when x:" >> Display.\n// when x:\nx >> Return when y.'),
  false,
  "文字列・コメント・後置 when は、旧形式ではない",
);
assert.strictEqual(migrateOldCheckSyntax("1 >> Display."), "1 >> Display.");

assert.strictEqual(
  formatInPlayground("`a>>b`   >> Display."),
  "`a>>b` >> Display.",
  "生文字列の中の >> は、整形で触らない",
);
assert.strictEqual(
  formatInPlayground("'{'>>Display.\n'}'>>Display."),
  "'{' >> Display.\n'}' >> Display.",
  "文字列の中の波括弧は、字下げに数えない",
);

console.log("Playground formatter parity tests passed.");
