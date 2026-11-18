"use strict";

// These keywords may be legal words in the grammar, but they are never
// variable binding targets.
const RESERVED_WORDS = new Set([
    "and", "else", "false", "is", "new", "not", "null", "or", "true"
]);

const IDENTIFIER = "[a-z_][a-zA-Z0-9_]*";

/**
 * Replaces strings and comments with spaces while preserving character
 * positions. That lets the caller use the returned offsets with the original
 * document text.
 */
function maskNonCode(line, state) {
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
                    if (index < line.length) {
                        characters[index] = " ";
                    }
                } else if (line[index] === quote) {
                    break;
                }
                index += 1;
            }
        }
    }

    return characters.join("");
}

function lastNonWhitespaceIndex(text) {
    for (let index = text.length - 1; index >= 0; index -= 1) {
        if (!/\s/.test(text[index])) {
            return index;
        }
    }
    return -1;
}

function lastPipelineOperatorIndex(text, endIndex) {
    let operatorIndex = -1;
    for (let index = 0; index < endIndex; index += 1) {
        if (text[index] === ">" && text[index + 1] === ">") {
            operatorIndex = index;
            index += 1;
        }
    }
    return operatorIndex;
}

function isVariableName(name) {
    return !RESERVED_WORDS.has(name);
}

function directTargetOffsets(targetText) {
    // An indexed target (for example, grid[row][column]) still binds grid.
    const directTarget = new RegExp(`^\\s*(${IDENTIFIER})\\s*(?:\\[[^\\]]*\\]\\s*)*$`).exec(targetText);
    if (!directTarget || !isVariableName(directTarget[1])) {
        return [];
    }

    return [{ start: directTarget.index + directTarget[0].indexOf(directTarget[1]), length: directTarget[1].length }];
}

function destructuringTargetOffsets(targetText) {
    const destructuringTarget = new RegExp(`^\\s*\\(\\s*${IDENTIFIER}\\s*(?:,\\s*${IDENTIFIER}\\s*)+\\)\\s*$`);
    if (!destructuringTarget.test(targetText)) {
        return [];
    }

    const offsets = [];
    const identifierPattern = new RegExp(IDENTIFIER, "g");
    for (const match of targetText.matchAll(identifierPattern)) {
        if (isVariableName(match[0])) {
            offsets.push({ start: match.index, length: match[0].length });
        }
    }
    return offsets;
}

/**
 * Finds the final variable binding target in each completed PopCorn pipeline.
 * The returned offsets are absolute offsets in `text`.
 */
function findFinalAssignmentTargetOffsets(text) {
    const offsets = [];
    // Split on LF only so a preceding CR remains part of the line. This keeps
    // offsets correct for both LF and CRLF documents.
    const lines = text.split("\n");
    const state = { inBlockComment: false };
    let lineStartOffset = 0;

    for (const line of lines) {
        const code = maskNonCode(line, state);
        const terminatorIndex = lastNonWhitespaceIndex(code);

        // A binding target is only final when it ends a completed pipeline.
        if (terminatorIndex !== -1 && code[terminatorIndex] === ".") {
            const operatorIndex = lastPipelineOperatorIndex(code, terminatorIndex);
            if (operatorIndex !== -1) {
                const targetStart = operatorIndex + 2;
                const targetText = code.slice(targetStart, terminatorIndex);
                const targetOffsets = [
                    ...directTargetOffsets(targetText),
                    ...destructuringTargetOffsets(targetText)
                ];

                for (const target of targetOffsets) {
                    offsets.push({
                        start: lineStartOffset + targetStart + target.start,
                        length: target.length
                    });
                }
            }
        }

        // split() discards a newline; add it back for the next line's offsets.
        lineStartOffset += line.length + 1;
    }

    return offsets;
}

module.exports = { findFinalAssignmentTargetOffsets, maskNonCode };
