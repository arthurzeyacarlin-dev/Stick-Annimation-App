import "server-only";

// The account data store (assistant sessions, notifications, …) behind
// /api/account/data. Logic lives in accountDataStore.ts so tests can load it;
// this file keeps the "server-only" guard for app imports.
export * from "./accountDataStore.ts";
