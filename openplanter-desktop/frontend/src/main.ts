import { createApp } from "./components/App";
import { getConfig } from "./api/invoke";
import {
  onAgentTrace,
  onAgentDelta,
  onAgentComplete,
  onAgentError,
  onAgentStep,
  onWikiUpdated,
  onCuratorUpdate,
} from "./api/events";
import { appState } from "./state/store";
import { isTauri } from "./api/web";
import { applyWebAppearance, getWebPreferences } from "./api/webPreferences";

const SPLASH_ART = [
  " .oOo.      ___                   ____  _             _                .oOo. ",
  "oO.|.Oo    / _ \\ _ __   ___ _ __ |  _ \\| | __ _ _ __ | |_ ___ _ __    oO.|.Oo",
  "Oo.|.oO   | | | | '_ \\ / _ \\ '_ \\| |_) | |/ _` | '_ \\| __/ _ \\ '__|   Oo.|.oO",
  "  .|.     | |_| | |_) |  __/ | | |  __/| | (_| | | | | ||  __/ |        .|.  ",
  "[=====]    \\___/| .__/ \\___|_| |_|_|   |_|\\__,_|_| |_|\\__\\___|_|      [=====]",
  " \\___/          |_|                                                    \\___/ ",
].join("\n");

/**
 * Browser webSolve historically emits `agent-step`, while ChatPane treats that
 * event as a permanent transcript step. Convert it at capture time to the
 * browser-only mutable `agent-status` channel before UI listeners run.
 */
function installBrowserRunStatusBridge() {
  if (isTauri()) return;
  window.addEventListener(
    "agent-step",
    (event) => {
      event.stopImmediatePropagation();
      window.dispatchEvent(
        new CustomEvent("agent-status", {
          detail: (event as CustomEvent).detail,
        })
      );
    },
    { capture: true }
  );
}

async function init() {
  if (!isTauri()) {
    applyWebAppearance(getWebPreferences());
    installBrowserRunStatusBridge();
  }

  const app = document.getElementById("app")!;
  createApp(app);

  let provider = "";
  let model = "";
  try {
    const config = await getConfig();
    provider = config.provider;
    model = config.model;
    appState.update((state) => ({
      ...state,
      provider: config.provider,
      model: config.model,
      sessionId: config.session_id,
      reasoningEffort: config.reasoning_effort,
      recursive: config.recursive,
      workspace: config.workspace,
      maxDepth: config.max_depth,
      maxStepsPerCall: config.max_steps_per_call,
    }));
  } catch (error) {
    console.error("Failed to load config:", error);
  }

  const state = appState.get();
  const reasoningLabel = state.reasoningEffort ?? "off";
  const modeLabel = state.recursive ? "recursive" : "flat";

  appState.update((current) => ({
    ...current,
    messages: [
      {
        id: crypto.randomUUID(),
        role: "splash" as const,
        content: SPLASH_ART,
        timestamp: Date.now(),
      },
      {
        id: crypto.randomUUID(),
        role: "system" as const,
        content: [
          `provider: ${provider || "auto"}`,
          `model: ${model || "—"}`,
          `reasoning: ${reasoningLabel}`,
          `mode: ${modeLabel}`,
          `workspace: ${state.workspace || "."}`,
        ].join("  |  "),
        timestamp: Date.now(),
      },
      {
        id: crypto.randomUUID(),
        role: "system" as const,
        content: "Type /help for commands. ESC to cancel a running task.",
        timestamp: Date.now(),
      },
    ],
  }));

  await onAgentTrace((message) => {
    console.log("[trace]", message);
  });

  await onAgentStep((event) => {
    const browserFinal = !isTauri() && event.is_final;
    appState.update((current) => ({
      ...current,
      // Browser webSolve reports the same input estimate at start and final.
      // Count it once while still allowing Tauri to aggregate real step usage.
      inputTokens:
        current.inputTokens + (browserFinal ? 0 : event.tokens.input_tokens),
      outputTokens: current.outputTokens + event.tokens.output_tokens,
      currentStep: event.step,
      currentDepth: event.depth,
    }));

    if (isTauri()) {
      window.dispatchEvent(new CustomEvent("agent-step", { detail: event }));
    }
  });

  await onAgentDelta((event) => {
    if (isTauri()) {
      window.dispatchEvent(new CustomEvent("agent-delta", { detail: event }));
    }
  });

  await onAgentComplete((result) => {
    appState.update((current) => ({
      ...current,
      isRunning: false,
      currentStep: 0,
      currentDepth: 0,
      messages: [
        ...current.messages,
        {
          id: crypto.randomUUID(),
          role: "assistant" as const,
          content: result,
          timestamp: Date.now(),
          isRendered: true,
        },
      ],
    }));
    processQueue();
  });

  await onAgentError((message) => {
    appState.update((current) => ({
      ...current,
      isRunning: false,
      currentStep: 0,
      currentDepth: 0,
      messages: [
        ...current.messages,
        {
          id: crypto.randomUUID(),
          role: "system" as const,
          content: `Error: ${message}`,
          timestamp: Date.now(),
        },
      ],
    }));
    processQueue();
  });

  await onWikiUpdated((data) => {
    window.dispatchEvent(new CustomEvent("wiki-updated", { detail: data }));
  });

  await onCuratorUpdate((event) => {
    appState.update((current) => ({
      ...current,
      messages: [
        ...current.messages,
        {
          id: crypto.randomUUID(),
          role: "system" as const,
          content: `[Wiki Curator] ${event.summary}`,
          timestamp: Date.now(),
        },
      ],
    }));
    window.dispatchEvent(new CustomEvent("curator-done"));
  });
}

function processQueue() {
  const state = appState.get();
  if (state.inputQueue.length > 0) {
    const [next, ...rest] = state.inputQueue;
    appState.update((current) => ({ ...current, inputQueue: rest }));
    window.dispatchEvent(new CustomEvent("queued-submit", { detail: { text: next } }));
  }
}

init();
