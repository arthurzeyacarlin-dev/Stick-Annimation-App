"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { TEST_WEEKLY_TOKENS, type DashboardBucket, type DashboardFilter } from "../../lib/ai-dashboard/dashboardContract";
import styles from "./AiDashboard.module.css";
import { creditsText } from "../../lib/account/credits";

const number = (value: number) => value.toLocaleString("en-US");
const signedMoney = (value: number) => `${value > 0 ? "+" : ""}${creditsText(value)}`;
const time = (value: number) => new Date(value).toISOString().replace(".000Z", "Z");
const localRange = (start: number, end: number) => {
  const first = new Date(start);
  const last = new Date(end);
  const clock = (date: Date) => date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (first.toDateString() === last.toDateString()) return `${clock(first)}–${clock(last)}`;
  return `${first.toLocaleDateString()} ${clock(first)}–${last.toLocaleDateString()} ${clock(last)}`;
};
const sourceName: Record<DashboardFilter, string> = {
  combined: "All", project: "AI Animator", assistant: "Assistant",
};

export function AiUsageChart({ buckets, filter, complete, capacity, roof = TEST_WEEKLY_TOKENS }: { buckets: DashboardBucket[]; filter: DashboardFilter; complete: boolean; capacity: number; roof?: number }) {
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
  // Arthur (Nov 18): usage as bars in the app's one blue. Taller bar = more credits used in that stretch of time.
  const peak = Math.max(1, ...buckets.map((bucket) => bucket.intervalSelectedTokens));
  const total = buckets.reduce((sum, bucket) => sum + bucket.intervalSelectedTokens, 0);
  const empties = Math.max(0, capacity - buckets.length);
  return (
    <div className={styles.chartArea} aria-label={`${sourceName[filter]} credits chart`}>
      <div className={styles.chartSummary}>
        <div><span>Used in this view</span><strong>{number(total)}</strong></div>
        <div><span>Biggest moment</span><strong>{number(buckets.length ? peak : 0)}</strong></div>
        <div><span>Your plan</span><strong>{number(roof)}</strong></div>
      </div>
      <div className={styles.plotWrap} ref={plotRef}
        onPointerDown={(event) => {
          if (event.pointerType === "touch" && !(event.target as HTMLElement).closest("[data-testid='usage-bar']")) setActive(null);
        }}>
        <div className={styles.gridLines} aria-hidden="true">
          {[1, 0.5, 0].map((part) => <span key={part}><em>{number(Math.round(peak * part))}</em></span>)}
        </div>
        <div className={styles.plot} style={{ gridTemplateColumns: `repeat(${capacity}, minmax(0, 1fr))` }}>
          {buckets.map((bucket, index) => {
            const level = `${Math.max(3, (bucket.intervalSelectedTokens / peak) * 100)}%`;
            const remaining = Math.max(0, roof - bucket.combinedTokens);
            const change = intervalChange(index);
            const label = `${sourceName[filter]} activity interval, local ${localRange(bucket.start, bucket.end)}; UTC ${time(bucket.start)} to ${time(bucket.end)}; used ${creditsText(bucket.intervalSelectedTokens)} in interval; cumulative selected source ${creditsText(bucket.selectedTokens)} of your plan's ${creditsText(roof)}, ${bucket.selectedPercent.toFixed(1)}%; all AI ${creditsText(bucket.combinedTokens)}, ${creditsText(remaining)} left in the preview${change === null ? "" : `; interval spend change since last plotted bar ${signedMoney(change)} in this UTC week`}${bucket.resetAfter ? "; UTC-week reset follows" : ""}${bucket.isCurrent ? "; interval in progress" : ""}${complete ? "" : "; partial data"}`;
            return (
              <div key={bucket.start} className={styles.barSlot}>
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
                  <span className={styles.costBar} data-testid="usage-bar" data-start={bucket.start} data-interval-tokens={bucket.intervalSelectedTokens} data-selected-tokens={bucket.selectedTokens}
                    data-combined-tokens={bucket.combinedTokens} data-active={active?.index === index ? "true" : undefined} data-current={bucket.isCurrent ? "true" : undefined}
                    onPointerEnter={(event) => { if (event.pointerType !== "touch") show(index, event.currentTarget, "hover"); }}
                    onPointerLeave={(event) => { if (event.pointerType !== "touch") hide(index, "hover"); }}
                    onPointerUp={(event) => {
                      if (event.pointerType !== "touch") return;
                      const next = positionFor(index, event.currentTarget, "touch");
                      if (next) setActive((current) => current?.mode === "touch" && current.index === index ? null : next);
                    }}
                    style={{ height: level }} />
                </button>
              </div>
            );
          })}
          {Array.from({ length: empties }, (_, index) => <div key={`empty-${index}`} className={styles.barSlot}><span className={styles.emptyBar} aria-hidden="true" /></div>)}
        </div>
        {detail && active && <div ref={tooltipRef} className={styles.barTooltip} data-testid="usage-tooltip"
          style={{ left: active.left }} aria-hidden="true">
          <strong>{sourceName[filter]} · {localRange(detail.start, detail.end)}</strong>
          <span>Used here: {creditsText(detail.intervalSelectedTokens)}</span>
          {detailChange !== null &&
            <span>Since the last point: {signedMoney(detailChange)}</span>}
          <span>Used this week so far: {creditsText(detail.selectedTokens)} ({detail.selectedPercent.toFixed(1)}%) of your plan&apos;s {creditsText(roof)}</span>
          {((detail.firstInWeek && active.index > 0) || detail.isCurrent) &&
            <small>{[
              detail.firstInWeek && active.index > 0 ? "UTC week reset" : "",
              detail.isCurrent ? "In progress" : "",
            ].filter(Boolean).join(" · ")}</small>}
        </div>}
      </div>
      {buckets.length > 0 && <p className={styles.chartRange}>{localRange(buckets[0].start, buckets[buckets.length - 1].sampleAt)} · oldest to newest</p>}
    </div>
  );
}
