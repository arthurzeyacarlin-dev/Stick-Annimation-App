# SPEC-0026 — Select a drawing and a symbol together (plan)

Status: PLAN, waiting for Arthur's OK (2026-10-17). Written by PM4. Build in a NEW app copy; never touch main until Arthur passes.

## What Arthur wants
- Drag a box (Select tool, also Lasso) around a drawing that has a symbol on it: both are selected.
- Move, delete, copy and paste them as one. One Undo step each.
- A selected symbol and a selected drawing look the same (done in D-0210).

## Why it is not simple (facts from the code)
- Drawing pixels and symbols are two systems. Pixel selections live in `BitmapSelectionSession` (world px, `DrawingCanvas.tsx`); symbols are `UnifiedSymbolInstanceItemV2` in the 1920x1080 stage (`unifiedSymbolInstances`, SVG layer above the canvas, own drag code `beginUnifiedSymbolGesture`).
- Converting between them uses `getUnifiedStagePresentation()` (scale + offset) and each symbol's `viewScale`.
- Today a symbol move is saved straight to the project (`onUnifiedSymbolInstancesChange`); a pixel selection stays floating until it is put down. One Undo for both needs one combined history entry.

## Plan
1. Companions: when a Select / Lasso selection is made, find the symbols on this frame whose centre is inside the selected area (world → stage). Keep their ids in the session (`companionSymbolIds`). No companions = nothing changes (old behavior exactly).
2. Look: companion symbols show the same selected frame and handles as the drawing.
3. Move: dragging the selection moves the pixels (existing code) and shows the companion symbols moving by the same distance (stage delta = world delta / scale / viewScale). Several symbols need a draft list instead of the single `draftUnifiedSymbolInstance`.
4. Put down: one history entry saves the new pixel position and the new symbol positions together.
5. Delete: removes pixels and companion symbols (one Undo). Duplicate / Copy / Paste: the clipboard holds the symbol clones (new item ids) as well; paste on any frame puts both.
6. Edge cases to handle and test: symbol half inside the box (rule: centre inside), rotated / flipped symbols, held frames (symbol owned by the first frame of a hold), zoomed canvas, resize handles (v1: companions follow move and delete only; resize stays pixels-only and is blocked while companions exist, with a plain message).

## Not in this plan
- Resizing or rotating drawing + symbols together (later).
- Text objects as companions (text already works in selections).

## Tests (must all pass before Arthur reviews)
- New sweep checks: select drawing + symbol, move (both moved by the same amount), Undo (both back, one step), Delete (both gone, one Undo), Copy → another frame → Paste (both appear), save and reopen.
- Re-run `scripts/regression-sweep.mjs` (15) and `scripts/regression-sweep-2.mjs` (7): all 22 must still pass.
- Type check, lint 0 errors, unit tests.

## Risk and size
- Touches the selection engine in `DrawingCanvas.tsx` (about 300 selection references) and one prop in `DrawingWorkspace.tsx`. Medium-high risk, so: new copy, small steps, sweeps after every step.
- Estimate: 4 steps (companions + look, move, delete / duplicate, copy / paste), each tested before the next.

## Questions for Arthur
1. A symbol counts as "in the box" when its centre is inside the box (my recommendation), or when it touches the box at all?
2. OK that resizing is drawing-only for now?
