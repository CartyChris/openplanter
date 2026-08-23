import { listModels, updateConfig } from "../api/invoke";
import {
  downloadText,
  webSaveCredential,
  webRefreshOpenRouterModels,
} from "../api/web";
import {
  applyWebAppearance,
  getWebPreferences,
  updateWebPreferences,
  type SubagentProfile,
  type WebPreferences,
} from "../api/webPreferences";
import { appState } from "../state/store";

const profiles = [
  "planning",
  "coding",
  "fast research",
  "document extraction",
  "verification",
  "private analysis",
];
const providers = [
  "openrouter",
  "openai",
  "anthropic",
  "google",
  "cerebras",
  "ollama",
  "lmstudio",
];

type SettingsTab = "model" | "web" | "subagents" | "behavior" | "appearance" | "keys";

function optionSelect(values: string[], current: string): HTMLSelectElement {
  const select = document.createElement("select");
  for (const value of values) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  }
  select.value = current;
  return select;
}

function numberInput(value: number, min: number, max: number, step = 1): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "number";
  input.value = String(value);
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  return input;
}

function checkbox(value: boolean): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = value;
  return input;
}

function field(labelText: string, control: HTMLElement, hint = "", span = false): HTMLLabelElement {
  const label = document.createElement("label");
  if (span) label.classList.add("settings-span-2");
  const text = document.createElement("span");
  text.textContent = labelText;
  label.append(text, control);
  if (hint) {
    const small = document.createElement("small");
    small.textContent = hint;
    label.appendChild(small);
  }
  return label;
}

function checkField(labelText: string, control: HTMLInputElement, hint = ""): HTMLLabelElement {
  const label = document.createElement("label");
  label.className = "settings-check";
  label.append(control, document.createTextNode(labelText));
  if (hint) label.title = hint;
  return label;
}

const parseDomains = (value: string) =>
  [...new Set(value.split(/[\n,]+/).map((item) => item.trim().toLowerCase()).filter(Boolean))];

