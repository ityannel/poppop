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
    return result.trimEnd();
  }

  function formatDocument(text, indentSize = 4) {
    const eol = text.includes("\r\n") ? "\r\n" : "\n";
    const rawLines = text.split(/\r?\n/);
    const stack = [];
    const formatted = rawLines.map((rawLine) => {
      const trimmed = rawLine.trim();
      if (!trimmed) return "";

      const trimmedCode = maskNonCode(trimmed);
      const startsWithClose = /^\}/.test(trimmedCode);
      if (startsWithClose) stack.pop();

      const line = " ".repeat(stack.length * indentSize)
        + normalizePipelineSpacing(trimmed, trimmedCode);

      const lineCode = maskNonCode(line.trim());
      const openCount = (lineCode.match(/\{/g) || []).length;
      const closeCount = (lineCode.match(/\}/g) || []).length;
      const remainingCloses = Math.max(0, closeCount - (startsWithClose ? 1 : 0));
      const netOpens = openCount - remainingCloses;

      if (netOpens > 0) {
        for (let i = 0; i < netOpens; i += 1) stack.push("block");
      } else if (netOpens < 0) {
        for (let i = 0; i < -netOpens; i += 1) stack.pop();
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

  return Object.freeze({ formatDocument, hasOldCheckSyntax, migrateOldCheckSyntax });
});
