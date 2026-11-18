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
    ["SetError", "更新エラー"],
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
      ["Check requires a final else branch", "Check の最後には else が必要です。"],
      ["Check requires an else branch", "Check には else が必要です。"],
      ["Check predicate must return Bool", "Check の条件式は Bool を返す必要があります。"],
      ["Filter block must return Bool", "Filter のブロックは Bool を返す必要があります。"],
      ["Map stream requires a list", "Map にはリストを渡してください。"],
      ["Filter stream requires a list", "Filter にはリストを渡してください。"],
      ["Reduce stream requires non-empty list", "Reduce には空でないリストを渡してください。"],
      ["Sort stream requires a list", "Sort にはリストを渡してください。"],
      ["Group stream requires a list", "Group にはリストを渡してください。"],
      ["Update stream requires a dictionary", "Update には辞書を渡してください。"],
      ["Break can only be used inside Loop", "Break は Loop の中でのみ使用できます。"],
      ["Return can only be used inside a new function", "Return は定義した関数の中でのみ使用できます。"],
      ["A value list requires at least two values", "値リストには2個以上の値が必要です。"],
      ["Parentheses after a function name are reserved for block aliases", "関数名の直後の括弧は、ブロックの置換変数名にだけ使用できます。"],
    ]);
    if (exact.has(message)) return exact.get(message);

    let match = message.match(/^Variable '([^']+)' is not defined\.?$/);
    if (match) return `変数「${match[1]}」は定義されていません。`;
    match = message.match(/^Function '([^']+)' is not defined\.?$/);
    if (match) return `関数「${match[1]}」は定義されていません。`;
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
      .replace(/\s+\b(?:at|on)\s+line\s+\d+\b\.?/gi, "")
      .trim();
    let title = "エラー";
    const prefix = text.match(/^([A-Za-z]+Error):\s*/);
    if (prefix) {
      title = ERROR_NAMES.get(prefix[1]) || "エラー";
      text = text.slice(prefix[0].length);
    }

    const translated = translateMessage(text);
    const punctuation = /[。.!?]$/.test(translated) ? "" : "。";
    const lineText = line ? `（${line}行目）` : "";
    return `${title}: ${translated}${punctuation}${lineText}`;
  }

  return { errorLine, localizeError };
});
