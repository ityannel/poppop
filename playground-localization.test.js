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
  localizeError("SyntaxError: A ':' body runs to the end of its line; start 'else' on a new line, or write the branches with braces at line 2, column 9"),
  "文法エラー: 「:」のあとの本体は、その行の終わりまでです。「else」は次の行に書くか、分岐を { } で書いてください。（2行目）",
);
assert.equal(
  localizeError("SyntaxError: Expected an indented body after ':' in function 'F' at line 1, column 13"),
  "文法エラー: 「:」のあとに本体がありません。同じ行に書くか、次の行から字下げして書いてください（function 'F'）。（1行目）",
);
assert.equal(
  localizeError("SyntaxError: 'Map Check' is not allowed; write a block: 'Map { ... }' at line 1, column 12"),
  "文法エラー: 「Map Check」とは書けません。「Map { … }」のようにブロックで書いてください。（1行目）",
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
