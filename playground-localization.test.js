"use strict";

import assert from "node:assert/strict";

await import("./popcorn-localization.js");
const { errorLine, localizeError } = globalThis.PopCornLocalization;

assert.equal(
  localizeError("NameError: Variable 'missing' is not defined."),
  "名前エラー: 変数「missing」は定義されていません。",
);
assert.equal(
  localizeError("SyntaxError: Unexpected character '!' on line 2, column 5"),
  "文法エラー: 使用できない文字 '!' があります。（2行目）",
);
assert.equal(
  localizeError("TypeError: Filter block must return Bool"),
  "型エラー: Filter のブロックは Bool を返す必要があります。",
);
assert.equal(
  localizeError("SyntaxError: Cannot call 'Add' without '>>' at line 3, column 1"),
  "文法エラー: 関数「Add」は >> の右側で呼び出してください。（3行目）",
);
assert.equal(errorLine("ParseError: something at line 14, column 3"), 14);
assert.equal(
  localizeError("SyntaxError: Check branches use braces: write 'when <condition> { ... }' instead of ':' at line 2, column 9"),
  "文法エラー: Check の分岐は波括弧で書きます。「when <condition> { ... }」の形にしてください（「:」は使えません）。（2行目）",
);
assert.equal(
  localizeError("SyntaxError: Check branches use braces: write 'else { ... }' instead of ':' at line 4, column 5"),
  "文法エラー: Check の分岐は波括弧で書きます。「else { ... }」の形にしてください（「:」は使えません）。（4行目）",
);

assert.equal(
  localizeError("Warning: Single-quoted strings do not interpolate; use a double-quoted string to insert values at line 3, column 5"),
  `注意: 単一引用符 ' の文字列では、{…} は補間されず、そのまま文字になります。値を入れたいときは、二重引用符 " の文字列を使います。（3行目）`,
);

console.log("Playground Japanese localization tests passed.");
