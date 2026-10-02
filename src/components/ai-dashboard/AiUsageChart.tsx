"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { TEST_WEEKLY_TOKENS, type DashboardBucket, type DashboardFilter } from "../../lib/ai-dashboard/dashboardContract";
import styles from "./AiDashboard.module.css";

const number = (value: number) => value.toLocaleString("en-US");
const signedNumber = (value: number) => `${value > 0 ? "+" : ""}${number(value)}`;
const time = (value: number) => new Date(value).toISOString().replace(".000Z", "Z");
const localRange = (start: number, end: number) => {
  const first = new Date(start);
  const last = new Date(end);
  const clock = (date: Date) => date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (first.toDateString() === last.toDateString()) return `${clock(first)}–${clock(last)}`;
  return `${first.toLocaleDateString()} ${clock(first)}–${last.toLocaleDateString()} ${clock(last)}`;
};
const sourceName: Record<DashboardFilter, string> = {
  combined: "Combined", project: "Project AI", assistant: "Assistant",
};

export function AiUsageChart({ buckets, filter, complete, capacity }: { buckets: DashboardBucket[]; filter: DashboardFilter; complete: boolean; capacity: number }) {
  type ActiveBar = { index: number; left: number; centerY: number; mode: "hover" | "focus" | "touch" };
  const [active, setActive] = useState<ActiveBar | null>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const positionFor = (index: number, bar: HTMLElement, mode: ActiveBar["mode"]): ActiveBar | null => {
    const plot = plotRef.current;
    if (!plot) return null;
    const plotRect = plot.getBoundingClientRect();
    const barRect = bar.getBoundingClientRect();
    const scale = plotRect.width / plot.clientWidth || 1;
    const barLeft = (barRect.left - plotRect.left) / scale;
    const barRight = (barRect.right - plotRect.left) / scale;
    const width = Math.min(218, plot.clientWidth - 12);
    const gap = 10;
    const left = barRight + gap + width <= plot.clientWidth - 6 ? barRight + gap :
      barLeft - gap - width >= 6 ? barLeft - gap - width :
        Math.max(6, Math.min(plot.clientWidth - width - 6, barLeft + (barRight - barLeft - width) / 2));
    const centerY = (barRect.top - plotRect.top + barRect.height / 2) / scale;
    return { index, left, centerY, mode };
  };
  const show = (index: number, bar: HTMLElement, mode: ActiveBar["mode"]) => {
    const next = positionFor(index, bar, mode);
    if (next) setActive(next);
  };
  const hide = (index: number, mode: ActiveBar["mode"]) => {
    setActive((current) => current?.index === index && current.mode === mode ? null : current);
  };
  useLayoutEffect(() => {
    if (!active || !tooltipRef.current || !plotRef.current) return;
    const tooltip = tooltipRef.current;
    const plot = plotRef.current;
    const top = Math.max(6, Math.min(plot.clientHeight - tooltip.offsetHeight - 6, active.centerY - tooltip.offsetHeight / 2));
    tooltip.style.top = `${top}px`;
  }, [active]);
  const intervalChange = (index: number) => index === 0 || buckets[index].firstInWeek ? null :
    buckets[index].intervalSelectedTokens - buckets[index - 1].intervalSelectedTokens;
  const detail = active ? buckets[active.index] : null;
  const detailChange = active ? intervalChange(active.index) : null;
  return (
    <div className={styles.chartArea} aria-label={`${sourceName[filter]} weekly test preview chart`}>
      <div className={styles.thresholdLegend} aria-label="Test preview thresholds">
        <span><i className={styles.roofKey} aria-hidden="true" />0% remaining — TEST PREVIEW exhausted</span>
        <span><i className={styles.warningKey} aria-hidden="true" />10% remaining — shared TEST PREVIEW</span>
      </div>
      <div className={styles.plotWrap} ref={plotRef}
        onPointerDown={(event) => {
          if (event.pointerType === "touch" && !(event.target as HTMLElement).closest("[data-testid='usage-bar']")) setActive(null);
        }}>
        <div className={styles.roof} aria-hidden="true" />
        <div className={styles.warningLine} aria-hidden="true" />
        <div className={styles.plot} style={{ gridTemplateColumns: `repeat(${capacity}, minmax(0, 1fr))` }}>
          {buckets.map((bucket, index) => {
            const height = bucket.selectedTokens > 0 ? `${Math.max(1.4, Math.min(100, bucket.selectedPercent))}%` : "0%";
            const remaining = Math.max(0, TEST_WEEKLY_TOKENS - bucket.combinedTokens);
            const change = intervalChange(index);
            const label = `${sourceName[filter]} activity interval, local ${localRange(bucket.start, bucket.end)}; UTC ${time(bucket.start)} to ${time(bucket.end)}; spent ${number(bucket.intervalSelectedTokens)} tokens in interval; cumulative selected source ${number(bucket.selectedTokens)} of 10,000 shared TEST PREVIEW tokens, ${bucket.selectedPercent.toFixed(1)}%; Combined ${number(bucket.combinedTokens)}, ${number(remaining)} before shared test line${change === null ? "" : `; interval spend change since last plotted bar ${signedNumber(change)} tokens in this UTC week`}${bucket.resetAfter ? "; UTC-week reset follows" : ""}${bucket.isCurrent ? "; interval in progress" : ""}${complete ? "" : "; partial data"}`;
            return (
              <div key={bucket.start} className={`${styles.barSlot} ${bucket.resetAfter ? styles.resetAfter : ""}`}>
                <button type="button" className={styles.barButton} aria-label={label}
                  onFocus={(event) => {
                    if (event.currentTarget.matches(":focus-visible")) {
                      const bar = event.currentTarget.querySelector<HTMLElement>("[data-testid='usage-bar']");
                      if (bar) show(index, bar, "focus");
                    }
                  }}
                  onBlur={() => hide(index, "focus")}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") setActive(null);
                    else if (event.key === "Enter" || event.key === " ") {
                      const bar = event.currentTarget.querySelector<HTMLElement>("[data-testid='usage-bar']");
                      if (bar) show(index, bar, "focus");
                    }
                  }}>
                  <span className={styles.bar} data-testid="usage-bar" data-start={bucket.start} data-interval-tokens={bucket.intervalSelectedTokens} data-selected-tokens={bucket.selectedTokens}
                    data-combined-tokens={bucket.combinedTokens} data-color={bucket.color} data-active={active?.index === index ? "true" : undefined}
                    onPointerEnter={(event) => { if (event.pointerType !== "touch") show(index, event.currentTarget, "hover"); }}
                    onPointerLeave={(event) => { if (event.pointerType !== "touch") hide(index, "hover"); }}
                    onPointerUp={(event) => {
                      if (event.pointerType !== "touch") return;
                      const next = positionFor(index, event.currentTarget, "touch");
                      if (next) setActive((current) => current?.mode === "touch" && current.index === index ? null : next);
                    }}
                    style={{ height, backgroundColor: bucket.color }} />
                </button>
              </div>
            );
          })}
        </div>
        {detail && active && <div ref={tooltipRef} className={styles.barTooltip} data-testid="usage-tooltip"
          style={{ left: active.left }} aria-hidden="true">
          <strong>{sourceName[filter]} · {localRange(detail.start, detail.end)}</strong>
          <span>Spent: {number(detail.intervalSelectedTokens)} recorded tokens</span>
          {detailChange !== null &&
            <span>Since last bar: {signedNumber(detailChange)} tokens</span>}
          <span>This UTC week: {number(detail.selectedTokens)} ({detail.selectedPercent.toFixed(1)}%) of shared 10,000 TEST PREVIEW</span>
          {((detail.firstInWeek && active.index > 0) || detail.isCurrent || !complete) &&
            <small>{[
              detail.firstInWeek && active.index > 0 ? "UTC week reset" : "",
              detail.isCurrent ? "In progress" : "",
              !complete ? "Partial records; totals may be low" : "",
            ].filter(Boolean).join(" · ")}</small>}
        </div>}
      </div>
      <p className={styles.chartRange}>{buckets.length ? `${time(buckets[0].start)} → ${time(buckets[buckets.length - 1].sampleAt)} · UTC · plotted activity, oldest to newest` : "No active intervals in this selected time view."}</p>
    </div>
  );
}
