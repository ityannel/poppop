"use strict";

const assert = require("assert");
const {
    findImplicitVariableOffsets,
    findImplicitVariableScopeRanges,
    findPipelineGuideRanges,
    findVariableReferenceOffsets,
    variableAtOffset
} = require("./semantic-highlights");

const source = [
    "[1, 2] >> Map(item):",
    "    item >> Display.",
    ".. >> values.",
    "values >> Length >> count.",
    "\"Map >> ignored\" >> Display. // @ignored"
].join("\r\n");

const sliceRanges = ranges => ranges.map(({ start, end }) => source.slice(start, end));
const sliceOffsets = offsets => offsets.map(({ start, length }) => source.slice(start, start + length));

assert.deepStrictEqual(sliceRanges(findPipelineGuideRanges(source)), [
    "[1, 2] >> Map(item):",
    "item >> Display.",
    ".. >> values.",
    "values >> Length >> count.",
    "\"Map >> ignored\" >> Display."
]);
assert.deepStrictEqual(sliceOffsets(findImplicitVariableOffsets(source)), []);
assert.strictEqual(sliceRanges(findImplicitVariableScopeRanges(source)).length, 1);
assert.ok(sliceRanges(findImplicitVariableScopeRanges(source))[0].includes("item >> Display."));
assert.deepStrictEqual(sliceOffsets(findVariableReferenceOffsets(source, "values")), ["values", "values"]);
assert.strictEqual(variableAtOffset(source, source.indexOf("values")), "values");
assert.strictEqual(variableAtOffset(source, source.indexOf("ignored")), undefined);

console.log("Semantic highlighting tests passed.");
