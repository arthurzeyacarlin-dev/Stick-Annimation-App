"use client";

import { useEffect } from "react";

const SCROLLBAR_ACTIVE_CLASS = "is-scroll-active";
const SCROLLBAR_FADE_START_DELAY_MS = 350;

function isScrollableElement(element: Element) {
  const style = window.getComputedStyle(element);
  const canScrollY =
    /(auto|scroll|overlay)/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 1;
  const canScrollX =
    /(auto|scroll|overlay)/.test(style.overflowX) && element.scrollWidth > element.clientWidth + 1;

  return canScrollY || canScrollX;
}

function findScrollableElement(target: EventTarget | null) {
  if (!(target instanceof Node)) {
    return document.documentElement;
  }

  let element = target instanceof Element ? target : target.parentElement;
  while (element && element !== document.body) {
    if (isScrollableElement(element)) {
      return element;
    }
    element = element.parentElement;
  }

  return document.documentElement;
}

export function ScrollbarActivity() {
  useEffect(() => {
    const overlay = document.createElement("div");
    overlay.className = "app-scrollbar-overlay";
    document.body.appendChild(overlay);

    let activeElement: Element | null = null;
    let hideTimer: number | null = null;
    let animationFrame: number | null = null;

    const getScrollMetrics = (element: Element) => {
      if (element === document.documentElement) {
        return {
          rect: {
            top: 0,
            right: window.innerWidth,
            height: window.innerHeight,
          },
          scrollTop: window.scrollY || document.documentElement.scrollTop,
          scrollHeight: document.documentElement.scrollHeight,
          clientHeight: window.innerHeight,
        };
      }

      const rect = element.getBoundingClientRect();
      return {
        rect,
        scrollTop: element.scrollTop,
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
      };
    };

    const updateOverlay = () => {
      if (!activeElement) {
        return;
      }

      const { rect, scrollTop, scrollHeight, clientHeight } = getScrollMetrics(activeElement);
      if (scrollHeight <= clientHeight || rect.height <= 0) {
        overlay.classList.remove("is-visible");
        return;
      }

      const trackHeight = rect.height;
      const thumbHeight = Math.max(36, (clientHeight / scrollHeight) * trackHeight);
      const maxScrollTop = Math.max(1, scrollHeight - clientHeight);
      const maxThumbTop = Math.max(0, trackHeight - thumbHeight);
      const thumbTop = rect.top + (scrollTop / maxScrollTop) * maxThumbTop;

      overlay.style.height = `${thumbHeight}px`;
      overlay.style.transform = `translate3d(${Math.round(rect.right - 8)}px, ${Math.round(thumbTop)}px, 0)`;
    };

    const scheduleOverlayUpdate = () => {
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
      }

      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = null;
        updateOverlay();
      });
    };

    const activateScrollbar = (element: Element) => {
      activeElement?.classList.remove(SCROLLBAR_ACTIVE_CLASS);
      activeElement = element;
      element.classList.add(SCROLLBAR_ACTIVE_CLASS);
      overlay.classList.add("is-visible");
      scheduleOverlayUpdate();

      if (hideTimer !== null) {
        window.clearTimeout(hideTimer);
      }

      hideTimer = window.setTimeout(() => {
        element.classList.remove(SCROLLBAR_ACTIVE_CLASS);
        overlay.classList.remove("is-visible");
        hideTimer = null;
      }, SCROLLBAR_FADE_START_DELAY_MS);
    };

    const handleActivity = (event: Event) => {
      activateScrollbar(findScrollableElement(event.target));
    };

    window.addEventListener("scroll", handleActivity, { capture: true, passive: true });
    window.addEventListener("wheel", handleActivity, { capture: true, passive: true });
    window.addEventListener("pointerdown", handleActivity, { capture: true, passive: true });
    window.addEventListener("focusin", handleActivity, { capture: true });
    window.addEventListener("resize", scheduleOverlayUpdate);

    return () => {
      window.removeEventListener("scroll", handleActivity, { capture: true });
      window.removeEventListener("wheel", handleActivity, { capture: true });
      window.removeEventListener("pointerdown", handleActivity, { capture: true });
      window.removeEventListener("focusin", handleActivity, { capture: true });
      window.removeEventListener("resize", scheduleOverlayUpdate);
      activeElement?.classList.remove(SCROLLBAR_ACTIVE_CLASS);
      if (hideTimer !== null) {
        window.clearTimeout(hideTimer);
      }
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
      }
      overlay.remove();
    };
  }, []);

  return null;
}
