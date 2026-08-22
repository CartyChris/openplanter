/** Tauri event subscriptions with browser-safe no-op fallbacks. */
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { isTauri } from "./web";
const noop = async (): Promise<UnlistenFn> => () => {};
import type { AgentEvent, CuratorUpdateEvent, GraphData } from "./types";

export function onAgentTrace(
  callback: (message: string) => void
): Promise<UnlistenFn> {
  if (!isTauri()) return noop();
  return listen<{ message: string }>("agent:trace", (e) =>
    callback(e.payload.message)
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
  if (!isTauri()) return browserEvent("agent-step", callback as (detail: AgentEvent & { type: "step" }) => void);
  return listen("agent:step", (e) => callback(e.payload as any));
}

export function onAgentDelta(
  callback: (event: AgentEvent & { type: "delta" }) => void
): Promise<UnlistenFn> {
  if (!isTauri()) return browserEvent("agent-delta", callback as (detail: AgentEvent & { type: "delta" }) => void);
  return listen("agent:delta", (e) => callback(e.payload as any));
}

export function onAgentComplete(
  callback: (result: string) => void
): Promise<UnlistenFn> {
  if (!isTauri()) return browserEvent<{ result: string }>("agent:complete", (detail) => callback(detail.result));
  return listen<{ result: string }>("agent:complete", (e) =>
    callback(e.payload.result)
  );
}

export function onAgentError(
  callback: (message: string) => void
): Promise<UnlistenFn> {
  if (!isTauri()) return noop();
  return listen<{ message: string }>("agent:error", (e) =>
    callback(e.payload.message)
  );
}

export function onWikiUpdated(
  callback: (data: GraphData) => void
): Promise<UnlistenFn> {
  if (!isTauri()) return noop();
  return listen<GraphData>("wiki:updated", (e) => callback(e.payload));
}

export function onCuratorUpdate(
  callback: (event: CuratorUpdateEvent) => void
): Promise<UnlistenFn> {
  if (!isTauri()) return noop();
  return listen<CuratorUpdateEvent>("agent:curator-update", (e) =>
    callback(e.payload)
  );
}
