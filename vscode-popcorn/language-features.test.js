"use strict";

const assert = require("assert");
const {
    analyzeDocument,
    findBlockRanges,
    findPipelineAtOffset,
    findPropertyDefinitions,
    findPropertyReferences,
    findUpdatePropertyOffsets,
    findVariableDefinitions,
    findVariableReferences,
    formatDocument,
    implicitContextAtOffset,
    implicitValueAtOffset,
    isImplicitMarkerAtOffset,
    inferVariableType,
    tokenAtOffset,
    typeFlowSummary
} = require("./language-features");

const source = [
    "1 >> value.",
    "value >> Display.",
    "[1, 2] >> Map as item (:",
    "  item >> Display.",
    ":)",
    "unknown >> Display",
    "@ >> Display."
].join("\n");

assert.strictEqual(findVariableDefinitions(source, "value").length, 1);
assert.strictEqual(findVariableReferences(source, "value").length, 2);
assert.deepStrictEqual(findBlockRanges(source).map(block => [block.kind, block.name, block.startLine, block.endLine]), [
    ["stream", "Map", 2, 4]
]);

const pipeline = findPipelineAtOffset(source, source.indexOf(">>") + 1);
assert.strictEqual(pipeline.inputType, "数値");
assert.strictEqual(pipeline.target, "value");
assert.strictEqual(pipeline.stage, "value.");
assert.strictEqual(typeFlowSummary(pipeline.typeFlow), "入力（数値） → 最終代入先: value");

const multiLineInput = ["[", "    1,", "    2", "] >> users."].join("\n");
const multiLinePipeline = findPipelineAtOffset(multiLineInput, multiLineInput.indexOf(">>") + 1);
assert.strictEqual(multiLineInput.slice(multiLinePipeline.start, multiLinePipeline.end), multiLineInput);
assert.strictEqual(multiLinePipeline.inputType, "配列");

const streamPipelineSource = [
    "users >> Map as user (:",
    "    user >> Update (:",
    "    :)",
    ":) >> Display >> instant."
].join("\n");
const streamPipeline = findPipelineAtOffset(streamPipelineSource, streamPipelineSource.indexOf(">>") + 1);
assert.strictEqual(streamPipelineSource.slice(streamPipeline.start, streamPipeline.end), streamPipelineSource);
const streamOutputPipeline = findPipelineAtOffset(streamPipelineSource, streamPipelineSource.lastIndexOf(">>") + 1);
assert.strictEqual(
    typeFlowSummary(streamOutputPipeline.typeFlow),
    "入力（配列） → Display（配列） → 最終代入先: instant"
);

const kinds = analyzeDocument(source).map(diagnostic => diagnostic.kind);
assert.ok(kinds.includes("undefined-variable"));
assert.ok(kinds.includes("missing-terminator"));
assert.ok(kinds.includes("implicit-variable-scope"));

const caseCollisionDiagnostics = analyzeDocument("1 >> map.");
assert.ok(caseCollisionDiagnostics.some(diagnostic =>
    diagnostic.kind === "standard-name-case-collision"
));

const updateSource = [
    "users >> Map as user (:",
    "    user >> Update (:",
    '        "hidden" >> @::password.',
    "    :)",
    ":) >> instant."
].join("\n");
const updateDiagnostics = analyzeDocument(updateSource);
assert.ok(!updateDiagnostics.some(diagnostic =>
    diagnostic.kind === "undefined-variable" && ["user", "password"].includes(updateSource.slice(diagnostic.start, diagnostic.start + diagnostic.length))
));

