"use strict";

const assert = require("assert");
const Module = require("module");

const text = "1 >> value.\nvalue >> Display.\n\"password\" >> Display.";
const decorations = new Map();
const listeners = {};
const providers = {};

class Position {
    constructor(line, character) {
        this.line = line;
        this.character = character;
    }
}

class Range {
    constructor(start, end) {
        this.start = start;
        this.end = end;
    }
}

class Diagnostic {
    constructor(range, message, severity) {
        this.range = range;
        this.message = message;
        this.severity = severity;
    }
}

function positionAt(offset) {
    const before = text.slice(0, offset);
    const line = before.split("\n").length - 1;
    const previousNewline = before.lastIndexOf("\n");
    return new Position(line, offset - previousNewline - 1);
}

function offsetAt(position) {
    const lines = text.split("\n");
    let offset = 0;
    for (let line = 0; line < position.line; line += 1) {
        offset += lines[line].length + 1;
    }
    return offset + position.character;
}

const document = {
    languageId: "popcorn",
    uri: {},
    getText: range => range ? text.slice(offsetAt(range.start), offsetAt(range.end)) : text,
    positionAt,
    offsetAt,
    lineAt: line => ({ text: text.split("\n")[line] }),
    getWordRangeAtPosition(position, pattern) {
        const offset = offsetAt(position);
        const before = text.slice(0, offset).match(/[a-zA-Z_][a-zA-Z0-9_]*$/);
        const after = text.slice(offset).match(/^[a-zA-Z0-9_]*/);
        if (!before || !after) {
            return undefined;
        }
        const word = before[0] + after[0];
        if (pattern) {
            pattern.lastIndex = 0;
            if (!pattern.test(word)) {
                return undefined;
            }
        }
        return new Range(positionAt(offset - before[0].length), positionAt(offset + after[0].length));
    }
};

const editor = {
    document,
    selection: { isEmpty: true, active: positionAt(text.lastIndexOf("value") + 1) },
    setDecorations(type, ranges) {
        decorations.set(type, ranges);
    }
};

const noopDisposable = { dispose() {} };
const vscode = {
    Position,
    Range,
    DecorationRangeBehavior: { ClosedClosed: 0 },
    OverviewRulerLane: { Center: 2 },
    DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2 },
    Diagnostic,
    Location: class Location { constructor(uri, range) { this.uri = uri; this.range = range; } },
    WorkspaceEdit: class WorkspaceEdit { replace() {} },
    MarkdownString: class MarkdownString {
        constructor(value = "") { this.value = value; }
        appendMarkdown(value) { this.value += value; }
        appendCodeblock(value) { this.value += value; }
    },
    Hover: class Hover { constructor(contents, range) { this.contents = contents; this.range = range; } },
    TextEdit: { replace: () => ({}) },
    DocumentSymbol: class DocumentSymbol {},
    FoldingRange: class FoldingRange {},
    SymbolKind: { Function: 12, Method: 5, Namespace: 3 },
    commands: { registerCommand: () => noopDisposable },
    languages: {
        createDiagnosticCollection: () => ({ set() {}, delete() {}, dispose() {} }),
        registerDefinitionProvider: (_selector, provider) => { providers.definition = provider; return noopDisposable; },
        registerReferenceProvider: (_selector, provider) => { providers.reference = provider; return noopDisposable; },
        registerRenameProvider: (_selector, provider) => { providers.rename = provider; return noopDisposable; },
        registerHoverProvider: (_selector, provider) => { providers.hover = provider; return noopDisposable; },
        registerDocumentFormattingEditProvider: (_selector, provider) => { providers.format = provider; return noopDisposable; },
        registerDocumentSymbolProvider: (_selector, provider) => { providers.symbols = provider; return noopDisposable; },
        registerFoldingRangeProvider: (_selector, provider) => { providers.folding = provider; return noopDisposable; }
    },
    workspace: {
        getConfiguration: () => ({ get: (_key, defaultValue) => defaultValue }),
        onDidChangeTextDocument: () => noopDisposable,
        onDidChangeConfiguration: () => noopDisposable
    },
    window: {
        activeTextEditor: editor,
        visibleTextEditors: [editor],
        createTextEditorDecorationType: options => ({ options }),
        createOutputChannel: () => ({ clear() {}, appendLine() {}, append() {}, show() {}, dispose() {} }),
        onDidChangeActiveTextEditor: handler => { listeners.active = handler; return noopDisposable; },
        onDidChangeTextEditorSelection: handler => { listeners.selection = handler; return noopDisposable; },
        onDidChangeVisibleTextEditors: handler => { listeners.visible = handler; return noopDisposable; }
    }
};

const originalLoad = Module._load;
Module._load = function mockedLoad(request, parent, isMain) {
    return request === "vscode" ? vscode : originalLoad.call(this, request, parent, isMain);
};
const extension = require("./extension");
Module._load = originalLoad;

extension.activate({ subscriptions: { push() {} } });

const referenceDecoration = [...decorations.keys()].find(type => type.options.overviewRulerColor === "#4EC9B0");
assert.ok(referenceDecoration, "Variable references should receive a visible decoration.");
assert.strictEqual(referenceDecoration.options.fontWeight, undefined, "クリック時の変数表示は太字にしない。");

const rangeText = entry => {
    const range = entry.range || entry;
    return text.slice(offsetAt(range.start), offsetAt(range.end));
};
assert.deepStrictEqual(decorations.get(referenceDecoration).map(rangeText), ["value", "value"]);
assert.ok(providers.definition && providers.reference && providers.rename && providers.hover && providers.format && providers.symbols && providers.folding);
const displayHover = providers.hover.provideHover(document, positionAt(text.lastIndexOf("Display") + 1));
assert.ok(displayHover, "標準関数にはホバー説明を表示する。");
assert.ok(displayHover.contents.value.includes("値を表示"));
const variableHover = providers.hover.provideHover(document, positionAt(text.lastIndexOf("value") + 1));
assert.ok(variableHover.contents.value.includes("宣言:"));
assert.ok(variableHover.contents.value.includes("推定型:"));
assert.ok(variableHover.contents.value.includes("型の流れ:"));
assert.strictEqual(
    providers.hover.provideHover(document, positionAt(text.indexOf("password") + 1)),
    undefined,
    "文字列内の単語を変数として扱わない。"
);

console.log("Cursor-driven variable flow highlighting test passed.");
