/** Typed Tauri invoke wrappers. */
import { invoke } from "@tauri-apps/api/core";
import { isTauri, webConfig, webUpdateConfig, webCredentials, webModels, webSessions, webOpenSession, webDeleteSession, webHistory, webGraph, webSolve, webCancel } from "./web";
import type {
  ConfigView,
  GraphData,
  ModelInfo,
  PartialConfig,
  PersistentSettings,
  ReplayEntry,
  SessionInfo,
} from "./types";

export async function solve(objective: string, sessionId: string): Promise<void> {
  if (!isTauri()) return webSolve(objective, sessionId);
  return invoke("solve", { objective, sessionId });
}

export async function getSessionHistory(sessionId: string): Promise<ReplayEntry[]> {
  if (!isTauri()) return webHistory(sessionId);
  return invoke("get_session_history", { sessionId });
}

export async function cancel(): Promise<void> {
  if (!isTauri()) return webCancel();
  return invoke("cancel");
}

export async function getConfig(): Promise<ConfigView> {
  if (!isTauri()) return webConfig();
  return invoke("get_config");
}

export async function updateConfig(partial: PartialConfig): Promise<ConfigView> {
  if (!isTauri()) return webUpdateConfig(partial);
  return invoke("update_config", { partial });
}

export async function listModels(provider: string): Promise<ModelInfo[]> {
  if (!isTauri()) return webModels(provider);
  return invoke("list_models", { provider });
}

export async function saveSettings(settings: PersistentSettings): Promise<void> {
  return invoke("save_settings", { settings });
}

export async function getCredentialsStatus(): Promise<Record<string, boolean>> {
  if (!isTauri()) return webCredentials();
  return invoke("get_credentials_status");
}

export async function listSessions(limit?: number): Promise<SessionInfo[]> {
  if (!isTauri()) return webSessions().slice(0, limit ?? 20);
  return invoke("list_sessions", { limit: limit ?? null });
}

export async function openSession(
  id?: string,
  resume: boolean = false
): Promise<SessionInfo> {
  if (!isTauri()) return webOpenSession(id);
  return invoke("open_session", { id: id ?? null, resume });
}

export async function deleteSession(id: string): Promise<void> {
  if (!isTauri()) return webDeleteSession(id);
  return invoke("delete_session", { id });
}

export async function getGraphData(): Promise<GraphData> {
  if (!isTauri()) return webGraph();
  return invoke("get_graph_data");
}

export async function readWikiFile(path: string): Promise<string> {
  return invoke("read_wiki_file", { path });
}

export async function debugLog(msg: string): Promise<void> {
  return invoke("debug_log", { msg });
}
