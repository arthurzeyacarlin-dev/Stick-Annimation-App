// SPEC-0020 Phase 3: notification colors. Run: node --test src/lib/notifications/notificationTone.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { countNotificationTonesV1, notificationToneV1 } from "./notificationTone.ts";

test("good, bad and news notifications get green, red and blue", () => {
  assert.equal(notificationToneV1({ eventType: "workspace.terra.reply.completed", outcome: "completed" }), "good");
  assert.equal(notificationToneV1({ eventType: "export.completed", outcome: "completed" }), "good");
  assert.equal(notificationToneV1({ eventType: "system.internet.restored", outcome: "completed" }), "good");
  assert.equal(notificationToneV1({ eventType: "system.internet.offline", outcome: "warning" }), "bad");
  assert.equal(notificationToneV1({ eventType: "export.failed", outcome: "failed" }), "bad");
  assert.equal(notificationToneV1({ eventType: "app.update.available", outcome: "completed" }), "news");
});

test("counts per color (internet lost + restored + 2 updates)", () => {
  assert.deepEqual(countNotificationTonesV1([
    { eventType: "system.internet.offline", outcome: "warning" },
    { eventType: "system.internet.restored", outcome: "completed" },
    { eventType: "app.update.available", outcome: "completed" },
    { eventType: "app.update.available", outcome: "completed" },
  ]), { news: 2, bad: 1, good: 1 });
});
