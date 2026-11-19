"use strict";

import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { formatDocument: formatInExtension } = require("./vscode-popcorn/language-features");
await import("./popcorn-formatter.js");
const { formatDocument: formatInPlayground } = globalThis.PopCornFormatter;

const cases = [
  "1>>value.\n[1]>>Map as item (:\nitem>>Display.\n:)",
  '"a>>b"   >> Display. // >> inside a comment\n',
  '1>>Check as value (:\nwhen value > 0:\n"yes".\nelse:\n"no".\n:)',
  "[1, 2]\r\n    >>Map as value (:\r\nvalue*2.\r\n:)",
  '"x">>Try (:\n@>>Int.\n:) Catch as err (:\n0.\n:)',
  "[1, 2, 3]>>Map as x (: x * 2. :)>>doubled.",
];

for (const source of cases) {
  assert.strictEqual(
    formatInPlayground(source),
    formatInExtension(source),
    `Playground formatter diverged for:\n${source}`,
  );
}

assert.strictEqual(
  formatInPlayground('2>>Check as value (:\nwhen value == 0:\n"zero".\nwhen value in [1, 2, 3]:\n"small".\nelse:\n"other".\n:)>>label.'),
  [
    "2 >> Check as value (:",
    "    when value == 0:",
    '        "zero".',
    "    when value in [1, 2, 3]:",
    '        "small".',
    "    else:",
    '        "other".',
    ":) >> label.",
  ].join("\n"),
);

console.log("Playground formatter parity tests passed.");
