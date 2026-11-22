// What the top bar's save status says after an account save (Save, Save and Exit, quiet save).
//
// Arthur (SPEC-0017 round 8): "If it says not saved even though it's clearly saved, then it
// should say saved." The project is saved when the account save succeeded and nothing was edited
// while it ran. Clearing the local safety backup afterwards is separate housekeeping (it has its
// own status, and Save and Exit still waits for it); it is never a reason to say "Unsaved changes".
export type AccountSaveOutcomeV1 = {
  officialWriteSucceeded: boolean;
  coversCurrentGeneration: boolean;
  recoveryDraftCleared: boolean;
};

export const accountSaveStatusV1 = (outcome: AccountSaveOutcomeV1): "saved" | "unsaved" =>
  outcome.officialWriteSucceeded && outcome.coversCurrentGeneration ? "saved" : "unsaved";

// (Nov 14) How long each step of a save took, readable in the page afterwards (nothing is printed):
// performance.getEntriesByType("measure") lists "save:previews" (the frames' small preview pictures), "save:snapshot"
// (the project put together), "save:pictures" (pictures fingerprinted, packed, kept in the browser) and "save:send".
export const measureSaveStepV1 = (step: "previews" | "snapshot" | "pictures" | "send", startedAt: number) => {
  try { performance.measure(`save:${step}`, { start: startedAt, end: performance.now() }); } catch { /* measuring never breaks a save */ }
};
