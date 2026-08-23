/** Root layout component. */
import { createStatusBar } from "./StatusBar";
import { createChatPane } from "./ChatPane";
import { createGraphPane } from "./GraphPane";
import { createMobileDock } from "./MobileDock";
import { appState } from "../state/store";
import {
  listSessions,
  openSession,
  deleteSession,
  getCredentialsStatus,
  getSessionHistory,
} from "../api/invoke";
import {
  isTauri,
  downloadText,
  importWorkspace,
  importFolder,
  exportFindings,
  wipeWorkspace,
} from "../api/web";
import { openWebSettings } from "./WebSettings";
import { openWorkspaceTools } from "./WebWorkspace";
import { openWebDashboard } from "./WebDashboard";
import type { ChatMessage } from "../state/store";
import type { ReplayEntry } from "../api/types";

export function createApp(root: HTMLElement): void {
  const toolbar = createToolbar();
  root.appendChild(toolbar);
  root.appendChild(createStatusBar());

  const sidebar = document.createElement("div");
  sidebar.className = "sidebar";

  const sessionsHeader = document.createElement("h3");
  sessionsHeader.textContent = "Sessions";
  sidebar.appendChild(sessionsHeader);

  const newSessionBtn = document.createElement("div");
  newSessionBtn.className = "session-item";
  newSessionBtn.style.color = "var(--accent)";
  newSessionBtn.style.fontWeight = "600";
  newSessionBtn.textContent = "+ New Session";
  sidebar.appendChild(newSessionBtn);

  const sessionList = document.createElement("div");
  sessionList.className = "session-list";
  sidebar.appendChild(sessionList);
  newSessionBtn.addEventListener("click", () => void switchToNewSession(sessionList));

  const settingsHeader = document.createElement("h3");
  settingsHeader.style.marginTop = "16px";
  settingsHeader.textContent = "Settings";
  sidebar.appendChild(settingsHeader);

  const settingsDisplay = document.createElement("div");
  settingsDisplay.className = "settings-display";
  sidebar.appendChild(settingsDisplay);

  const credsHeader = document.createElement("h3");
  credsHeader.style.marginTop = "16px";
  credsHeader.textContent = "Credentials";
  sidebar.appendChild(credsHeader);

  const credsDisplay = document.createElement("div");
  credsDisplay.className = "cred-status";
  sidebar.appendChild(credsDisplay);
  root.appendChild(sidebar);

  root.appendChild(createChatPane());
  root.appendChild(createGraphPane());

  const mobileDock = createMobileDock({
    newSession: () => switchToNewSession(sessionList),
    renderThreads: (container) => loadSessions(container),
    openResearch: openWorkspaceTools,
    openSettings: openWebSettings,
    openDashboard: openWebDashboard,
  });
  root.appendChild(mobileDock);

  function renderSettings() {
    const state = appState.get();
    settingsDisplay.innerHTML = [
      `<div><span class="label">provider:</span> <span class="value">${state.provider || "auto"}</span></div>`,
      `<div><span class="label">model:</span> <span class="value">${state.model || "—"}</span></div>`,
      `<div><span class="label">reasoning:</span> <span class="value">${state.reasoningEffort ?? "off"}</span></div>`,
      `<div><span class="label">mode:</span> <span class="value">${state.recursive ? "recursive" : "flat"}</span></div>`,
    ].join("");
  }
  appState.subscribe(renderSettings);
  renderSettings();

  void loadSessions(sessionList);
  appState.subscribe(() => highlightActiveSession(sessionList));
  void loadCredentials(credsDisplay);
}

function createToolbar(): HTMLElement {
  const toolbar = document.createElement("div");
  toolbar.className = "web-toolbar";

  const badge = document.createElement("span");
  badge.textContent = isTauri() ? "DESKTOP" : "WEB MODE · LOCAL DATA";
  toolbar.appendChild(badge);

  const exportBtn = document.createElement("button");
  exportBtn.textContent = "Export workspace";
  exportBtn.addEventListener("click", () =>
    downloadText(
      "openplanter-workspace.md",
      appState.get().messages.map((message) => `## ${message.role}\n\n${message.content}`).join("\n\n")
    )
  );
  toolbar.appendChild(exportBtn);

  const backupBtn = document.createElement("button");
  backupBtn.textContent = "Backup";
  backupBtn.title = "Export or import all browser data";
  backupBtn.addEventListener("click", () => openBackupMenu(toolbar, backupBtn));
  toolbar.appendChild(backupBtn);

  const settingsBtn = document.createElement("button");
  settingsBtn.textContent = "Settings";
  settingsBtn.addEventListener("click", openWebSettings);
  toolbar.appendChild(settingsBtn);

  const researchBtn = document.createElement("button");
  researchBtn.textContent = "Research";
  researchBtn.addEventListener("click", openWorkspaceTools);
  toolbar.appendChild(researchBtn);

  const dashboardBtn = document.createElement("button");
  dashboardBtn.textContent = "Dashboard";
  dashboardBtn.addEventListener("click", openWebDashboard);
  toolbar.appendChild(dashboardBtn);
  return toolbar;
}

