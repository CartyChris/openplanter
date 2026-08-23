/** Tauri event subscriptions with browser-safe fallbacks. */
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { isTauri } from "./web";
import type { AgentEvent, CuratorUpdateEvent, GraphData } from "./types";

const noop = async (): Promise<UnlistenFn> => () => {};

export function onAgentTrace(
  callback: (message: string) => void
): Promise<UnlistenFn> {
  if (!isTauri()) return noop();
  return listen<{ message: string }>("agent:trace", (event) =>
    callback(event.payload.message)
  );
}

function browserEvent<T>(name: string, callback: (detail: T) => void): Promise<UnlistenFn> {
  if (isTauri()) return noop();
  const handler = (event: Event) => callback((event as CustomEvent<T>).detail);
  window.addEventListener(name, handler);
  return Promise.resolve(() => window.removeEventListener(name, handler));
}

export function onAgentStep(
  callback: (event: AgentEvent & { type: "step" }) => void
): Promise<UnlistenFn> {
  if (!isTauri()) {
    // Browser run accounting intentionally uses a different event name from
    // ChatPane's historical agent-step transcript event. This keeps the web
    // status bar mutable instead of appending a permanent line per update.
    return browserEvent(
      "agent-status",
      callback as (detail: AgentEvent & { type: "step" }) => void
    );
  }
  return listen("agent:step", (event) => callback(event.payload as any));
}

export function onAgentDelta(
  callback: (event: AgentEvent & { type: "delta" }) => void
): Promise<UnlistenFn> {
  if (!isTauri()) {
    return browserEvent(
      "agent-delta",
      callback as (detail: AgentEvent & { type: "delta" }) => void
    );
  }
  return listen("agent:delta", (event) => callback(event.payload as any));
}

export function onAgentComplete(
  callback: (result: string) => void
): Promise<UnlistenFn> {
  if (!isTauri()) {
    return browserEvent<{ result: string }>("agent:complete", (detail) =>
      callback(detail.result)
    );
  }
  return listen<{ result: string }>("agent:complete", (event) =>
    callback(event.payload.result)
  );
}

export function onAgentError(
  callback: (message: string) => void
): Promise<UnlistenFn> {
  if (!isTauri()) return noop();
  return listen<{ message: string }>("agent:error", (event) =>
    callback(event.payload.message)
  );
}

export function onWikiUpdated(
  callback: (data: GraphData) => void
): Promise<UnlistenFn> {
  if (!isTauri()) return noop();
  return listen<GraphData>("wiki:updated", (event) => callback(event.payload));
}

export function onCuratorUpdate(
  callback: (event: CuratorUpdateEvent) => void
): Promise<UnlistenFn> {
  if (!isTauri()) return noop();
  return listen<CuratorUpdateEvent>("agent:curator-update", (event) =>
    callback(event.payload)
  );
}
