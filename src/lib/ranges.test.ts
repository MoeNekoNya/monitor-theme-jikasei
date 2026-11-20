import assert from "node:assert/strict"
import { rangesFor } from "./ranges.ts"

const allowed = [0.167, 0.5, 1, 6, 12, 24, 48, 96, 168]
assert.deepEqual(rangesFor(7).map((range) => range.hours), allowed)
assert.deepEqual(rangesFor(undefined).map((range) => range.hours), allowed)
assert.deepEqual(rangesFor(1).map((range) => range.hours), [0.167, 0.5, 1, 6, 12, 24])
assert.deepEqual(rangesFor(3).map((range) => range.hours), [0.167, 0.5, 1, 6, 12, 24, 48])
assert.deepEqual(rangesFor(2).map((range) => range.hours), [0.167, 0.5, 1, 6, 12, 24, 48])
assert.ok(rangesFor(365).every((range) => allowed.includes(range.hours)))
assert.ok(rangesFor(0).every((range) => allowed.includes(range.hours)))
assert.ok(rangesFor(-1).every((range) => allowed.includes(range.hours)))
assert.ok(rangesFor(Number.NaN).every((range) => allowed.includes(range.hours)))
console.log("CFSM history range allowlist: all passed")
