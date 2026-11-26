// (Dad, Nov 26) the inbox rules behind "one free trial per real inbox". Run: node --test src/lib/account/inbox.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { inboxHash, isConfirmCodeShape, isDisposableEmail, normalizeInbox, parseInboxList } from "./inbox.ts";

test("the real inbox: lowercase, no +tag, Gmail without dots, googlemail = gmail", () => {
  assert.equal(normalizeInbox("  Anna.Smith+Test1@Gmail.com "), "annasmith@gmail.com");
  assert.equal(normalizeInbox("a.n.n.a.smith@googlemail.com"), "annasmith@gmail.com");
  assert.equal(normalizeInbox("anna.smith+x+y@outlook.com"), "anna.smith@outlook.com", "dots count outside Gmail");
  assert.equal(normalizeInbox("dad+test2@icloud.com"), "dad@icloud.com");
  for (const bad of ["", "no-at-sign", "@gmail.com", "x@", "x@nodot", "+tag@gmail.com", 42, null]) assert.equal(normalizeInbox(bad), null, String(bad));
});

test("throwaway domains (and their subdomains) are caught; real providers never", () => {
  for (const email of ["a@mailinator.com", "a@MX.Mailinator.com", "a@guerrillamail.com", "a@yopmail.com", "a@10minutemail.com", "a@sharklasers.com", "a@temp-mail.org"]) assert.ok(isDisposableEmail(email), email);
  for (const email of ["a@gmail.com", "a@outlook.com", "a@yahoo.com", "a@icloud.com", "a@proton.me", "a@hotmail.com", "a@school.k12.ca.us"]) assert.ok(!isDisposableEmail(email), email);
  assert.ok(isDisposableEmail("a@new-temp.io", ["new-temp.io"]), "the owner's own additions");
});

test("the fingerprint is salted, the same for the same inbox, and never the address", () => {
  const a = inboxHash("anna@gmail.com", "salt-1");
  assert.equal(a, inboxHash("anna@gmail.com", "salt-1"));
  assert.notEqual(a, inboxHash("anna@gmail.com", "salt-2"));
  assert.ok(!a.includes("anna") && /^[0-9a-f]{64}$/.test(a));
});

test("the owner's list and the code shape", () => {
  assert.deepEqual(parseInboxList("Dad@Gmail.com, mom+x@icloud.com;  nope"), ["dad@gmail.com", "mom@icloud.com"]);
  assert.deepEqual(parseInboxList(undefined), []);
  assert.ok(isConfirmCodeShape("012345") && isConfirmCodeShape(" 999999 "));
  assert.ok(!isConfirmCodeShape("12345") && !isConfirmCodeShape("12a456") && !isConfirmCodeShape(123456));
});
