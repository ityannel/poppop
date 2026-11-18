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
    let indent = 0;
    const formatted = rawLines.map((rawLine) => {
      const trimmed = rawLine.trim();
      if (!trimmed) return "";

      const trimmedCode = maskNonCode(trimmed);
      if (/^\.\./.test(trimmedCode)) indent = Math.max(0, indent - 1);
      const line = " ".repeat(indent * indentSize)
        + normalizePipelineSpacing(trimmed, trimmedCode);
      const lineCode = maskNonCode(line.trim());
      if (lineCode.trim().endsWith(":") && !lineCode.includes("..")) indent += 1;
      return line;
    });
    return formatted.join(eol);
  }

  return Object.freeze({ formatDocument });
});
