"use client";

// SPEC-0029: the owner's testimonials (newest first). Approve or hide each one, fix the shown name, keep or drop the photo,
// then Export = wall-of-love.zip (testimonials.json + photos/) for the website's Wall of Love and for ads.
// THE KIDS RULE: only "can be featured" ones (13+ box ticked, 4-5 stars, words) can be approved or exported.
import { useCallback, useEffect, useState } from "react";
import { BackButton } from "@/src/components/ui/BackButton";
import { createStoredZip } from "@/src/lib/export/exportImages";
import { TESTIMONIAL_DISCLOSURE, type TestimonialStatus, type TestimonialSummary, type WallOfLoveEntry } from "@/src/lib/account/testimonials";
import styles from "@/src/components/support/ProblemReportsScreen.module.css";
import own from "./TestimonialsScreen.module.css";

type Row = TestimonialSummary & { photo: string | null };
type Filter = TestimonialStatus | "all";
const FILTERS: { value: Filter; label: string }[] = [
  { value: "new", label: "New" }, { value: "approved", label: "Approved" }, { value: "hidden", label: "Hidden" }, { value: "all", label: "All" },
];
const EMPTY: Record<Filter, string> = { new: "No new testimonials.", approved: "None approved yet.", hidden: "None hidden.", all: "No testimonials yet." };
const STATUS_WORDS: Record<TestimonialStatus, string> = { new: "New", approved: "Approved", hidden: "Hidden" };
const when = (time: number) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(time);
const starText = (n: number) => "★".repeat(n) + "☆".repeat(5 - n);

function photoFile(id: string, dataUrl: string): { name: string; data: Uint8Array } | null {
  const match = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  const binary = atob(match[2]);
  const data = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) data[i] = binary.charCodeAt(i);
  return { name: `photos/${id}.${match[1] === "jpeg" ? "jpg" : match[1]}`, data };
}