function openBackupMenu(toolbar: HTMLElement, backupBtn: HTMLButtonElement) {
  toolbar.querySelector(".toolbar-menu")?.remove();
  const menu = document.createElement("div");
  menu.className = "toolbar-menu";

  const importBtn = document.createElement("button");
  importBtn.textContent = "Import backup";
  const folderBtn = document.createElement("button");
  folderBtn.textContent = "Import findings folder";
  const findingsBtn = document.createElement("button");
  findingsBtn.textContent = "Export findings";
  const wipeBtn = document.createElement("button");
  wipeBtn.textContent = "Wipe all browser data";
  wipeBtn.className = "danger-button";

  const picker = document.createElement("input");
  picker.type = "file";
  picker.accept = "application/json";
  picker.hidden = true;
  const folderPicker = document.createElement("input");
  folderPicker.type = "file";
  folderPicker.multiple = true;
  folderPicker.setAttribute("webkitdirectory", "");
  folderPicker.hidden = true;

  importBtn.onclick = () => picker.click();
  folderBtn.onclick = () => folderPicker.click();
  findingsBtn.onclick = () => exportFindings();
  picker.onchange = () =>
    picker.files?.[0] &&
    importWorkspace(picker.files[0]).catch(() => alert("That backup file is not valid."));
  folderPicker.onchange = () => folderPicker.files && importFolder(folderPicker.files);
  wipeBtn.onclick = () => {
    if (confirm("Wipe all sessions, reports, notes, settings, and credentials from this browser?")) {
      wipeWorkspace();
    }
  };

  menu.append(importBtn, folderBtn, findingsBtn, wipeBtn, picker, folderPicker);
  toolbar.appendChild(menu);
  setTimeout(() => {
    const close = (event: MouseEvent) => {
      if (!menu.contains(event.target as Node) && event.target !== backupBtn) {
        menu.remove();
        document.removeEventListener("click", close);
      }
    };
    document.addEventListener("click", close);
  }, 0);
}

async function switchToNewSession(sessionList: HTMLElement): Promise<void> {
  try {
    const session = await openSession();
    appState.update((state) => ({
      ...state,
      sessionId: session.id,
      messages: [],
      inputTokens: 0,
      outputTokens: 0,
      currentStep: 0,
      currentDepth: 0,
      inputQueue: [],
    }));
    window.dispatchEvent(new CustomEvent("session-changed", { detail: { isNew: true } }));
    appState.update((state) => ({
      ...state,
      messages: [
        {
          id: crypto.randomUUID(),
          role: "system" as const,
          content: `New session: ${session.id.slice(0, 8)}`,
          timestamp: Date.now(),
        },
      ],
    }));
    await loadSessions(sessionList);
  } catch (error) {
    console.error("Failed to create new session:", error);
  }
}

function replayEntryToMessage(entry: ReplayEntry): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role: entry.role as ChatMessage["role"],
    content: entry.content,
    toolName: entry.tool_name ?? undefined,
    timestamp: new Date(entry.timestamp).getTime() || Date.now(),
    isRendered: entry.is_rendered ?? entry.role === "assistant",
    stepNumber: entry.step_number ?? undefined,
    stepTokensIn: entry.step_tokens_in ?? undefined,
    stepTokensOut: entry.step_tokens_out ?? undefined,
    stepElapsed: entry.step_elapsed ?? undefined,
    stepModelPreview: entry.step_model_preview ?? undefined,
    stepToolCalls: entry.step_tool_calls?.map((call) => ({
      name: call.name,
      keyArg: call.key_arg,
      elapsed: call.elapsed,
    })),
  };
}

