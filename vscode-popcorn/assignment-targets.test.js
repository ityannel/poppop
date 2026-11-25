"use strict";

const assert = require("assert");
const { findFinalAssignmentTargetOffsets } = require("./assignment-targets");

const source = [
    "1 >> first.",
    "1 >> Display.",
    "\"ignore >> fake.\" >> real. // >> comment.",
    "[1, 2] >> (left, right).",
    "15 >> grid[row][column].",
    "foo >> middle >> final.",
    "1 >> hidden /* comment",
    ">> fake. */ 2 >> visible."
].join("\r\n");

const targets = findFinalAssignmentTargetOffsets(source)
    .map(({ start, length }) => source.slice(start, start + length));

assert.deepStrictEqual(targets, [
    "first",
    "real",
    "left",
    "right",
    "grid",
    "final",
    "visible"
]);

// `>?>` binds like `>>`; the value after `>!>` is a fallback, not a binding.
const pipeSource = [
    "\"7\" >> Num >?> tapped.",
    "\"x\" >> Num >!> fallback.",
    "\"x\" >> Num >!> 0 >> after."
].join("\n");
assert.deepStrictEqual(
    findFinalAssignmentTargetOffsets(pipeSource).map(({ start, length }) => pipeSource.slice(start, start + length)),
    ["tapped", "after"]
);

console.log("Assignment-target detection tests passed.");
