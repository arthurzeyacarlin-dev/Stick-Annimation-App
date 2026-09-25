import { notificationIdentityEqualsV1, requireNotificationOriginV1, requireNotificationTargetV1, type NotificationOriginV1, type NotificationTargetV1 } from "./notificationContracts.ts";

const ORIGIN_HANDLE = Symbol("notification-origin-registration-v1");
const TARGET_HANDLE = Symbol("notification-target-registration-v1");
const DESTINATION_HANDLE = Symbol("notification-destination-registration-v1");

export type NotificationOriginRegistrationHandleV1 = Readonly<{
  unregister(): void;
  readonly [ORIGIN_HANDLE]: string;
}>;

export type NotificationTargetRegistrationHandleV1 = Readonly<{
  unregister(): void;
  readonly [TARGET_HANDLE]: string;
}>;

export type NotificationDestinationRegistrationHandleV1 = Readonly<{
  unregister(): void;
  readonly [DESTINATION_HANDLE]: string;
}>;
export type NotificationNavigationResultV1 = "handled" | "blocked-unsaved" | "unavailable";

type SurfaceRegistration<T> = {
  identity: T;
  surfaceElement: HTMLElement;
  regionElement: HTMLElement;
};

const origins = new Map<string, SurfaceRegistration<NotificationOriginV1>>();
const targets = new Map<string, SurfaceRegistration<NotificationTargetV1>>();
const destinations = new Map<string, { target: NotificationTargetV1; handler: (target: NotificationTargetV1) => NotificationNavigationResultV1 | Promise<NotificationNavigationResultV1> }>();
let pendingIntent: NotificationTargetV1 | null = null;
const intentListeners = new Set<(target: NotificationTargetV1) => void>();

const handleId = () => crypto.randomUUID();

const isHiddenOrInaccessible = (element: HTMLElement) => {
  for (let current: HTMLElement | null = element; current; current = current.parentElement) {
    if (current.hidden || current.hasAttribute("inert") || current.getAttribute("aria-hidden")?.trim().toLowerCase() === "true") return true;
    const style = current.ownerDocument.defaultView?.getComputedStyle(current);
    if (!style) return true;
    if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse" || style.contentVisibility === "hidden" || Number.parseFloat(style.opacity || "1") === 0) return true;
    // display:contents is deliberately not hidden. Ancestor traversal continues.
  }
  return false;
};

export const isNotificationSurfaceVisibleV1 = (surfaceElement: HTMLElement, regionElement: HTMLElement) => {
  const document = surfaceElement.ownerDocument;
  if (document !== regionElement.ownerDocument || document.visibilityState !== "visible" || !document.hasFocus()) return false;
  if (!surfaceElement.isConnected || !regionElement.isConnected || !surfaceElement.contains(regionElement)) return false;
  if (isHiddenOrInaccessible(surfaceElement) || isHiddenOrInaccessible(regionElement)) return false;
  try {
    return Array.from(regionElement.getClientRects()).some(rect => rect.width > 0 && rect.height > 0);
  } catch {
    return false;
  }
};

export function registerNotificationOriginSurfaceV1(input: {
  origin: NotificationOriginV1;
  surfaceElement: HTMLElement;
  terminalRegionElement: HTMLElement;
}): NotificationOriginRegistrationHandleV1 {
  const id = handleId();
  const origin = requireNotificationOriginV1(input.origin);
  if (!(input.surfaceElement instanceof HTMLElement) || !(input.terminalRegionElement instanceof HTMLElement)) throw new TypeError("Notification origin registration requires HTML elements.");
  origins.set(id, { identity: origin, surfaceElement: input.surfaceElement, regionElement: input.terminalRegionElement });
  return Object.freeze({
    [ORIGIN_HANDLE]: id,
    unregister: () => { origins.delete(id); },
  });
}