const updateKeysSource = [
    '[{"name": "alice", "password": "hash"}] >> users.',
    "users >> Map as user (:",
    "    user >> Update (:",
    "        @::name >> Uppercase >> @::name.",
    "        false >> @::is_admin.",
    '        "hidden" >> @::password.',
    "    :)",
    ":) >> Display."
].join("\n");
const updateProperties = findUpdatePropertyOffsets(updateKeysSource);
assert.strictEqual(updateProperties.find(property => property.name === "name").isNew, false);
assert.strictEqual(updateProperties.find(property => property.name === "is_admin").isNew, true);
assert.strictEqual(updateProperties.find(property => property.name === "password").isNew, false);
assert.strictEqual(findVariableDefinitions(updateKeysSource, "user").length, 1);
assert.strictEqual(inferVariableType(updateKeysSource, "user"), "ストリーム要素");
assert.strictEqual(findPropertyDefinitions(updateKeysSource, "password").length, 1);
assert.strictEqual(findPropertyReferences(updateKeysSource, "password").length, 2);
assert.deepStrictEqual(
    implicitContextAtOffset(updateKeysSource, updateKeysSource.indexOf("::is_admin") + 3),
    { stream: "Update", parameters: [], value: "@" }
);

// Destructuring alias in Reduce and labeled Fork should not flag undefined variables
const reduceAndFork = [
    "[1, 2, 3] >> Reduce(0) as (acc, item) (:",
    "    acc + item.",
    ":) >> total.",
    "[1, 2, 3] >> Fork as values (:",
    "    sum: values >> Sum.",
    "    max: values >> Max.",
    ":) >> stats.",
    "total >> Display.",
    "stats >> Display."
].join("\n");
const reduceForkUndefined = analyzeDocument(reduceAndFork).filter(d => d.kind === "undefined-variable");
assert.deepStrictEqual(reduceForkUndefined, []);

const explicitImplicitSource = ["users >> Map as user (:", "    @::name >> Display.", ":)"].join("\n");
assert.ok(isImplicitMarkerAtOffset(explicitImplicitSource, explicitImplicitSource.indexOf("@")));
const valueImplicitSource = "false >> @::is_admin.";
assert.deepStrictEqual(
    implicitValueAtOffset(valueImplicitSource, valueImplicitSource.indexOf("@")),
    { expression: "false", type: "真偽値" }
);

const pipelineProblemKinds = analyzeDocument([
    "true >> Num.",
    "1 >> .",
    "value >> Display."
].join("\n")).map(diagnostic => diagnostic.kind);
assert.ok(pipelineProblemKinds.includes("pipeline-type-mismatch"));
assert.ok(pipelineProblemKinds.includes("empty-pipeline-stage"));

const updateTypoDiagnostics = analyzeDocument([
    '[{"name": "alice", "score1": 10, "score2": 20}] >> users.',
    "users >> Map as user (:",
    "    user >> Update (:",
    '        "ALICE" >> @::neme.',
    "        30 >> @::score3.",
    "    :)",
    ":) >> Display."
].join("\n"));
const keyTypoWarnings = updateTypoDiagnostics.filter(item => item.kind === "likely-update-key-typo");
assert.strictEqual(keyTypoWarnings.length, 1);
assert.ok(keyTypoWarnings[0].message.includes("neme"));
assert.ok(keyTypoWarnings[0].message.includes("name"));
const ignoredUpdateTypoDiagnostics = analyzeDocument([
    '[{"name": "alice"}] >> users.',
    "users >> Map as user (:",
    "    user >> Update (:",
    '        "ALICE" >> @::neme. // popcorn-ignore: likely-update-key-typo',
    "    :)",
    ":) >> Display."
].join("\n"));
assert.ok(!ignoredUpdateTypoDiagnostics.some(item => item.kind === "likely-update-key-typo"));

const stringPipeline = '"password" >> Display.';
assert.ok(!analyzeDocument(stringPipeline).some(diagnostic => diagnostic.kind === "empty-pipeline-input"));
assert.strictEqual(tokenAtOffset(stringPipeline, stringPipeline.indexOf("password") + 1), undefined);
assert.strictEqual(
    findPipelineAtOffset(stringPipeline, stringPipeline.indexOf(">>") + 1).inputType,
    "文字列"
);

assert.strictEqual(formatDocument("1>>value.\n[1]>>Map as item (:\nitem>>Display.\n:)"), [
    "1 >> value.",
    "[1] >> Map as item (:",
    "    item >> Display.",
    ":)"
].join("\n"));

console.log("Language feature tests passed.");
