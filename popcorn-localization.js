(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PopCornLocalization = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const ERROR_NAMES = new Map([
    ["SyntaxError", "文法エラー"],
    ["LexerError", "字句エラー"],
    ["ParseError", "文法エラー"],
    ["RuntimeError", "実行時エラー"],
    ["EvaluatorError", "評価エラー"],
    ["TypeError", "型エラー"],
    ["NameError", "名前エラー"],
    ["IndexError", "参照エラー"],
    ["KeyError", "キーエラー"],
    ["ValueError", "値エラー"],
    ["IOError", "入出力エラー"],
    ["NetworkError", "通信エラー"],
    ["SystemError", "システムエラー"],
    ["UserError", "プログラムからのエラー"],
    ["PlaygroundError", "Playgroundエラー"],
  ]);

  function errorLine(value) {
    const text = String(value ?? "");
    const match = text.match(/\b(?:at|on)\s+line\s+(\d+)\b/i)
      || text.match(/(\d+)\s*行目/);
    return match ? Number(match[1]) : null;
  }

  function translateMessage(message) {
    const exact = new Map([
      ["Division by zero", "0 で割ることはできません。"],
      ["Modulo by zero", "0 を使った剰余計算はできません。"],
      ["Numeric result is NaN or Infinity", "数値計算の結果が NaN または無限大になりました。"],
      ["Check requires a final else branch", "Check の最後には else が必要です。"],
      ["Check requires at least one 'when' branch", "Check には少なくとも 1 つの when 分岐が必要です。"],
      ["Check requires an else branch", "Check には else が必要です。"],
      ["Sqrt requires a non-negative Num", "Sqrt には 0 以上の数を渡してください。"],
      ["Log requires a positive Num", "Log には 0 より大きい数を渡してください。"],
      ["Log base must be positive and not 1", "Log の底は、0 より大きく、1 以外の数にしてください。"],
      [
        "Single-quoted strings do not interpolate; use a double-quoted string to insert values",
        "単一引用符 ' の文字列では、{…} は補間されず、そのまま文字になります。値を入れたいときは、二重引用符 \" の文字列を使います。",
      ],
      ["Check predicate must return Bool", "Check の when 条件は Bool を返す必要があります。"],
      ["Filter block must return Bool", "Filter のブロックは Bool を返す必要があります。"],
      ["Map stream requires a list", "Map にはリストを渡してください。"],
      ["Filter stream requires a list", "Filter にはリストを渡してください。"],
      ["Count stream requires a list", "Count にはリストを渡してください。"],
      ["Count block must return Bool", "Count のブロックは Bool を返す必要があります。"],
      ["Reduce stream requires a list", "Reduce にはリストを渡してください。"],
      ["Reduce stream requires non-empty list", "初期値のない Reduce には空でないリストを渡してください。"],
      ["Sort stream requires a list", "Sort にはリストを渡してください。"],
      ["SortDesc stream requires a list", "SortDesc にはリストを渡してください。"],
      ["Group stream requires a list", "Group にはリストを渡してください。"],
      ["Update stream requires a dictionary", "Update には辞書を渡してください。"],
      ["Break can only be used inside Loop", "Break は Loop の中でのみ使用できます。"],
      ["Return can only be used inside a pop function", "Return は pop で定義した関数の中でのみ使用できます。"],
      ["when condition must return Bool", "when の条件式は Bool を返す必要があります。"],
      ["A value list requires at least two values", "値リストには2個以上の値が必要です。"],
      ["Try requires a matching Catch block", "Try の直後には Catch ブロックが必要です。"],
      ["Catch must immediately follow a Try block", "Catch は Try ブロックの直後に書く必要があります。"],
      ["Cannot mix labeled and unlabeled branches in Fork", "Fork の中でラベル付き分岐とラベルなし分岐を混ぜることはできません。"],
      ["Function definitions are only allowed at top level", "関数定義（pop）はプログラムのいちばん外側にだけ書けます。"],
      ["Unclosed string literal", "文字列が閉じられていません。"],
      ["Unclosed interpolation", "文字列補間の { が閉じられていません。"],
    ]);
    if (exact.has(message)) return exact.get(message);

    const undefinedMath = message.match(/^(Pow|Exp) is undefined for this value$/);
    if (undefinedMath) return `「${undefinedMath[1]}」は、この値では計算できません。`;

    let match = message.match(/^A ':' body runs to the end of its line; start '([^']+)' on a new line$/);
    if (match) return `「:」のあとの本体は、その行の終わりまでです。「${match[1]}」は次の行に書いてください。`;
    match = message.match(/^Blocks are written with ':' and indentation, not braces: start (.+) with ':'$/);
    if (match) return `ブロックは { } ではなく、「:」と字下げで書きます。${match[1]} を「:」で始めて、本体を次の行から字下げしてください。`;
    match = message.match(/^Write the body of (.+?) on the next line, indented(?:; for one expression, write '(.+)')?$/);
    if (match) return match[2]
      ? `${match[1]} の本体は、次の行から字下げして書きます。式 1 つだけなら「${match[2]}」と書けます。`
      : `${match[1]} の本体は、次の行から字下げして書きます。`;
    match = message.match(/^A one-line ':' body cannot end with 'when'; start the next branch on a new line, or write the body on the next line$/);
    if (match) return "同じ行に書いた本体は、後ろに when を付けられません。本体を次の行に書いてください。";
    match = message.match(/^Expected an indented body after ':' in (.+)$/);
    if (match) return `「:」のあとに本体がありません。同じ行に書くか、次の行から字下げして書いてください（${match[1]}）。`;
    match = message.match(/^Expected ':' to start (.+?), but got (.+)$/);
    if (match) return `${match[1]} の本体は「:」で始めてください（「${match[2]}」が見つかりました）。`;
    match = message.match(/^'(\w+) (\w+)' is not allowed as a process-name body; write a block: '.+'$/);
    if (match) return `「${match[2]}」は処理名渡しでは書けません。「${match[1]}:」のようにブロックで書いてください。`;
    match = message.match(/^Variable '([^']+)' is not defined\.?$/);
    if (match) return `変数「${match[1]}」は定義されていません。`;
    match = message.match(/^Function '([^']+)' is not defined\.?$/);
    if (match) return `関数「${match[1]}」は定義されていません。`;
    match = message.match(/^Cannot call '([^']+)' without '>>'$/);
    if (match) return `関数「${match[1]}」は >> の右側で呼び出してください。`;
    match = message.match(/^Comparison operator '([^']+)' is non-associative$/);
    if (match) return `比較演算子「${match[1]}」は連続して並べられません。and でつないでください。`;
    match = message.match(/^Integer overflow: (.+)$/);
    if (match) return `整数の範囲（64ビット符号付き整数）を超えました: ${match[1]}`;
    match = message.match(/^Unexpected character (.+)$/);
    if (match) return `使用できない文字 ${match[1]} があります。`;
    match = message.match(/^Unexpected token ([^(]+)\s*\((.*)\)$/);
    if (match) return `予期しない記号「${match[2]}」があります。`;
    match = message.match(/^Expected ([^,]+), but got (.+)$/);
    if (match) return `「${match[1]}」が必要ですが、「${match[2]}」が見つかりました。`;
    match = message.match(/^Key '([^']+)' is not (?:defined|found in dict)\.?$/);
    if (match) return `辞書にキー「${match[1]}」がありません。`;
    match = message.match(/^Index (.+) out of bounds\.?$/);
    if (match) return `添字 ${match[1]} は範囲外です。`;

    return message;
  }

  function localizeError(value) {
    const original = String(value ?? "").trim();
    if (!original) return "不明なエラーが発生しました。";

    const line = errorLine(original);
    let text = original
      .replace(/\s+\b(?:at|on)\s+line\s+\d+(?:,\s*column\s+\d+)?\b\.?/gi, "")
      .trim();
    let title = "エラー";
    const prefix = text.match(/^([A-Za-z]+Error):\s*/);
    if (prefix) {
      title = ERROR_NAMES.get(prefix[1]) || "エラー";
      text = text.slice(prefix[0].length);
    }

    const warning = text.match(/^Warning:\s*/);
    if (warning) {
      title = "注意";
      text = text.slice(warning[0].length);
    }

    const translated = translateMessage(text);
    const punctuation = /[。.!?]$/.test(translated) ? "" : "。";
    const lineText = line ? `（${line}行目）` : "";
    return `${title}: ${translated}${punctuation}${lineText}`;
  }

  return { errorLine, localizeError };
});