async function switchToSession(sessionId: string, sessionList: HTMLElement): Promise<void> {
  try {
    const resumed = await openSession(sessionId, true);
    appState.update((state) => ({
      ...state,
      sessionId: resumed.id,
      messages: [],
      inputTokens: 0,
      outputTokens: 0,
      currentStep: 0,
      currentDepth: 0,
      inputQueue: [],
    }));
    window.dispatchEvent(new CustomEvent("session-changed", { detail: { isNew: false } }));

    let messages: ChatMessage[] = [];
    try {
      const history = await getSessionHistory(resumed.id);
      messages = history.map(replayEntryToMessage);
    } catch (error) {
      console.error("Failed to load session history:", error);
    }

    const info = resumed.last_objective
      ? `Resumed session ${resumed.id.slice(0, 8)} — ${resumed.last_objective}`
      : `Resumed session ${resumed.id.slice(0, 8)}`;
    appState.update((state) => ({
      ...state,
      messages: [
        {
          id: crypto.randomUUID(),
          role: "system" as const,
          content: info,
          timestamp: Date.now(),
        },
        ...messages,
      ],
    }));
    highlightActiveSession(sessionList);
  } catch (error) {
    console.error("Failed to resume session:", error);
  }
}

function highlightActiveSession(container: HTMLElement): void {
  const currentId = appState.get().sessionId;
  for (const item of container.querySelectorAll(".session-item")) {
    const element = item as HTMLElement;
    if (element.title === currentId) {
      element.style.background = "var(--bg-tertiary)";
      element.style.color = "var(--accent)";
    } else {
      element.style.background = "";
      element.style.color = "";
    }
  }
}

async function loadSessions(container: HTMLElement): Promise<void> {
  try {
    const sessions = await listSessions(20);
    container.innerHTML = "";
    if (sessions.length === 0) {
      const empty = document.createElement("div");
      empty.className = "session-item";
      empty.style.color = "var(--text-muted)";
      empty.textContent = "No sessions yet";
      container.appendChild(empty);
      return;
    }

    for (const session of sessions) {
      const item = document.createElement("div");
      item.className = "session-item";
      item.title = session.id;
      item.style.display = "flex";
      item.style.alignItems = "center";
      item.style.justifyContent = "space-between";

      const label = document.createElement("span");
      label.style.overflow = "hidden";
      label.style.textOverflow = "ellipsis";
      label.style.whiteSpace = "nowrap";
      label.style.flex = "1";
      const date = new Date(session.created_at);
      const dateStr = date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      label.textContent = session.last_objective
        ? `${dateStr} — ${session.last_objective}`
        : dateStr;
      label.addEventListener("click", () => void switchToSession(session.id, container));

      const deleteBtn = document.createElement("span");
      deleteBtn.className = "session-delete";
      deleteBtn.textContent = "×";
      deleteBtn.title = "Delete session";
      let confirmPending = false;
      let confirmTimer: ReturnType<typeof setTimeout> | null = null;
      const resetDeleteBtn = () => {
        confirmPending = false;
        deleteBtn.textContent = "×";
        deleteBtn.style.color = "";
        deleteBtn.style.fontWeight = "";
        deleteBtn.style.display = "";
      };
      deleteBtn.addEventListener("click", async (event) => {
        event.stopPropagation();
        if (!confirmPending) {
          confirmPending = true;
          deleteBtn.textContent = "Delete?";
          deleteBtn.style.color = "var(--error)";
          deleteBtn.style.fontWeight = "600";
          deleteBtn.style.display = "inline";
          confirmTimer = setTimeout(resetDeleteBtn, 3000);
          return;
        }
        if (confirmTimer) clearTimeout(confirmTimer);
        confirmPending = false;
        deleteBtn.textContent = "...";
        try {
          await deleteSession(session.id);
          if (appState.get().sessionId === session.id) {
            await switchToNewSession(container);
          } else {
            await loadSessions(container);
          }
        } catch (error) {
          deleteBtn.textContent = "Error!";
          console.error("Failed to delete session:", error);
          setTimeout(resetDeleteBtn, 2000);
        }
      });

      item.append(label, deleteBtn);
      container.appendChild(item);
    }
    highlightActiveSession(container);
  } catch (error) {
    console.error("Failed to load sessions:", error);
  }
}

async function loadCredentials(container: HTMLElement): Promise<void> {
  try {
    const status = await getCredentialsStatus();
    container.innerHTML = "";
    const providers = [
      "openai",
      "anthropic",
      "openrouter",
      "google",
      "cerebras",
      "ollama",
      "lmstudio",
      "exa",
      "firecrawl",
    ];
    for (const provider of providers) {
      const row = document.createElement("div");
      const hasKey = status[provider] ?? false;
      row.className = hasKey ? "cred-ok" : "cred-missing";
      row.textContent = `${hasKey ? "✓" : "✗"} ${provider}`;
      container.appendChild(row);
    }
  } catch (error) {
    console.error("Failed to load credentials:", error);
  }
}
