import { appState } from "../state/store";
import { downloadText, getWebBackup } from "../api/web";
import { buildResearchGraph, getNodeProvenance } from "../api/researchGraph";
import { runTelemetrySchema, safeSourceUrl } from "../api/runTelemetry";

export function openWebDashboard() {
  const previousFocus = document.activeElement as HTMLElement | null;
  const overlay = document.createElement("div");
  overlay.className = "settings-overlay";
  const panel = document.createElement("section");
  panel.className = "settings-panel settings-panel-v2 research-dashboard";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-label", "Sources and activity");
  const title = document.createElement("h2");
  title.textContent = "Sources & activity";
  const close = document.createElement("button");
  close.className = "settings-close";
  close.textContent = "Close";
  const tabs = document.createElement("nav");
  tabs.className = "settings-tabs";
  tabs.setAttribute("aria-label", "Research activity views");
  const body = document.createElement("div");
  body.className = "settings-panels research-activity-body";
  const summary = document.createElement("p");
  summary.className = "catalog-details";
  const filter = document.createElement("input");
  filter.type = "search";
  filter.placeholder = "Filter sources, prompts or tools";
  filter.setAttribute("aria-label", "Filter research activity");
  const scope = document.createElement("select");
  scope.setAttribute("aria-label", "Research scope");
  for (const [value, label] of [["session", "Current thread"], ["all", "All threads"]]) {
    const option = document.createElement("option"); option.value = value; option.textContent = label; scope.append(option);
  }
  const controls = document.createElement("div"); controls.className = "catalog-controls"; controls.append(scope, filter);
  const list = document.createElement("div"); list.className = "research-activity-list";
  body.append(summary, controls, list);
  const actions = document.createElement("div"); actions.className = "settings-actions";
  const exportButton = document.createElement("button"); exportButton.textContent = "Export activity";
  exportButton.onclick = () => downloadText("openplanter-activity.txt", list.innerText);
  const stop = document.createElement("button"); stop.textContent = "Stop research";
  stop.onclick = () => window.dispatchEvent(new CustomEvent("agent-cancel"));
  actions.append(exportButton, stop);
  panel.append(title, close, tabs, body, actions); overlay.append(panel);
  let active = "Sources";
  const tabButtons = new Map<string, HTMLButtonElement>();
  for (const name of ["Sources", "Search history", "Telemetry"]) {
    const button = document.createElement("button"); button.className = "settings-tab"; button.textContent = name;
    button.onclick = () => { active = name; render(); };
    tabs.append(button); tabButtons.set(name, button);
  }
  const card = (heading: string, text: string) => {
    const item = document.createElement("article"); item.className = "research-activity-card";
    const title = document.createElement("h3"); title.textContent = heading;
    const detail = document.createElement("p"); detail.textContent = text; item.append(title, detail);
    return item;
  };
  function render() {
    const state = appState.get();
    const store = getWebBackup();
    const current = scope.value === "session";
    const entries = Object.entries(store.history).filter(([id]) => !current || id === state.sessionId).flatMap(([sessionId, rows]) => rows.map((row) => ({ ...row, sessionId })));
    const runs = entries.filter((entry) => entry.role === "telemetry").flatMap((entry) => {
      try { const parsed = runTelemetrySchema.safeParse(JSON.parse(entry.content)); return parsed.success ? [parsed.data] : []; } catch { return []; }
    }).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    const documents = store.documents.filter((doc) => !current || doc.name.startsWith(`sessions/${state.sessionId}/`) || doc.name.startsWith("evidence/"));
    const graph = buildResearchGraph(documents);
    const citations = graph.nodes.filter((node) => node.category === "citation");
    summary.textContent = `${citations.length} cited URLs · ${documents.length} documents · ${runs.length} recorded runs${state.isRunning ? " · Research in progress" : ""}. ${current ? "Current thread and shared evidence." : "All workspace research."}`;
    stop.disabled = !state.isRunning;
    for (const [name, button] of tabButtons) { button.classList.toggle("active", name === active); button.setAttribute("aria-pressed", String(name === active)); }
    list.replaceChildren();
    const query = filter.value.toLowerCase();
    const append = (item: HTMLElement) => { if (!query || item.textContent?.toLowerCase().includes(query)) list.append(item); };
    if (active === "Sources") {
      for (const source of citations) {
        const evidence = getNodeProvenance(graph, source.id).filter((node) => node.category !== "citation");
        const item = card(source.label, `${evidence.length} linked documents. Citation present; not independently verified.`);
        const link = document.createElement("a"); link.textContent = source.path; link.href = safeSourceUrl(source.path)!; link.target = "_blank"; link.rel = "noopener noreferrer"; item.append(link);
        const details = document.createElement("details"); const heading = document.createElement("summary"); heading.textContent = "Linked evidence"; details.append(heading);
        for (const doc of evidence) { const p = document.createElement("p"); p.textContent = doc.path; details.append(p); }
        item.append(details); append(item);
      }
      for (const doc of documents) {
        const item = card(doc.name, `Workspace document · captured ${new Date(doc.createdAt).toLocaleString()}`);
        const details = document.createElement("details"); const heading = document.createElement("summary"); heading.textContent = "Read document";
        const text = document.createElement("p"); text.textContent = doc.content; details.append(heading, text); item.append(details); append(item);
      }
    } else if (active === "Search history") {
      const note = card("Visibility of searches", "Research prompts are not search queries. Only provider-exposed tool requests are listed below; hosted searches may not be returned by the provider. A requested tool call is not proof it ran."); list.append(note);
      for (const run of runs) {
        for (const call of run.toolCalls.filter((call) => /search|fetch|browse/i.test(call.name))) append(card(`${call.name} · ${new Date(run.timestamp).toLocaleString()}`, call.arguments || "No arguments exposed"));
      }
      for (const entry of entries.filter((entry) => entry.role === "user").reverse()) append(card(`Research prompt · ${new Date(entry.timestamp).toLocaleString()}`, entry.content));
    } else {
      list.append(card("Observed telemetry only", "Token usage is shown only when returned by the provider. Hidden reasoning and unreported hosted-tool activity are not available. Older runs may have no telemetry."));
      for (const run of runs) {
        const item = card(`${run.status} · ${(run.elapsedMs / 1000).toFixed(1)}s`, `${new Date(run.timestamp).toLocaleString()} · ${run.provider}/${run.model}\n${run.usage ? `${run.usage.input.toLocaleString()} input / ${run.usage.output.toLocaleString()} output tokens (provider-reported)` : "Token usage not reported"}\n${run.citations.length} provider citation annotations · ${run.toolCalls.length} exposed tool requests${run.error ? `\n${run.error}` : ""}`);
        const details = document.createElement("details"); const heading = document.createElement("summary"); heading.textContent = "Request & tool activity"; details.append(heading);
        const text = document.createElement("p"); text.textContent = run.objective; details.append(text);
        for (const call of run.toolCalls) { const text = document.createElement("p"); text.textContent = `${call.name}: ${call.arguments}`; details.append(text); }
        item.append(details); append(item);
      }
    }
    if (!list.childElementCount || (active !== "Sources" && list.childElementCount === 1)) list.append(card("No matching records", "Run a research request or adjust the thread scope and filter. No activity is fabricated."));
  }
  filter.oninput = render; scope.onchange = render;
  const unsubscribe = appState.subscribe(render);
  window.addEventListener("research-activity-updated", render);
  window.addEventListener("knowledge-graph-updated", render);
  const dismiss = () => { unsubscribe(); window.removeEventListener("research-activity-updated", render); window.removeEventListener("knowledge-graph-updated", render); overlay.remove(); previousFocus?.focus(); };
  close.onclick = dismiss;
  overlay.onclick = (event) => { if (event.target === overlay) dismiss(); };
  overlay.onkeydown = (event) => {
    if (event.key === "Escape") { event.stopPropagation(); dismiss(); }
    if (event.key !== "Tab") return;
    const controls = [...panel.querySelectorAll<HTMLElement>("button:not(:disabled), input, select, a, summary")].filter((item) => item.getClientRects().length);
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };
  document.body.append(overlay); render(); close.focus();
}
