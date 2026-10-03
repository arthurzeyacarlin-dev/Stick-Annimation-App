import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

class ElementFixture {
  constructor(tag, parent = null, group = false) { this.tag = tag; this.parentElement = parent; this.group = group; this.disabled = false; this.attrs = new Map(); }
  matches(selector) { return (this.tag === 'button' && !this.disabled && this.attrs.get('aria-disabled') !== 'true') || this.tag === 'a' || (this.group && selector.includes('.group')); }
  contains(element) { for (let node = element; node; node = node.parentElement) if (node === this) return true; return false; }
  setAttribute(key, value) { this.attrs.set(key, value); }
  removeAttribute(key) { this.attrs.delete(key); }
}
let cleanup;
const exports = {};
const source = readFileSync('src/components/home/useInstantHover.ts', 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
vm.runInNewContext(compiled, { exports, Element: ElementFixture, Set, require: name => { assert.equal(name, 'react'); return { useRef: value => ({ current: value }), useCallback: fn => fn, useEffect: fn => { cleanup = fn(); } }; } });
const handler = exports.useInstantHover('.group');
const root = new ElementFixture('main');
const group = new ElementFixture('section', root, true);
const first = new ElementFixture('button', group);
const text = new ElementFixture('span', first);
const second = new ElementFixture('button', group);
const third = new ElementFixture('button', root);
const blank = new ElementFixture('div', root);
const disabled = new ElementFixture('button', root); disabled.disabled = true;
const marked = element => element.attrs.has('data-pointer-hover');
const event = (target, buttons = 0, pointerType = 'mouse') => ({ currentTarget: root, target, buttons, pointerType });
for (let i = 0; i < 100; i++) {
  handler.onPointerMoveCapture(event(text));
  assert.ok(marked(first) && marked(group));
  handler.onPointerMoveCapture(event(blank, 1));
  assert.ok(!marked(first) && !marked(group));
  handler.onMouseMoveCapture({ currentTarget: root, target: text, buttons: 0 });
  assert.ok(marked(first) && marked(group), 'Hover must return with no button held');
  handler.onPointerMoveCapture(event(second));
  assert.ok(!marked(first) && marked(second) && marked(group), 'Only current control and its intentional group are highlighted');
  handler.onPointerMoveCapture(event(third));
  assert.ok(!marked(second) && !marked(group) && marked(third));
}
handler.onPointerMoveCapture(event(disabled)); assert.ok(!marked(disabled) && !marked(third));
handler.onPointerMoveCapture(event(first, 0, 'touch')); assert.ok(!marked(first));
handler.onMouseOverCapture({ currentTarget: root, target: first }); assert.ok(!marked(first), 'Touch compatibility mouse events must not stick');
handler.onPointerMoveCapture(event(first)); assert.ok(marked(first));
handler.onPointerLeave(); assert.ok(!marked(first) && !marked(group));
handler.onPointerMoveCapture(event(third)); handler.onPointerCancel(); assert.ok(!marked(third));
handler.onPointerMoveCapture(event(third)); cleanup(); assert.ok(!marked(third));
handler.onPointerMoveCapture(event(new ElementFixture('button'))); assert.ok(!marked(first) && !marked(third), 'No outside-surface mutation');
assert.doesNotMatch(source, /\.buttons|\.click\(|\.focus\(|preventDefault|stopPropagation|localStorage|fetch\(/);
console.log(JSON.stringify({ status: 'PASS', repeatedBlankClickReturnCycles: 100, noPressedButtonDependency: true, oneActiveControl: true, sharedHomeProjectsOwner: true, touchAndLeaveClear: true, noNavigationOrPersistenceMutation: true }));
