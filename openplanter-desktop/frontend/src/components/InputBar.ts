/** Input bar: textarea, slash commands, input history, input queuing. */
import { solve, cancel, openSession } from "../api/invoke";
import { appState } from "../state/store";
import { dispatchSlashCommand } from "../commands/slash";
import { AutocompleteController } from "./Autocomplete";

export function createInputBar(): HTMLElement {
  const bar = document.createElement("div");
  bar.className = "input-bar";

  const textarea = document.createElement("textarea");
  textarea.rows = 1;
  textarea.placeholder = "Enter objective or /command...";
  textarea.autofocus = true;

  const modeSelect = document.createElement("select");
  modeSelect.className = "chat-mode-select";
  for (const mode of ["Research", "Artifact: HTML", "Artifact: 3D", "Tool calling", "Subagents"]) {
    const option = document.createElement("option");
    option.value = mode;
    option.textContent = mode;
    modeSelect.appendChild(option);
  }
  modeSelect.title = "Choose how OpenPlanter should handle this request";

  const submitBtn = document.createElement("button");
  submitBtn.textContent = "Send";

  const cancelBtn = document.createElement("button");
  cancelBtn.textContent = "Cancel";
  cancelBtn.style.display = "none";
  cancelBtn.style.background = "var(--error)";

  bar.appendChild(modeSelect);
  bar.appendChild(textarea);
  bar.appendChild(submitBtn);
  bar.appendChild(cancelBtn);

  let historyIndex = -1;
  let savedInput = "";

  const autocomplete = new AutocompleteController(bar, {
    onAccept: (text) => {
      textarea.value = text;
      autoResize();
    },
    onDismiss: () => {},
  });

  function autoResize() {
    textarea.style.height = "auto";
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + "px";
  }

  async function handleSubmit() {
    const text = textarea.value.trim();
    if (!text) return;
    const mode = modeSelect.value;
    const modePrompt = mode === "Research" ? "" : `\n\n[OpenPlanter mode: ${mode}. Use available tools and produce a self-contained deliverable when applicable. For Subagents, delegate focused source-finding tasks and reconcile their evidence.]`;
    const objective = `${text}${modePrompt}`;

    // Add to input history
    appState.update((s) => ({
      ...s,
      inputHistory: [objective, ...s.inputHistory.filter((h) => h !== objective)].slice(0, 100),
    }));
    historyIndex = -1;
    savedInput = "";

    // Check for slash commands
    if (text.startsWith("/")) {
      textarea.value = "";
      autoResize();

      const result = await dispatchSlashCommand(text);
      if (!result) return;

      if (result.action === "clear") {
        appState.update((s) => ({ ...s, messages: [] }));
        return;
      }

      if (result.action === "quit") {
        // In Tauri, we could close the window; for now just show message
        if (result.lines.length > 0) {
          addSystemMessage(result.lines.join("\n"));
        }
        return;
      }

      if (result.lines.length > 0) {
        addSystemMessage(result.lines.join("\n"));
      }
      return;
    }

    // If running, queue the input instead of blocking
    if (appState.get().isRunning) {
      appState.update((s) => ({
        ...s,
        inputQueue: [...s.inputQueue, text],
      }));
      addSystemMessage(`Queued: "${text.length > 60 ? text.slice(0, 60) + "..." : text}"`);
      textarea.value = "";
      autoResize();
      return;
    }

    // Normal submit
    appState.update((s) => ({
      ...s,
      isRunning: true,
      messages: [
        ...s.messages,
        {
          id: crypto.randomUUID(),
          role: "user" as const,
          content: objective,
          timestamp: Date.now(),
        },
      ],
    }));

    textarea.value = "";
    autoResize();

    // Create session lazily on first message
    if (!appState.get().sessionId) {
      try {
        const session = await openSession();
        appState.update((s) => ({ ...s, sessionId: session.id }));
        window.dispatchEvent(new CustomEvent("session-changed", { detail: { isNew: true } }));
      } catch (e) {
        console.error("Failed to create session:", e);
      }
    }

    try {
      await solve(objective, appState.get().sessionId!);
    } catch (e) {
      appState.update((s) => ({
        ...s,
        isRunning: false,
        messages: [
          ...s.messages,
          {
            id: crypto.randomUUID(),
            role: "system" as const,
            content: `Failed to start: ${e}`,
            timestamp: Date.now(),
          },
        ],
      }));
    }
  }

  async function handleCancel() {
    try {
      await cancel();
    } catch (e) {
      console.error("Cancel failed:", e);
    }
  }

  function addSystemMessage(content: string) {
    appState.update((s) => ({
      ...s,
      messages: [
        ...s.messages,
        {
          id: crypto.randomUUID(),
          role: "system" as const,
          content,
          timestamp: Date.now(),
        },
      ],
    }));
  }

  submitBtn.addEventListener("click", handleSubmit);
  cancelBtn.addEventListener("click", handleCancel);

  textarea.addEventListener("input", () => {
    autoResize();
    autocomplete.update(textarea.value);
  });

  textarea.addEventListener("keydown", (e) => {
    // Autocomplete consumes keys when popup is visible
    if (autocomplete.handleKeydown(e)) return;

    // Enter submits (unless Shift+Enter for newline)
    const composing = Boolean((e as KeyboardEvent & { nativeEvent?: { isComposing?: boolean } }).nativeEvent?.isComposing);
    if (e.key === "Enter" && !e.shiftKey && !composing && e.keyCode !== 229) {
      e.preventDefault();
      handleSubmit();
      return;
    }

    // Escape cancels
    if (e.key === "Escape") {
      handleCancel();
      return;
    }

    // Up/Down arrow for input history (when textarea is empty or single line)
    const history = appState.get().inputHistory;
    if (e.key === "ArrowUp" && textarea.value === "" && history.length > 0) {
      e.preventDefault();
      if (historyIndex === -1) {
        savedInput = textarea.value;
      }
      if (historyIndex < history.length - 1) {
        historyIndex++;
        textarea.value = history[historyIndex];
        autoResize();
      }
      return;
    }

    if (e.key === "ArrowDown" && historyIndex >= 0) {
      e.preventDefault();
      historyIndex--;
      if (historyIndex < 0) {
        textarea.value = savedInput;
      } else {
        textarea.value = history[historyIndex];
      }
      autoResize();
      return;
    }
  });

  // Handle queued-submit events from main.ts
  window.addEventListener("queued-submit", ((e: CustomEvent) => {
    const { text } = e.detail;
    if (!text) return;

    appState.update((s) => ({
      ...s,
      isRunning: true,
      messages: [
        ...s.messages,
        {
          id: crypto.randomUUID(),
          role: "user" as const,
          content: text,
          timestamp: Date.now(),
        },
      ],
    }));

    solve(text, appState.get().sessionId!).catch((err) => {
      appState.update((s) => ({
        ...s,
        isRunning: false,
        messages: [
          ...s.messages,
          {
            id: crypto.randomUUID(),
            role: "system" as const,
            content: `Failed to start queued task: ${err}`,
            timestamp: Date.now(),
          },
        ],
      }));
    });
  }) as EventListener);

  // Toggle buttons and placeholder based on running state
  appState.subscribe(() => {
    const running = appState.get().isRunning;
    submitBtn.style.display = running ? "none" : "";
    cancelBtn.style.display = running ? "" : "none";
    textarea.placeholder = running
      ? "Type to queue..."
      : "Enter objective or /command...";
    // Keep textarea enabled during execution for queuing
    submitBtn.disabled = false;
  });

  return bar;
}
