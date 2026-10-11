// SPEC-0020 Phase 6: "Report a Problem" rules — what a report may contain, 5 per hour, who the owner is,
// and the owner's bell notification. Run: node --test src/lib/account/problemReports.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { isOwnerEmail, OWNER_EMAILS } from "./owner.ts";
import {
  checkProblemReportInput, checkProblemReportRateLimit, checkProblemReportScreenshot, isProblemReportId, problemReportExcerpt,
  problemReportReporterName, PROBLEM_REPORT_RATE_WINDOW_MS, PROBLEM_REPORT_SCREENSHOT_MAX_BYTES, PROBLEM_REPORT_TEXT_MAX,
} from "./problemReports.ts";
import { createNotificationEnvelopeFromTerminalV1, validateNotificationEnvelopeV1 } from "../notifications/notificationContracts.ts";
import { notificationToneV1 } from "../notifications/notificationTone.ts";

const JPEG = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1]).toString("base64")}`;
const PNG = `data:image/png;base64,${Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]).toString("base64")}`;
const WEBP = `data:image/webp;base64,${Buffer.from("RIFF\u0000\u0000\u0000\u0000WEBPVP8 ", "latin1").toString("base64")}`;

test("a good report passes and its text is cleaned", () => {
  const result = checkProblemReportInput({ text: "  The brush\r\nstopped drawing\u0007  ", screen: "editor", screenshot: null });
  assert.deepEqual(result, { ok: true, value: { text: "The brush\nstopped drawing", screen: "editor", screenshot: null } });
});

test("empty text, unknown screen and too-long text are refused with plain words", () => {
  for (const body of [null, "text", [], {}, { text: "   ", screen: "home" }, { text: 5, screen: "home" }]) {
    const result = checkProblemReportInput(body);
    assert.equal(result.ok, false);
  }
  assert.deepEqual(checkProblemReportInput({ text: "   ", screen: "home" }), { ok: false, message: "Please tell us what happened." });
  assert.deepEqual(checkProblemReportInput({ text: "Broken", screen: "kitchen" }), { ok: false, message: "Please choose where you were." });
  const long = checkProblemReportInput({ text: "a".repeat(PROBLEM_REPORT_TEXT_MAX + 1), screen: "home" });
  assert.equal(long.ok, false);
  assert.ok(!long.ok && /2,000 characters/.test(long.message));
  assert.equal(checkProblemReportInput({ text: "a".repeat(PROBLEM_REPORT_TEXT_MAX), screen: "home" }).ok, true);
  for (const result of [checkProblemReportInput({}), checkProblemReportInput({ text: "x", screen: "home", screenshot: 7 })]) {
    assert.ok(!result.ok && !/[a-z]+_[a-z]+/.test(result.message), "messages are words, never codes");
  }
});

test("screenshots must really be small PNG/JPEG/WebP pictures", () => {
  assert.deepEqual(checkProblemReportScreenshot(JPEG), { ok: true, value: JPEG });
  assert.deepEqual(checkProblemReportScreenshot(PNG), { ok: true, value: PNG });
  assert.deepEqual(checkProblemReportScreenshot(WEBP), { ok: true, value: WEBP });
  assert.deepEqual(checkProblemReportScreenshot(undefined), { ok: true, value: null });
  // Says JPEG but is really a PNG; an SVG; a web page; plain text.
  assert.equal(checkProblemReportScreenshot(PNG.replace("image/png", "image/jpeg")).ok, false);
  assert.equal(checkProblemReportScreenshot("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=").ok, false);
  assert.equal(checkProblemReportScreenshot(`data:text/html;base64,${Buffer.from("<script>").toString("base64")}`).ok, false);
  assert.equal(checkProblemReportScreenshot("not a picture").ok, false);
  const big = `data:image/jpeg;base64,${Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(PROBLEM_REPORT_SCREENSHOT_MAX_BYTES)]).toString("base64")}`;
  assert.deepEqual(checkProblemReportScreenshot(big), { ok: false, message: "The screenshot is too big. Try a smaller picture." });
  assert.equal(checkProblemReportInput({ text: "Look", screen: "export", screenshot: JPEG }).ok, true);
});

test("at most 5 reports per person per hour", () => {
  const now = Date.UTC(2026, 9, 11, 12);
  const minutesAgo = (minutes: number) => now - minutes * 60_000;
  assert.deepEqual(checkProblemReportRateLimit([], now), { ok: true, left: 4 });
  assert.deepEqual(checkProblemReportRateLimit([1, 2, 3, 4].map(minutesAgo), now), { ok: true, left: 0 });
  const blocked = checkProblemReportRateLimit([50, 40, 30, 20, 10].map(minutesAgo), now);
  assert.equal(blocked.ok, false);
  // The report from 50 minutes ago leaves the hour in 10 minutes.
  assert.ok(!blocked.ok && blocked.retryInMinutes === 10 && blocked.message.includes("wait 10 minutes"));
  // Reports older than an hour don't count.
  assert.equal(checkProblemReportRateLimit([61, 70, 80, 90, 100, 5].map(minutesAgo), now).ok, true);
  assert.equal(checkProblemReportRateLimit([now - PROBLEM_REPORT_RATE_WINDOW_MS, ...[1, 2, 3, 4].map(minutesAgo)], now).ok, true);
});

test("only the owner's email opens the inbox", () => {
  assert.deepEqual(OWNER_EMAILS, ["arthurzeyacarlin@gmail.com"]);
  assert.equal(isOwnerEmail("arthurzeyacarlin@gmail.com"), true);
  assert.equal(isOwnerEmail("  ArthurZeyaCarlin@Gmail.com "), true);
  for (const email of ["someone@example.com", "arthurzeyacarlin@gmail.com.evil.com", "", null, undefined, 42]) assert.equal(isOwnerEmail(email), false);
  assert.equal(isOwnerEmail("x@y.z", []), false);
});

test("bell text: name + first 60 characters", () => {
  assert.equal(problemReportExcerpt("short one"), "short one");
  const excerpt = problemReportExcerpt(`${"word ".repeat(30)}\n\nend`);
  assert.ok(excerpt.endsWith("…") && Array.from(excerpt).length <= 61 && !excerpt.includes("\n"));
  assert.equal(problemReportReporterName("  Sam \n Lee ", "sam@example.com"), "Sam Lee");
  assert.equal(problemReportReporterName("", "sam@example.com"), "sam@example.com");
  assert.equal(problemReportReporterName(null, null), "Someone");
  assert.equal(isProblemReportId("pr_0123456789abcdef0123456789abcdef"), true);
  assert.equal(isProblemReportId("../../etc"), false);
});

test("the owner's bell notification is a blue 'news' item that opens the reports", async () => {
  const reportedAt = Date.now() - 1000;
  const envelope = await createNotificationEnvelopeFromTerminalV1({
    schema: "problem-report-notification-terminal/v1",
    reportId: "pr_0123456789abcdef0123456789abcdef",
    reporterName: problemReportReporterName("Sam", "sam@example.com"),
    excerpt: problemReportExcerpt("The export button does nothing when I click it on a long project with many layers"),
    reportedAt,
  }, null);
  await validateNotificationEnvelopeV1(envelope);
  assert.equal(envelope.notification.title, "New problem report");
  assert.match(envelope.notification.body, /^New problem report from Sam: The export button does nothing.*…$/);
  assert.deepEqual(envelope.notification.target, { kind: "problem-reports", reportId: "pr_0123456789abcdef0123456789abcdef" });
  assert.equal(notificationToneV1(envelope.notification), "news");
  await assert.rejects(createNotificationEnvelopeFromTerminalV1({
    schema: "problem-report-notification-terminal/v1", reportId: "bad", reporterName: "Sam", excerpt: "x", reportedAt,
  }, null));
});
