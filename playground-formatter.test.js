"use strict";

import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { formatDocument: formatInExtension } = require("./vscode-popcorn/language-features");
await import("./popcorn-formatter.js");
const { formatDocument: formatInPlayground } = globalThis.PopCornFormatter;

const cases = [
  "1>>value.\n[1]>>Map(item):\nitem>>Display.\n..",
  '"a>>b"   >> Display. // >> inside a comment\n',
  "1>>Check(value):\nis value > 0:\n\"yes\".\nelse:\n\"no\".\n..",
  "[1, 2]\r\n    >>Map(value):\r\nvalue*2.\r\n..",
];

for (const source of cases) {
  assert.strictEqual(
    formatInPlayground(source),
    formatInExtension(source),
    `Playground formatter diverged for:\n${source}`,
  );
}

console.log("Playground formatter parity tests passed.");
