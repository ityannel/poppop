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
      const startsWithClose = /^:\)/.test(trimmedCode);
      const isBranchHeader = /^(?:when\b[\s\S]*|else)\s*:\s*$/.test(trimmedCode.trim());

      if (startsWithClose) {
        if (stack.at(-1) === "branch") stack.pop();
        if (stack.at(-1) === "block") stack.pop();
      } else if (isBranchHeader && stack.at(-1) === "branch") {
        stack.pop();
      }

      const line = " ".repeat(stack.length * indentSize)
        + normalizePipelineSpacing(trimmed, trimmedCode);

      const lineCode = maskNonCode(line.trim());
      const openCount = (lineCode.match(/\(\:/g) || []).length;
      const closeCount = (lineCode.match(/\:\)/g) || []).length;
      const remainingCloses = Math.max(0, closeCount - (startsWithClose ? 1 : 0));
      const netOpens = openCount - remainingCloses;

      if (netOpens > 0) {
        for (let i = 0; i < netOpens; i += 1) stack.push("block");
      } else if (netOpens < 0) {
        for (let i = 0; i < -netOpens; i += 1) {
          if (stack.at(-1) === "branch") stack.pop();
          if (stack.at(-1) === "block") stack.pop();
        }
      } else if (isBranchHeader) {
        stack.push("branch");
      }

      return line;
    });
    return formatted.join(eol);
  }

  return Object.freeze({ formatDocument });
});
