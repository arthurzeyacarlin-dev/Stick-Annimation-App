import assert from "node:assert/strict";
import { test } from "node:test";
import { openedHiddenLayerIdsV1, savedHiddenLayerIdsV1 } from "./editorHiddenLayersV1.ts";

test("hidden layers are saved by their document ids, in layer order", () => {
  assert.deepEqual(savedHiddenLayerIdsV1(["d1", "d2", "d3"], ["a", "layer-2", "layer-3"], ["layer-3", "a"]), ["d1", "d3"]);
  assert.deepEqual(savedHiddenLayerIdsV1(["d1", "d2"], ["a", "layer-2"], []), []);
  // A hidden layer that was deleted is simply not saved.
  assert.deepEqual(savedHiddenLayerIdsV1(["d1"], ["a"], ["layer-9"]), []);
});

test("save then reopen gives back the same hidden layers", () => {
  const saved = savedHiddenLayerIdsV1(["d1", "d2", "d3"], ["a", "layer-2", "layer-3"], ["layer-2"]);
  assert.deepEqual(openedHiddenLayerIdsV1(saved, ["d1", "d2", "d3"], ["a", "layer-2", "layer-3"]), ["layer-2"]);
});

test("old projects (no list) and broken lists open with every layer showing", () => {
  assert.deepEqual(openedHiddenLayerIdsV1(undefined, ["d1"], ["a"]), []);
  assert.deepEqual(openedHiddenLayerIdsV1("d1", ["d1"], ["a"]), []);
  assert.deepEqual(openedHiddenLayerIdsV1(["d1"], ["d1", "d2"], ["a"]), []);
  assert.deepEqual(openedHiddenLayerIdsV1([7, "d2"], ["d1", "d2"], ["a", "b"]), ["b"]);
});