export function registerNotificationTargetSurfaceV1(input: {
  target: NotificationTargetV1;
  surfaceElement: HTMLElement;
  targetRegionElement: HTMLElement;
}): NotificationTargetRegistrationHandleV1 {
  const id = handleId();
  const target = requireNotificationTargetV1(input.target);
  if (!(input.surfaceElement instanceof HTMLElement) || !(input.targetRegionElement instanceof HTMLElement)) throw new TypeError("Notification target registration requires HTML elements.");
  targets.set(id, { identity: target, surfaceElement: input.surfaceElement, regionElement: input.targetRegionElement });
  return Object.freeze({
    [TARGET_HANDLE]: id,
    unregister: () => { targets.delete(id); },
  });
}

export const hasVisibleExactNotificationOriginV1 = (origin: NotificationOriginV1) => {
  for (const registration of origins.values()) {
    if (notificationIdentityEqualsV1(registration.identity, origin) && isNotificationSurfaceVisibleV1(registration.surfaceElement, registration.regionElement)) return true;
  }
  return false;
};

export const resolveVisibleNotificationTargetV1 = (handle: NotificationTargetRegistrationHandleV1) => {
  const id = handle?.[TARGET_HANDLE];
  const registration = id ? targets.get(id) : undefined;
  if (!registration || !isNotificationSurfaceVisibleV1(registration.surfaceElement, registration.regionElement)) return null;
  return structuredClone(registration.identity);
};

export async function confirmNotificationTargetArrivalV1(handle: NotificationTargetRegistrationHandleV1) {
  const target = resolveVisibleNotificationTargetV1(handle);
  if (!target) return { markedRead: 0, matched: false } as const;
  const { markNotificationsReadForTargetV1 } = await import("./notificationStorage.ts");
  const stillVisibleAndExact = () => {
    const current = resolveVisibleNotificationTargetV1(handle);
    return current !== null && notificationIdentityEqualsV1(current, target);
  };
  const markedRead = await markNotificationsReadForTargetV1(target, stillVisibleAndExact);
  return { markedRead, matched: markedRead > 0 || stillVisibleAndExact() } as const;
}

export const createNotificationNavigationIntentV1 = (target: NotificationTargetV1) => ({
  schemaVersion: "diamond-notification-navigation-intent/v1" as const,
  target: structuredClone(target),
});

export function registerNotificationNavigationHandlerV1(input: {
  target: NotificationTargetV1;
  handler: (target: NotificationTargetV1) => NotificationNavigationResultV1 | Promise<NotificationNavigationResultV1>;
}): NotificationDestinationRegistrationHandleV1 {
  const id = handleId();
  const target = requireNotificationTargetV1(input.target);
  if (typeof input.handler !== "function") throw new TypeError("Notification destination handler is invalid.");
  destinations.set(id, { target, handler: input.handler });
  return Object.freeze({
    [DESTINATION_HANDLE]: id,
    unregister: () => { destinations.delete(id); },
  });
}

export function publishNotificationNavigationIntentV1(target: NotificationTargetV1) {
  pendingIntent = requireNotificationTargetV1(target);
  for (const listener of intentListeners) listener(structuredClone(pendingIntent));
}

export const peekNotificationNavigationIntentV1 = () => pendingIntent ? structuredClone(pendingIntent) : null;

export function clearNotificationNavigationIntentV1(target: NotificationTargetV1) {
  if (pendingIntent && notificationIdentityEqualsV1(pendingIntent, target)) pendingIntent = null;
}

export function subscribeNotificationNavigationIntentV1(listener: (target: NotificationTargetV1) => void) {
  intentListeners.add(listener);
  if (pendingIntent) listener(structuredClone(pendingIntent));
  return () => { intentListeners.delete(listener); };
}

// Phase 1 intentionally registers no production destination handler. The exact-target
// seam exists for proof and for a later authorized landing integration; it accepts no URL.
export async function dispatchNotificationTargetV1(target: NotificationTargetV1): Promise<NotificationNavigationResultV1> {
  for (const destination of destinations.values()) {
    if (notificationIdentityEqualsV1(destination.target, target)) return destination.handler(structuredClone(target));
  }
  return "unavailable";
}
