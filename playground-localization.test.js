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

assert.equal(
  localizeError("RuntimeError: Sqrt requires a non-negative Num"),
  "実行時エラー: Sqrt には 0 以上の数を渡してください。",
);
assert.equal(
  localizeError("RuntimeError: Pow is undefined for this value"),
  "実行時エラー: 「Pow」は、この値では計算できません。",
);
assert.equal(
  localizeError("RuntimeError: Log base must be positive and not 1"),
  "実行時エラー: Log の底は、0 より大きく、1 以外の数にしてください。",
);

console.log("Playground Japanese localization tests passed.");
