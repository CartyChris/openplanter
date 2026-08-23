/** Test utilities for controlling the Tauri invoke mock.
 *
 * Importing this module explicitly marks the current test runtime as Tauri.
 * Browser-specific tests should not import this helper; they then exercise the
 * browser fallback paths naturally.
 */

const GLOBAL_KEY = "__tauri_mock_handlers__";

type TauriTestWindow = {
  __TAURI_INTERNALS__?: Record<string, never>;
};

export function __markTauriRuntime(): void {
  const g = globalThis as typeof globalThis & { window?: TauriTestWindow };
  if (!g.window) g.window = {};
  g.window.__TAURI_INTERNALS__ = {};
}

__markTauriRuntime();

function getHandlers(): Record<string, Function> {
  if (!(globalThis as any)[GLOBAL_KEY]) {
    (globalThis as any)[GLOBAL_KEY] = {};
  }
  return (globalThis as any)[GLOBAL_KEY];
}

export function invoke(cmd: string, args?: any): Promise<any> {
  const handlers = getHandlers();
  if (handlers[cmd]) {
    try {
      return Promise.resolve(handlers[cmd](args));
    } catch (e) {
      return Promise.reject(e);
    }
  }
  return Promise.reject(new Error(`No mock for command: ${cmd}`));
}

export function __setHandler(cmd: string, fn: Function): void {
  getHandlers()[cmd] = fn;
}

export function __clearHandlers(): void {
  const handlers = getHandlers();
  for (const k in handlers) delete handlers[k];
}
