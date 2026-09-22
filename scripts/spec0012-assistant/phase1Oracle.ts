import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import ts from "typescript";

const base = "f2bda33842a3f5a4b560a7d3aab170a6ca4c2fd0";
const component = "src/components/assistant/DiamondAssistantScreen.tsx";
const route = "app/assistant/page.tsx";
const assertions: string[] = [];
const check = (value: unknown, label: string) => { assert.ok(value, label); assertions.push(label); };
const equal = (a: unknown, b: unknown, label: string) => { assert.deepEqual(a, b, label); assertions.push(label); };
const sources = [component, route].map(path => ({ path, text: readFileSync(path, "utf8") }));
const allowedImports = new Set(["next", "next/link", "react", "./diamondAssistant.module.css", "@/src/components/assistant/DiamondAssistantScreen"]);
const imports: Array<{ path: string; dependency: string }> = [];
for (const source of sources) {
  const ast = ts.createSourceFile(source.path, source.text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node)) {
      const dependency = (node.moduleSpecifier as ts.StringLiteral).text;
      check(allowedImports.has(dependency), `${source.path}: isolated dependency ${dependency}`);
      imports.push({ path: source.path, dependency });
    }
    if (ts.isCallExpression(node)) {
      const name = node.expression.getText(ast);
      check(!/fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|Storage|indexedDB|caches|mediaDevices|AudioContext|Worker|import\(/i.test(name), `${source.path}: local-only call ${name}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  check(!/localStorage|sessionStorage|indexedDB|navigator\.|\/api\/|useRouter/.test(source.text), `${source.path}: no persistent, permission, provider or project navigation owner`);
}
const screen = sources[0].text;
equal([...screen.matchAll(/<option value="([^"]+)">([^<]+)<\/option>/g)].map(match => [match[1], match[2]]), [["low", "Low"], ["medium", "Medium"], ["high", "High"], ["xhigh", "Extra High"]], "four exact reasoning choices and mappings");
check(screen.includes('useState("medium")'), "blank screen defaults Medium");
check(screen.includes("!event.nativeEvent.isComposing"), "IME Enter does not prematurely submit");
check(screen.includes("event.preventDefault(); sendPreview();"), "native form submission cannot issue a request");
check(screen.includes('maxLength={12000}'), "draft is bounded to 12000 characters");
check(screen.includes('rows={2}'), "composer uses the corrected shorter two-row draft field");
check(screen.includes('href="/#ai-assistant" prefetch={false}'), "Home navigation has explicit focus target without prefetch");
check(screen.includes('<path d="M3 9l4-5h10l4 5-9 11L3 9z" />'), "Assistant reuses the exact Home AppChrome diamond geometry");
check(screen.includes('strokeWidth="2.7"') && screen.includes('strokeLinecap="round"') && screen.includes('strokeLinejoin="round"'), "Assistant reuses the exact Home AppChrome diamond stroke treatment");
check(screen.includes('<h1 aria-label="How can I help you with Diamond Animator today?">'), "greeting keeps the exact sentence as one accessible heading name");
check(screen.includes("<span>How can I help you with</span>") && screen.includes("<span>Diamond Animator today?</span>"), "greeting uses the exact intentional two-line visual composition");
check(screen.includes("const SIDEBAR_MIN_WIDTH = 200;") && screen.includes("const SIDEBAR_DEFAULT_WIDTH = 256;") && screen.includes("const SIDEBAR_MAX_WIDTH = 440;"), "desktop sidebar uses exact 200/256/440 pixel bounds");
check(screen.includes("const SIDEBAR_MIN_MAIN_WIDTH = 560;") && screen.includes("screenWidth - SIDEBAR_MIN_MAIN_WIDTH"), "sidebar maximum preserves a 560 pixel conversation area");
check(screen.includes('role="separator"') && screen.includes('aria-orientation="vertical"') && screen.includes('aria-controls="assistant-conversation-main"'), "sidebar divider exposes vertical separator semantics");
for (const attribute of ["aria-valuemin={SIDEBAR_MIN_WIDTH}", "aria-valuemax={sidebarMaxWidth}", "aria-valuenow={sidebarWidth}", "aria-valuetext={`${sidebarWidth} pixels`}"]) check(screen.includes(attribute), `sidebar divider exposes ${attribute}`);
for (const handler of ["onPointerDown={startSidebarResize}", "onPointerMove={moveSidebarResize}", "onPointerUp={endSidebarResize}", "onPointerCancel={endSidebarResize}", "onLostPointerCapture={endSidebarResize}", "onKeyDown={resizeSidebarWithKeyboard}"]) check(screen.includes(handler), `sidebar divider owns ${handler}`);
check(screen.includes('event.key === "ArrowLeft"') && screen.includes('event.key === "ArrowRight"') && screen.includes('event.key === "Home"') && screen.includes('event.key === "End"'), "sidebar divider supports bounded keyboard resizing");
check(screen.includes("document.body.style.userSelect = \"none\"") && screen.includes("document.body.style.userSelect = previousUserSelect"), "active resize prevents and safely restores text selection");
for (const removed of ["Every great animation", "DIAMOND ANIMATOR ASSISTANT", "Hi, I’m your Diamond Animator Assistant.", "A place to find your way", "Preview · Answers coming soon", "headerPreview"]) {
  check(!screen.includes(removed), `rejected greeting element removed: ${removed}`);
}
const home = readFileSync("app/page.tsx", "utf8");
check(home.includes('onClick={() => router.push("/assistant")}'), "Home activates dedicated route");
check(home.includes('view !== "home" || startupRecovery.kind !== "home" || welcomeOpen'), "return focus waits for recovery and welcome gates");
const css = readFileSync("src/components/assistant/diamondAssistant.module.css", "utf8");
const cssBlock = (selector: string) => css.match(new RegExp(`\\.${selector} \\{([^}]*)\\}`))?.[1] ?? "";
check(css.includes("prefers-reduced-motion: reduce") && css.includes("forced-colors: active"), "Assistant-only accessibility media rules");
check(!/^\s*(body|html|:root)\b/m.test(css), "no global body/html styling changes");
check(css.includes(".composer textarea:focus, .composer textarea:focus-visible { outline: none; }"), "inner textarea focus box is explicitly removed");
check(!css.includes(":is(button, a, select, textarea, section):focus-visible"), "textarea is excluded from the shared square focus outline");
check(css.includes(".composer:focus-within { border-color: var(--assistant-focus)"), "rounded composer owns the visible focus treatment");
check(cssBlock("brandMark").includes("color: #ffffff;") && !cssBlock("brandMark").includes("opacity:"), "sidebar brand diamond is solid white");
check(cssBlock("heroMark").includes("color: #ffffff;") && cssBlock("heroMark").includes("opacity: .28;"), "hero diamond is translucent white");
check(cssBlock("heroMark").includes("filter: drop-shadow(0 14px 30px rgba(64, 142, 255, .12));") && css.includes("rgba(64, 142, 255, .055)"), "hero diamond and main glow remain intentionally subtle blue");
check(css.includes(".greeting h1 > span { display: block; text-wrap: wrap; }"), "greeting visual lines are explicit and add compact wrapping only when required");
check(css.includes("grid-template-columns: var(--assistant-sidebar-width) minmax(0, 1fr)") && css.includes("--assistant-sidebar-width: 256px"), "desktop grid uses the default-width sidebar variable");
check(cssBlock("sidebarResizer").includes("width: 16px;") && cssBlock("sidebarResizer").includes("background: transparent;") && cssBlock("sidebarResizer").includes("touch-action: none;"), "divider has a comfortable invisible pointer target");
check(css.includes('.sidebarResizer[data-resizing="true"]::before') && css.includes("background: #62a6ff;") && css.includes("box-shadow: 0 0 10px rgba(64, 142, 255, .48);"), "divider turns cool blue only for interaction states");
check(css.includes('.screen[data-sidebar-resizing="true"] *') && css.includes("user-select: none !important;"), "dragging suppresses accidental selection across the shell");
check(css.includes("grid-template-rows: auto minmax(0, 1fr)") && css.includes(".sidebarResizer { display: none; }"), "responsive top strip remains explicit and has no resize handle");
const families = ["AGENTS.md", "docs", "project/project_structure.txt", "package.json", "package-lock.json", "app/api", "app/layout.tsx", "app/globals.css", "app/ScrollbarActivity.tsx", "src/lib", "src/components/workspace", "src/components/export", "src/components/recovery", "src/components/project-library", "src/components/project-player", "src/components/open-project", "src/components/tutorials"];
equal(execFileSync("git", ["diff", "--name-only", base, "--", ...families], { encoding: "utf8" }).trim(), "", "all protected runtime and control-plane families are byte unchanged");
console.log(JSON.stringify({ status: "PASS", assertions, imports, protectedFamilies: families }));