export function TestimonialsScreen() {
  const [filter, setFilter] = useState<Filter>("new");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [newCount, setNewCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [exportNote, setExportNote] = useState<string | null>(null);

  const load = useCallback(async (which: Filter) => {
    try {
      const response = await fetch(`/api/account/testimonials?status=${which}`, { cache: "no-store" });
      const body = await response.json().catch(() => null) as { schema?: string; testimonials?: Row[]; newCount?: number; error?: string } | null;
      if (!response.ok || body?.schema !== "diamond-testimonial-list/v1" || !Array.isArray(body.testimonials)) {
        throw new Error(typeof body?.error === "string" ? body.error : "Testimonials couldn't be loaded. Reload the page and try again.");
      }
      setRows(body.testimonials);
      setNewCount(typeof body.newCount === "number" ? body.newCount : 0);
      setError(null);
    } catch (problem) {
      setError(problem instanceof Error && problem.message ? problem.message : "Testimonials couldn't be loaded. Reload the page and try again.");
    }
  }, []);

  useEffect(() => {
    const first = window.setTimeout(() => void load(filter), 0);
    const onFocus = () => void load(filter);
    window.addEventListener("focus", onFocus);
    return () => { window.clearTimeout(first); window.removeEventListener("focus", onFocus); };
  }, [filter, load]);

  const change = async (row: Row, patch: { status?: TestimonialStatus; displayName?: string; usePhoto?: boolean }) => {
    setBusyId(row.id);
    setError(null);
    try {
      const response = await fetch("/api/account/testimonials", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: row.id, ...patch }) });
      const body = await response.json().catch(() => null) as { newCount?: number; error?: string } | null;
      if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : "That change couldn't be saved. Try again.");
      if (typeof body?.newCount === "number") setNewCount(body.newCount);
      setRows((current) => (current ?? []).flatMap((r) => {
        if (r.id !== row.id) return [r];
        const next = { ...r, ...patch };
        return filter === "all" || next.status === filter ? [next] : [];
      }));
    } catch (problem) {
      setError(problem instanceof Error && problem.message ? problem.message : "That change couldn't be saved. Try again.");
    }
    setBusyId(null);
  };

  const exportWall = async () => {
    setExportNote("Making the export…");
    try {
      const response = await fetch("/api/account/testimonials?export=1", { cache: "no-store" });
      const body = await response.json().catch(() => null) as { schema?: string; disclosureRule?: string; entries?: WallOfLoveEntry[]; error?: string } | null;
      if (!response.ok || body?.schema !== "diamond-wall-of-love/v1" || !Array.isArray(body.entries)) throw new Error(body?.error ?? "The export couldn't be made. Try again.");
      const files: { name: string; data: Uint8Array }[] = [];
      const entries = body.entries.map((entry) => {
        const file = entry.photo ? photoFile(entry.id, entry.photo) : null;
        if (file) files.push(file);
        return { ...entry, photo: file ? file.name : null };
      });
      // Nov 26: the disclosure rule travels with the quotes, so the website wall and every ad keep the "free credits" note
      const json = JSON.stringify({ schema: "diamond-wall-of-love/v1", exportedAt: new Date().toISOString(), disclosureRule: body.disclosureRule ?? null, entries }, null, 2);
      files.unshift({ name: "testimonials.json", data: new TextEncoder().encode(json) });
      const zip = createStoredZip(files);
      const url = URL.createObjectURL(new Blob([zip.slice().buffer], { type: "application/zip" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "wall-of-love.zip";
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setExportNote(`Downloaded wall-of-love.zip: ${entries.length} testimonial${entries.length === 1 ? "" : "s"}, ${files.length - 1} photo${files.length - 1 === 1 ? "" : "s"}.`);
    } catch (problem) {
      setExportNote(problem instanceof Error && problem.message ? problem.message : "The export couldn't be made. Try again.");
    }
  };

  return (
    <main className={styles.main}>
      <div className={styles.frame}>
        <BackButton href="/">Back to Home</BackButton>
        <p className={styles.eyebrow}>Diamond Animator</p>
        <h1 className={styles.title}>Testimonials</h1>
        <p className={styles.lead}>
          {newCount === 0 ? "No new testimonials." : `${newCount} new testimonial${newCount === 1 ? "" : "s"}.`} Only you can see this page.
          {" "}Only people who ticked &ldquo;I&apos;m 13 or older&rdquo; and gave 4 or 5 stars can be approved; check each photo is not a young child.
        </p>
        <div className={own.top}>
          <div className={styles.segmented} role="group" aria-label="Show testimonials">
            {FILTERS.map((option) => (
              <button key={option.value} type="button" aria-pressed={filter === option.value} onClick={() => { setFilter(option.value); setRows(null); }}>{option.label}</button>
            ))}
          </div>
          <button type="button" className={styles.button} onClick={() => void exportWall()}>Export Wall of Love</button>
        </div>
        {exportNote && <p role="status" className={styles.muted}>{exportNote}</p>}

        {error && <p role="alert" className={styles.error}>{error}</p>}
        {rows === null && !error && <p className={styles.muted}>Loading testimonials</p>}
        {rows && rows.length === 0 && <p className={styles.muted}>{EMPTY[filter]}</p>}

        {rows && rows.length > 0 && (
          <ul className={styles.list}>
            {rows.map((row) => (
              <li key={row.id} className={styles.report}>
                <div className={styles.meta}>
                  <span className={styles.who}><strong>{row.userName || row.userEmail}</strong>{row.userName && <span className={styles.email}>{row.userEmail}</span>}</span>
                  <span className={styles.details}>
                    <time dateTime={new Date(row.createdAt).toISOString()}>{when(row.createdAt)}</time>
                    <span aria-hidden="true">·</span><span>{row.where === "export" ? "After an export" : "After an animation"}</span>
                    <span aria-hidden="true">·</span><span className={row.status === "new" ? styles.statusNew : undefined}>{STATUS_WORDS[row.status]}</span>
                  </span>
                </div>
                <div className={own.body}>
                  {row.featurable && (row.photo && row.usePhoto
                    // eslint-disable-next-line @next/next/no-img-element -- owner-only profile picture (a data URL)
                    ? <img src={row.photo} alt="" className={own.photo} />
                    : <span className={own.photo} aria-hidden="true">{(row.displayName[0] ?? "?").toUpperCase()}</span>)}
                  <div className={own.words}>
                    <span className={own.stars} aria-label={`${row.stars} of 5 stars`}>{starText(row.stars)}</span>
                    <p className={styles.text}>{row.text || <em>(no words)</em>}</p>
                    <span className={row.featurable ? own.ok : own.private}>
                      {row.featurable ? "Can be featured (13+ box ticked)" : !row.featureOk ? "Private: the 13+ box was not ticked — never shown" : row.stars < 4 ? "Private: under 4 stars" : "Private: no words to quote"}
                    </span>
                    {row.creditsGiven > 0 && <span className={own.private}>Got {row.creditsGiven} free credits as a thank-you · shown with the quote: “{TESTIMONIAL_DISCLOSURE}”</span>}
                  </div>
                </div>
                {row.featurable && (
                  <div className={styles.actions}>
                    <label className={own.nameField}>Shown as
                      <input value={names[row.id] ?? row.displayName} maxLength={40} onChange={(e) => setNames((n) => ({ ...n, [row.id]: e.target.value }))} />
                    </label>
                    {(names[row.id] ?? row.displayName) !== row.displayName && (
                      <button type="button" className={styles.button} disabled={busyId === row.id} onClick={() => void change(row, { displayName: names[row.id] })}>Save name</button>
                    )}
                    {row.photo && (
                      <button type="button" className={styles.button} disabled={busyId === row.id} onClick={() => void change(row, { usePhoto: !row.usePhoto })}>{row.usePhoto ? "Don't use the photo" : "Use the photo"}</button>
                    )}
                  </div>
                )}
                <div className={styles.actions}>
                  {row.featurable && row.status !== "approved" && <button type="button" className={styles.button} disabled={busyId === row.id} onClick={() => void change(row, { status: "approved" })}>Approve</button>}
                  {row.status !== "hidden" && <button type="button" className={styles.button} disabled={busyId === row.id} onClick={() => void change(row, { status: "hidden" })}>Hide</button>}
                  {row.status !== "new" && <button type="button" className={styles.button} disabled={busyId === row.id} onClick={() => void change(row, { status: "new" })}>Back to new</button>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
