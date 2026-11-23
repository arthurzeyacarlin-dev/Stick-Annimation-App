import assert from "node:assert/strict";
import test from "node:test";
import { aiProjectName, isUnnamedProject } from "./aiProjectName.ts";

test("a new project's default names count as unnamed; his own names never do", () => {
  for (const t of ["Untitled Project", "untitled project 2", "Unnamed drawing project", "", "  "]) assert.equal(isUnnamedProject(t), true, t);
  for (const t of ["My dog film", "Untitled Project about cats", "Kickflip"]) assert.equal(isUnnamedProject(t), false, t);
});

test("his words become a short title", () => {
  assert.equal(aiProjectName("make an animation of a dog chasing a cat."), "A dog chasing a cat");
  assert.equal(aiProjectName("a skateboarder rolls in, does a kickflip and rides away"), "A skateboarder rolls in, does a kickflip and rides away");
  assert.equal(aiProjectName("Please animate a stick figure doing a backflip! Then he waves."), "A stick figure doing a backflip");
  assert.equal(aiProjectName("can you make a short video where two knights sword fight"), "Two knights sword fight");
  assert.equal(aiProjectName("a chef flips a pancake so high it lands on his head and then the dog eats it off the floor"), "A chef flips a pancake so high it lands on his head");
});

test("nothing usable gives no name", () => {
  for (const t of ["", "   ", "...", null, undefined, "make an animation of"]) assert.equal(aiProjectName(t), null, String(t));
});
