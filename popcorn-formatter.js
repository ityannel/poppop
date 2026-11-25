((root, factory) => {
  const formatter = factory();
  if (typeof module === "object" && module.exports) module.exports = formatter;
  else root.PopCornFormatter = formatter;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  "use strict";

  // vscode-popcorn/language-features.js の formatDocument と同じ規則です。
  function maskNonCode(line) {
    const characters = line.split("");

    for (let index = 0; index < line.length; index += 1) {
      if (line[index] === "/" && line[index + 1] === "/") {
        for (let commentIndex = index; commentIndex < line.length; commentIndex += 1) {
          characters[commentIndex] = " ";
        }
        break;
      }

      if (line[index] === "`") {
        characters[index] = " ";
        index += 1;
        while (index < line.length) {
          characters[index] = " ";
          if (line[index] === "`") break;
          index += 1;
        }
        continue;
      }

      if (line[index] === "\"" || line[index] === "'") {
        const quote = line[index];
        characters[index] = " ";
        index += 1;
        while (index < line.length) {
          characters[index] = " ";
          if (line[index] === "\\") {
            index += 1;
            if (index < line.length) characters[index] = " ";
          } else if (line[index] === quote) {
            break;
          }
          index += 1;
        }
      }
    }

    return characters.join("");
  }

  function normalizePipelineSpacing(line, code) {
    let result = "";
    let index = 0;
    while (index < line.length) {
      const match = /^(>>)/.exec(code.slice(index));
      if (match) {
        result = result.replace(/[ \t]+$/, "");
        result += ` ${match[1]} `;
        index += match[1].length;
        while (index < line.length && /[ \t]/.test(line[index])) index += 1;
      } else {
        result += line[index];
        index += 1;
      }
    }
    // 行頭の `>>`（ブロックのあとに外側のパイプラインを続ける行）の前には、空白を入れない
    return result.trim();
  }

  // 行の中の、ブロックを開く `:`（`::`、辞書のキー、Fork のラベルは除く）。辞書・リストの括弧の中の `:` は、ブロックではない
  function isBlockColon(code, index, innermostBracket) {
    if (innermostBracket === "{" || innermostBracket === "[") return false;
    if (code[index + 1] === ":" || code[index - 1] === ":") return false;
    const label = /^\s*([a-z_][a-zA-Z0-9_]*)\s*:/.exec(code);
    return !(label && label[0].length - 1 === index && !/^(when|else)$/.test(label[1]));
  }

  /**
   * 字下げをそろえ、`>>` の前後の空白を 1 つにします。
   *   * `:` のブロックの本体は、見出しの行より 1 段深く。見出しと同じか浅い行で、ブロックは終わります。
   *   * 丸括弧・角括弧・波括弧の中で改行した行は、括弧 1 つ（開いた行 1 つ）につき 1 段深く。
   *     閉じ括弧で、その中で開いたブロックも終わります。
   *   * コメントだけの行は、ブロックを閉じません（字下げは、その行の字下げで残るブロックの段にそろえます）。
   *   * 行末の `:` のすぐ次の行は、字下げを忘れていても本体として 1 段下げます（本体のないブロックはないため）。
   *     そのときは、`>>` や `when` / `else` / `Catch` で始まる行、空行、それより浅い行までを本体とみなします。
   */
  function formatDocument(text, indentSize = 4) {
    const eol = text.includes("\r\n") ? "\r\n" : "\n";
    const rawLines = text.split(/\r?\n/);
    // { indent: 見出しの行の元の字下げ, depth: 開いたときの括弧の深さ,
    //   awaitingBody: 行末が `:`（本体は次の行から）, flushIndent: 字下げを忘れた本体の、元の字下げ }
    const blocks = [];
    const brackets = [];    // 開いている括弧ごとに { ch: 括弧, line: 開いた行の番号 }
    const levelOf = openBrackets => new Set(openBrackets.map(bracket => bracket.line)).size;

    let previousBlank = false;

    const formatted = rawLines.map((rawLine, lineIndex) => {
      const trimmed = rawLine.trim();
      if (!trimmed) {
        previousBlank = true;
        return "";
      }

      const code = maskNonCode(trimmed);
      const rawIndent = rawLine.length - rawLine.trimStart().length;
      const isCommentOnly = trimmed.startsWith("//");
      // 行頭の閉じ括弧は、開いた行と同じ段にそろえる
      const leadingCloses = (/^[)\]}]+/.exec(code.replace(/\s+/g, "")) || [""])[0].length;
      const visibleBrackets = brackets.slice(0, Math.max(0, brackets.length - leadingCloses));
      if (!isCommentOnly) {
        const top = blocks[blocks.length - 1];
        if (top?.awaitingBody) {
          // 行末の `:` の次の行は、いつも本体
          top.awaitingBody = false;
          if (rawIndent <= top.indent) top.flushIndent = rawIndent;
        } else {
          // 同じ括弧の中で開いたブロックは、見出しと同じか浅い字下げの行で終わる
          // `>>`、`when` / `else` / `Catch` の行は、字下げを忘れた本体を 1 つだけ閉じる
          let siblingUsed = false;
          while (blocks.length && blocks[blocks.length - 1].depth === visibleBrackets.length) {
            const block = blocks[blocks.length - 1];
            let ends;
            if (block.flushIndent === undefined) {
              ends = rawIndent <= block.indent;
            } else if (previousBlank || rawIndent < block.flushIndent) {
              ends = true;
            } else if (!siblingUsed && /^\s*(?:>>|(?:when|else|Catch)\b)/.test(code)) {
              ends = true;
              siblingUsed = true;
            } else {
              ends = false;
            }
            if (!ends) break;
            blocks.pop();
          }
        }
        previousBlank = false;
      }
      let openBlocks = blocks.filter(block => block.depth <= visibleBrackets.length).length;
      if (isCommentOnly) {
        // コメントだけの行はブロックを閉じないが、浅く書いたコメントは、その字下げで残るブロックの段にそろえる
        let kept = 0;
        for (const block of blocks.slice(0, openBlocks)) {
          const inside = block.flushIndent === undefined ? rawIndent > block.indent : rawIndent >= block.flushIndent;
          if (!inside) break;
          kept += 1;
        }
        openBlocks = kept;
      }
      const level = openBlocks + levelOf(visibleBrackets);
      const line = " ".repeat(level * indentSize) + normalizePipelineSpacing(trimmed, code);

      if (!isCommentOnly) {
        let opened;
        let openedAt = -1;
        for (let index = 0; index < code.length; index += 1) {
          const ch = code[index];
          if (ch === "(" || ch === "[" || ch === "{") brackets.push({ ch, line: lineIndex });
          else if (ch === ")" || ch === "]" || ch === "}") {
            brackets.pop();
            while (blocks.length && blocks[blocks.length - 1].depth > brackets.length) blocks.pop();
            if (opened && opened.depth > brackets.length) opened = undefined;
          } else if (ch === ":" && !opened && isBlockColon(code, index, brackets[brackets.length - 1]?.ch)) {
            opened = { indent: rawIndent, depth: brackets.length };
            openedAt = index;
          }
        }
        if (opened) {
          // `:` のあとがコメントだけなら、本体は次の行から（文字列は隠してあるので、元の行で調べる）
          opened.awaitingBody = /^\s*(?:\/\/.*)?$/.test(trimmed.slice(openedAt + 1));
          blocks.push(opened);
        }
      }
      return line;
    });
    return formatted.join(eol);
  }

  // ---- 旧形式の Check（`when 条件:` / `else:`）を、新しい書き方（{ }）へ直す ----
  const OLD_CHECK_HEADER = /^(\s*)(when\b.*|else)\s*:\s*$/;

  function hasOldCheckSyntax(code) {
    return String(code).split(/\r?\n/).some((line) => OLD_CHECK_HEADER.test(line));
  }

  // 分岐の見出しの字下げより深い行を、その分岐の本体とみなして、`{` と `}` で囲む（1行で書いた旧形式は、直さない）
  function migrateOldCheckSyntax(code) {
    const eol = String(code).includes("\r\n") ? "\r\n" : "\n";
    const lines = String(code).replace(/\r\n/g, "\n").split("\n");
    const out = [];
    let i = 0;
    while (i < lines.length) {
      const match = OLD_CHECK_HEADER.exec(lines[i]);
      if (!match) { out.push(lines[i]); i += 1; continue; }
      const depth = match[1].length;
      out.push(`${match[1]}${match[2]} {`);
      i += 1;
      while (i < lines.length && (!lines[i].trim() || lines[i].length - lines[i].trimStart().length > depth)) {
        out.push(lines[i]);
        i += 1;
      }
      const tail = [];
      while (out.length && !out[out.length - 1].trim()) tail.push(out.pop());
      out.push(`${" ".repeat(depth)}}`);
      out.push(...tail.reverse());
    }
    return out.join(eol);
  }

  // ---- 入力中の字下げ（Enter を押したとき） ----
  // 行末が `:`（ブロックの見出し）なら、次の行は 1 段深く。それ以外は、いまの行と同じ字下げ
  function opensBlockAtEnd(line) {
    // 文字列は "S" に置きかえ（中の `:` や `//` を見ない）、コメントを取り除いてから、行末を見る
    const code = line
      .replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`[^`]*`/g, "S")
      .replace(/\/\/.*$/, "")
      .trimEnd();
    return /(^|[^:]):$/.test(code);
  }

  function nextLineIndent(line, unit = "    ") {
    const indent = /^[ \t]*/.exec(line)[0];
    return opensBlockAtEnd(line) ? indent + unit : indent;
  }

  // `else:`、`Catch`、`when …:` を打ったら、見出しの `when` / `Try` と同じ段へ戻す
  function isBranchLine(line) {
    return /^\s*(?:else\s*:|Catch\b|when\b.*:)/.test(line);
  }

  return Object.freeze({ formatDocument, hasOldCheckSyntax, migrateOldCheckSyntax, nextLineIndent, isBranchLine });
});
