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
  localizeError("SyntaxError: A ':' body runs to the end of its line; start 'else' on a new line at line 2, column 9"),
  "文法エラー: 「:」のあとの本体は、その行の終わりまでです。「else」は次の行に書いてください。（2行目）",
);
assert.equal(
  localizeError("SyntaxError: Expected an indented body after ':' in function 'F' at line 1, column 13"),
  "文法エラー: 「:」のあとに本体がありません。同じ行に書くか、次の行から字下げして書いてください（function 'F'）。（1行目）",
);
assert.equal(
  localizeError("SyntaxError: 'Map Check' is not allowed as a process-name body; write a block: 'Map:' at line 1, column 12"),
  "文法エラー: 「Check」は処理名渡しでは書けません。「Map:」のようにブロックで書いてください。（1行目）",
);

assert.equal(
  localizeError("SyntaxError: Blocks are written with ':' and indentation, not braces: start Map with ':' at line 1, column 21"),
  "文法エラー: ブロックは { } ではなく、「:」と字下げで書きます。Map を「:」で始めて、本体を次の行から字下げしてください。（1行目）",
);
assert.equal(
  localizeError("SyntaxError: Write the body of Map on the next line, indented; for one expression, write 'Map (...)' at line 1, column 16"),
  "文法エラー: Map の本体は、次の行から字下げして書きます。式 1 つだけなら「Map (...)」と書けます。（1行目）",
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

assert.equal(
  localizeError("SyntaxError: Missing '.' at the end of the statement at line 1, column 6"),
  "文法エラー: 文の終わりに「.」がありません。（1行目）",
);
assert.equal(
  localizeError("SyntaxError: Expected ')', but got '2' at line 1, column 4"),
  "文法エラー: 「)」が必要ですが、「2」が見つかりました。（1行目）",
);
assert.equal(
  localizeError("RuntimeError: Recursion is too deep (more than 10000 nested function calls); check that the function has a case that stops calling itself"),
  "実行時エラー: 関数の呼び出しが深すぎます（10000 段を超えました）。自分を呼ぶのを止める場合（Return や Check の分岐）があるか確かめてください。",
);
assert.equal(
  localizeError("TypeError: Cannot cast 'true' (Bool) to Num"),
  "型エラー: 「true」（Bool）は数に変換できません。",
);

for (const [input, expected] of [
  ["RuntimeError: Median requires a non-empty List", "実行時エラー: 「Median」には、空でないリスト を渡してください。"],
  ["TypeError: Take requires (List or Str, n)", "型エラー: 「Take」には、(リストか文字列, n) を渡してください。"],
  ["RuntimeError: Mod divisor must not be 0", "実行時エラー: 「Mod」の割る数は 0 にできません。"],
  ["RuntimeError: Chunk size must be at least 1", "実行時エラー: 「Chunk」の大きさは 1 以上にしてください。"],
  ["RuntimeError: Ask needs the environment variable POPCORN_AI_URL", "実行時エラー: 「Ask」を使うには、環境変数 POPCORN_AI_URL を設定してください。"],
  ["NetworkError: Ask was refused with status 401: bad", "通信エラー: 「Ask」は、送り先に断られました（状態 401: bad）。"],
  ["TypeError: Ask option 'colour' is not known", "型エラー: 「Ask」のオプション「colour」は、ありません。"],
  ["RuntimeError: Clamp requires min <= max", "実行時エラー: 「Clamp」は、最小を最大以下にしてください。"],
  ["RuntimeError: FromBase cannot read 'zz' in base 2", "実行時エラー: 「zz」は 2 進数として読めません。"],
]) {
  assert.equal(localizeError(input), expected);
}