export function openWebSettings() {
  document.querySelector(".settings-overlay")?.remove();

  const preferences = getWebPreferences();
  let workers: SubagentProfile[] = preferences.subagents.map((worker) => ({ ...worker }));

  const overlay = document.createElement("div");
  overlay.className = "settings-overlay";
  const panel = document.createElement("section");
  panel.className = "settings-panel settings-panel-v2";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "OpenPlanter Control Center");

  const title = document.createElement("h2");
  title.textContent = "Control Center";
  const close = document.createElement("button");
  close.textContent = "Close";
  close.className = "settings-close";
  close.onclick = () => overlay.remove();
  panel.append(title, close);

  const tabs = document.createElement("div");
  tabs.className = "settings-tabs";
  const panels = document.createElement("div");
  panels.className = "settings-panels";
  panel.append(tabs, panels);

  const tabDefinitions: Array<[SettingsTab, string]> = [
    ["model", "Model"],
    ["web", "Web"],
    ["subagents", "Subagents"],
    ["behavior", "Behavior"],
    ["appearance", "Appearance"],
    ["keys", "Keys & Limits"],
  ];
  const panelMap = new Map<SettingsTab, HTMLElement>();
  const buttonMap = new Map<SettingsTab, HTMLButtonElement>();

  const showTab = (id: SettingsTab) => {
    for (const [key, element] of panelMap) element.classList.toggle("active", key === id);
    for (const [key, element] of buttonMap) element.classList.toggle("active", key === id);
  };

  for (const [id, label] of tabDefinitions) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "settings-tab";
    button.textContent = label;
    button.onclick = () => showTab(id);
    tabs.appendChild(button);
    buttonMap.set(id, button);

    const tabPanel = document.createElement("section");
    tabPanel.className = "settings-tab-panel";
    tabPanel.dataset.tab = id;
    panels.appendChild(tabPanel);
    panelMap.set(id, tabPanel);
  }

  // Model
  const modelPanel = panelMap.get("model")!;
  const modelGrid = document.createElement("div");
  modelGrid.className = "settings-grid";
  modelPanel.appendChild(modelGrid);

  const provider = optionSelect(providers, appState.get().provider || "openrouter");
  provider.dataset.setting = "provider";
  const search = document.createElement("input");
  search.type = "search";
  search.placeholder = "Search live model catalog...";
  const model = document.createElement("select");
  model.setAttribute("aria-label", "AI model");
  model.dataset.setting = "model";
  const favorite = document.createElement("button");
  favorite.type = "button";
  favorite.textContent = "☆ Toggle favorite";
  const profile = optionSelect(profiles, localStorage.getItem("openplanter:profile") || profiles[0]);
  const reasoning = optionSelect(["off", "low", "medium", "high"], appState.get().reasoningEffort || "off");
  const temperature = numberInput(preferences.temperature, 0, 2, 0.1);
  temperature.dataset.setting = "temperature";
  const maxOutput = numberInput(preferences.maxOutputTokens, 256, 64000, 256);
  maxOutput.dataset.setting = "max-output";
  const allowFallbacks = checkbox(preferences.allowProviderFallbacks);
  allowFallbacks.dataset.setting = "allow-fallbacks";

  modelGrid.append(
    field("Provider", provider),
    field("Model search", search),
    field("Model", model, "OpenRouter uses one key across supported model families."),
    field("Task profile", profile),
    field("Reasoning effort", reasoning),
    field("Temperature", temperature),
    field("Max output tokens", maxOutput),
    checkField("Allow OpenRouter provider fallbacks", allowFallbacks)
  );

  const favorites = new Set<string>(JSON.parse(localStorage.getItem("openplanter:favorites") || "[]"));
  let allModels: { id: string; name: string | null }[] = [];
  const renderModels = (preferred = model.value || appState.get().model) => {
    const query = search.value.toLowerCase();
    const filtered = allModels.filter(
      (item) => item.id.toLowerCase().includes(query) || (item.name || "").toLowerCase().includes(query)
    );
    model.replaceChildren(
      ...filtered.map((item) => {
        const option = document.createElement("option");
        option.value = item.id;
        option.textContent = `${favorites.has(item.id) ? "★ " : ""}${item.id}`;
        return option;
      })
    );
    if (preferred && filtered.some((item) => item.id === preferred)) model.value = preferred;
  };

  const status = document.createElement("p");
  status.className = "settings-status";

  const loadModels = async () => {
    const preferred = provider.value === appState.get().provider ? appState.get().model : "";
    try {
      allModels = await listModels(provider.value);
      if (provider.value === "openrouter") {
        try {
          allModels = await webRefreshOpenRouterModels();
        } catch {
          status.textContent = "Live model refresh unavailable; using the built-in catalog.";
        }
      }
      renderModels(preferred);
    } catch {
      status.textContent = "Could not load models.";
    }
  };
  search.oninput = () => renderModels();
  provider.onchange = () => void loadModels();
  favorite.onclick = () => {
    if (!model.value) return;
    if (favorites.has(model.value)) favorites.delete(model.value);
    else favorites.add(model.value);
    localStorage.setItem("openplanter:favorites", JSON.stringify([...favorites]));
    renderModels(model.value);
  };
  modelGrid.appendChild(field("Favorites", favorite, "Pin frequently used model IDs.", true));

  // Web
  const webPanel = panelMap.get("web")!;
  const webGrid = document.createElement("div");
  webGrid.className = "settings-grid";
  webPanel.appendChild(webGrid);
  const webMode = optionSelect(["auto", "always", "off"], preferences.webSearchMode);
  webMode.dataset.setting = "web-search-mode";
  const fetchEnabled = checkbox(preferences.webFetchEnabled);
  const searchEngine = optionSelect(["auto", "native", "exa", "parallel"], preferences.webSearchEngine);
  const fetchEngine = optionSelect(["openrouter", "auto", "native", "exa", "parallel"], preferences.webFetchEngine);
  const maxResults = numberInput(preferences.maxSearchResults, 1, 20);
  const maxFetch = numberInput(preferences.maxFetchTokens, 2000, 50000, 1000);
  const allowedDomains = document.createElement("textarea");
  allowedDomains.value = preferences.allowedDomains.join("\n");
  allowedDomains.placeholder = "Optional: reuters.com\narxiv.org";
  const blockedDomains = document.createElement("textarea");
  blockedDomains.value = preferences.blockedDomains.join("\n");
  blockedDomains.placeholder = "Optional blocked domains";
  const citations = checkbox(preferences.citationsRequired);
  webGrid.append(
    field("Built-in web search", webMode, "Auto searches whenever freshness matters. Always searches every substantive request."),
    checkField("Enable web page fetch", fetchEnabled),
    field("Search engine", searchEngine, "Auto prefers provider-native search when available; otherwise OpenRouter can use its managed search providers."),
    field("Fetch engine", fetchEngine, "OpenRouter fetch does not require a separate user API key."),
    field("Results per search", maxResults),
    field("Max fetch tokens", maxFetch),
    field("Allowed domains", allowedDomains, "Comma or newline separated. Leave empty for the open web.", true),
    field("Blocked domains", blockedDomains, "Comma or newline separated.", true),
    checkField("Require source URLs / citations", citations)
  );
  const builtInNote = document.createElement("p");
  builtInNote.className = "settings-hint settings-span-2";
  builtInNote.textContent =
    "OpenRouter web search works without Exa or Firecrawl keys. Optional Exa/Firecrawl keys in Keys & Limits can add an extra retrieval layer when you want it.";
  webGrid.appendChild(builtInNote);

  // Subagents
  const subagentsPanel = panelMap.get("subagents")!;
  const subagentControls = document.createElement("div");
  subagentControls.className = "settings-grid";
  const subagentsEnabled = checkbox(preferences.subagentsEnabled);
  const maxDelegations = numberInput(preferences.maxDelegations, 1, 10);
  const delegationMode = optionSelect(["auto", "research-only"], preferences.delegationMode);
  subagentControls.append(
    checkField("Enable subagent delegation", subagentsEnabled),
    field("Max delegations / request", maxDelegations),
    field("Delegation mode", delegationMode)
  );
  subagentsPanel.appendChild(subagentControls);
  const subagentList = document.createElement("div");
  subagentList.className = "subagent-list";
  subagentsPanel.appendChild(subagentList);
  const addWorker = document.createElement("button");
  addWorker.type = "button";
  addWorker.dataset.action = "add-subagent";
  addWorker.textContent = "+ Add subagent";
  subagentsPanel.appendChild(addWorker);

  const renderWorkers = () => {
    subagentList.replaceChildren();
    workers.forEach((worker, index) => {
      const card = document.createElement("article");
      card.className = "subagent-card";
      card.dataset.workerId = worker.id;
      const header = document.createElement("div");
      header.className = "subagent-card-header";
      const heading = document.createElement("strong");
      heading.textContent = worker.name || `Worker ${index + 1}`;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "subagent-remove";
      remove.textContent = "Remove";
      remove.onclick = () => {
        workers = workers.filter((item) => item.id !== worker.id);
        renderWorkers();
      };
      header.append(heading, remove);

      const enabled = checkbox(worker.enabled);
      const name = document.createElement("input");
      name.value = worker.name;
      const workerModel = document.createElement("input");
      workerModel.value = worker.model;
      workerModel.placeholder = "Blank = parent model; or e.g. z-ai/glm-5.2";
      const instructions = document.createElement("textarea");
      instructions.value = worker.instructions;
      const effort = optionSelect(["off", "low", "medium", "high"], worker.reasoningEffort);
      const workerTemp = numberInput(worker.temperature, 0, 2, 0.1);
      const workerOutput = numberInput(worker.maxOutputTokens, 256, 64000, 256);
      const workerSearch = checkbox(worker.webSearch);
      const workerFetch = checkbox(worker.webFetch);

      enabled.onchange = () => (worker.enabled = enabled.checked);
      name.oninput = () => {
        worker.name = name.value;
        heading.textContent = name.value || `Worker ${index + 1}`;
      };
      workerModel.oninput = () => (worker.model = workerModel.value);
      instructions.oninput = () => (worker.instructions = instructions.value);
      effort.onchange = () => (worker.reasoningEffort = effort.value as SubagentProfile["reasoningEffort"]);
      workerTemp.oninput = () => (worker.temperature = Number(workerTemp.value));
      workerOutput.oninput = () => (worker.maxOutputTokens = Number(workerOutput.value));
      workerSearch.onchange = () => (worker.webSearch = workerSearch.checked);
      workerFetch.onchange = () => (worker.webFetch = workerFetch.checked);

      const instructionsField = field("Instructions", instructions, "The parent model passes only the delegated task into this isolated worker.");
      instructionsField.classList.add("subagent-instructions");
      card.append(
        header,
        checkField("Enabled", enabled),
        field("Name", name),
        field("Worker model", workerModel, "Each subagent can use a different OpenRouter model."),
        field("Reasoning", effort),
        field("Temperature preference", workerTemp, "Stored as worker guidance for server-managed subagents."),
        field("Output budget", workerOutput, "Stored as worker guidance for server-managed subagents."),
        checkField("Web search", workerSearch),
        checkField("Web fetch", workerFetch),
        instructionsField
      );
      subagentList.appendChild(card);
    });
  };
  addWorker.onclick = () => {
    workers.push({
      id: crypto.randomUUID(),
      name: `Worker ${workers.length + 1}`,
      enabled: false,
      model: "",
      instructions: "Research the delegated task independently and return concise evidence-backed findings.",
      reasoningEffort: "medium",
      temperature: 0.2,
      maxOutputTokens: 4000,
      webSearch: true,
      webFetch: true,
    });
    renderWorkers();
  };
  renderWorkers();

  // Behavior
  const behaviorPanel = panelMap.get("behavior")!;
  const behaviorGrid = document.createElement("div");
  behaviorGrid.className = "settings-grid";
  const autoScroll = checkbox(preferences.autoScroll);
  const diagnostics = checkbox(preferences.showRunDiagnostics);
  const compactSummary = checkbox(preferences.compactRunSummary);
  behaviorGrid.append(
    checkField("Auto-scroll near the latest response", autoScroll),
    checkField("Show live run diagnostics", diagnostics),
    checkField("Keep one compact completion summary", compactSummary)
  );
  const behaviorHint = document.createElement("p");
  behaviorHint.className = "settings-hint settings-span-2";
  behaviorHint.textContent =
    "Browser diagnostics use one mutable status line. Desktop/Tauri can retain richer step history without flooding mobile chat.";
  behaviorGrid.appendChild(behaviorHint);
  behaviorPanel.appendChild(behaviorGrid);

  // Appearance
  const appearancePanel = panelMap.get("appearance")!;
  const appearanceGrid = document.createElement("div");
  appearanceGrid.className = "settings-grid";
  const theme = optionSelect(["dark", "light", "high-contrast"], preferences.theme);
  const accent = optionSelect(["blue", "cyan", "green", "violet", "amber"], preferences.accent);
  accent.dataset.setting = "accent";
  const fontScale = numberInput(preferences.fontScale, 0.9, 1.2, 0.05);
  const density = optionSelect(["comfortable", "compact"], preferences.density);
  const messageWidth = optionSelect(["full", "readable"], preferences.messageWidth);
  const compactToolbar = checkbox(preferences.compactToolbar);
  const reducedMotion = checkbox(preferences.reducedMotion);
  appearanceGrid.append(
    field("Theme", theme),
    field("Accent", accent),
    field("Font scale", fontScale),
    field("UI density", density),
    field("Message width", messageWidth),
    checkField("Compact toolbar", compactToolbar),
    checkField("Reduced motion", reducedMotion)
  );
  appearancePanel.appendChild(appearanceGrid);

  // Keys & limits
  const keysPanel = panelMap.get("keys")!;
  const keysGrid = document.createElement("div");
  keysGrid.className = "settings-grid";
  const key = document.createElement("input");
  key.type = "password";
  key.autocomplete = "off";
  key.placeholder = "Provider API key (stored in this browser)";
  const exaKey = document.createElement("input");
  exaKey.type = "password";
  exaKey.placeholder = "Exa API key (optional enhancement)";
  const firecrawlKey = document.createElement("input");
  firecrawlKey.type = "password";
  firecrawlKey.placeholder = "Firecrawl API key (optional enhancement)";
  const limit = document.createElement("input");
  limit.type = "number";
  limit.min = "0";
  limit.step = "1";
  limit.placeholder = "Daily spend limit (USD)";
  limit.value = localStorage.getItem("openplanter:spend-limit") || "";
  keysGrid.append(
    field("Provider API key", key, "Stored in local browser storage in the current web architecture.", true),
    field("Exa research key", exaKey, "Optional. Built-in OpenRouter web search does not need this."),
    field("Firecrawl research key", firecrawlKey, "Optional. Built-in OpenRouter web search does not need this."),
    field("Daily spend limit", limit)
  );
  const keysNote = document.createElement("p");
  keysNote.className = "settings-hint settings-span-2";
  keysNote.textContent =
    "OpenRouter web search works without Exa or Firecrawl keys. Those credentials only add optional retrieval context.";
  keysGrid.appendChild(keysNote);
  keysPanel.appendChild(keysGrid);

  panel.appendChild(status);
  const actions = document.createElement("div");
  actions.className = "settings-actions";
  const save = document.createElement("button");
  save.type = "button";
  save.textContent = "Save settings";
  save.className = "settings-save";
  const exportBtn = document.createElement("button");
  exportBtn.type = "button";
  exportBtn.textContent = "Download chat";
  exportBtn.onclick = () =>
    downloadText(
      "openplanter-report.md",
      appState.get().messages.map((message) => `## ${message.role}\n\n${message.content}`).join("\n\n")
    );
  actions.append(save, exportBtn);
  panel.appendChild(actions);

  save.onclick = async () => {
    try {
      const partial: any = { provider: provider.value, model: model.value };
      if (reasoning.value !== "off") partial.reasoning_effort = reasoning.value;
      const config = await updateConfig(partial);
      appState.update((state) => ({
        ...state,
        provider: config.provider,
        model: config.model,
        reasoningEffort: config.reasoning_effort,
      }));

      const nextPreferences: Partial<WebPreferences> = {
        webSearchMode: webMode.value as WebPreferences["webSearchMode"],
        webFetchEnabled: fetchEnabled.checked,
        webSearchEngine: searchEngine.value as WebPreferences["webSearchEngine"],
        webFetchEngine: fetchEngine.value as WebPreferences["webFetchEngine"],
        maxSearchResults: Number(maxResults.value),
        maxFetchTokens: Number(maxFetch.value),
        allowedDomains: parseDomains(allowedDomains.value),
        blockedDomains: parseDomains(blockedDomains.value),
        citationsRequired: citations.checked,
        subagentsEnabled: subagentsEnabled.checked,
        maxDelegations: Number(maxDelegations.value),
        delegationMode: delegationMode.value as WebPreferences["delegationMode"],
        subagents: workers,
        temperature: Number(temperature.value),
        maxOutputTokens: Number(maxOutput.value),
        allowProviderFallbacks: allowFallbacks.checked,
        autoScroll: autoScroll.checked,
        showRunDiagnostics: diagnostics.checked,
        compactRunSummary: compactSummary.checked,
        theme: theme.value as WebPreferences["theme"],
        accent: accent.value as WebPreferences["accent"],
        fontScale: Number(fontScale.value),
        density: density.value as WebPreferences["density"],
        messageWidth: messageWidth.value as WebPreferences["messageWidth"],
        compactToolbar: compactToolbar.checked,
        reducedMotion: reducedMotion.checked,
      };
      const savedPreferences = updateWebPreferences(nextPreferences);
      applyWebAppearance(savedPreferences);

      if (key.value) webSaveCredential(provider.value, key.value);
      if (exaKey.value) webSaveCredential("exa", exaKey.value);
      if (firecrawlKey.value) webSaveCredential("firecrawl", firecrawlKey.value);
      localStorage.setItem("openplanter:profile", profile.value);
      localStorage.setItem("openplanter:spend-limit", limit.value);
      localStorage.setItem("openplanter:theme", savedPreferences.theme);
      status.textContent = "Saved locally. Built-in web and subagent settings apply to the next request.";
      key.value = "";
      exaKey.value = "";
      firecrawlKey.value = "";
    } catch (error) {
      console.error("Settings save failed:", error);
      status.textContent = "Settings could not be saved.";
    }
  };

  overlay.appendChild(panel);
  overlay.onclick = (event) => {
    if (event.target === overlay) overlay.remove();
  };
  document.body.appendChild(overlay);
  showTab("model");
  void loadModels();
}
