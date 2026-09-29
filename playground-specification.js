((root, factory) => {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PopPopSpecification = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  "use strict";

  // Reads examples and the standard-function table out of
  // poppop_specification.md, and encodes source code for share URLs.
  function parseSpecification(markdown) {
    const lines = markdown.split(/\r?\n/);
    const foundExamples = [];
    const foundReferences = [];
    let heading = "基本";
    let inStandardFunctionSection = false;
    let inCode = false;
    let codeLines = [];

    for (const line of lines) {
      const headingMatch = line.match(/^(#{2,4})\s+(.+)$/);
      if (!inCode && headingMatch) {
        heading = headingMatch[2].trim();
        if (headingMatch[1].length <= 3) {
          inStandardFunctionSection =
            heading.replace(/^\d+\.\s*/, "") === "標準関数一覧";
        }
      }
      if (line.trim() === "```poppop") {
        inCode = true;
        codeLines = [];
        continue;
      }
      if (inCode && line.trim() === "```") {
        const code = codeLines.join("\n").trim();
        if (code) foundExamples.push({ title: heading, code });
        inCode = false;
        continue;
      }
      if (inCode) codeLines.push(line);

      const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
      if (
        inStandardFunctionSection &&
        cells.length === 4 &&
        /^`[^`]+`$/.test(cells[1])
      ) {
        foundReferences.push({
          category: cells[0],
          name: cells[1].slice(1, -1),
          input: cells[2],
          description: cells[3],
        });
      }
    }
    return { examples: foundExamples, references: foundReferences };
  }

  function friendlySpecificationExamples(items) {
    const counts = new Map();
    return items.map((item, index) => {
      const base = item.title.replace(/^\d+\.\s*/, "").trim() || "基本";
      const count = (counts.get(base) ?? 0) + 1;
      counts.set(base, count);
      const suffix = count > 1 ? ` ${count}` : "";
      return {
        id: `spec-${index}`,
        category: "仕様の例",
        title: `仕様の例｜${base}${suffix}`,
        description: "仕様書に掲載されている実行例です。",
        interactive: false,
        code: item.code,
      };
    });
  }

  function decodeSource(encodedSource) {
    try {
      const encoded = String(encodedSource).replace(/-/g, "+").replace(/_/g, "/");
      const binary = atob(encoded);
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    } catch {
      return null;
    }
  }

  function encodeSource(source) {
    const bytes = new TextEncoder().encode(source);
    let binary = "";
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  return Object.freeze({
    parseSpecification,
    friendlySpecificationExamples,
    encodeSource,
    decodeSource,
  });
});
