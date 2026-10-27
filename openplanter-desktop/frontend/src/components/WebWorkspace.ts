import { appState } from "../state/store";
import { downloadText, webDocuments, webSaveDocument } from "../api/web";
import { openCloudWorkspace } from "./CloudWorkspace";

export function openWorkspaceTools() {
  const panel = document.createElement("dialog");
  panel.className = "research-workspace-dialog research-dialog";
  panel.setAttribute("aria-label", "Research workspace");
  Object.assign(panel.style, { width: "min(560px, calc(100vw - 24px))", maxHeight: "calc(100dvh - 24px)", overflowY: "auto", margin: "auto", padding: "20px", borderRadius: "12px", border: "1px solid var(--border)", background: "var(--bg-secondary)", color: "var(--text-primary)" });
  const title = document.createElement("h2"); title.textContent = "Research workspace";
  const cloud = document.createElement("button"); cloud.textContent = "Private cloud storage"; cloud.style.minHeight = "44px"; cloud.onclick = openCloudWorkspace;
  const hint = document.createElement("p"); hint.textContent = "Capture a claim and its source URL. Use [[Entity name]] to connect evidence in the graph. Marking a contradiction records your assessment; it does not verify the claim.";
  const evidence = document.createElement("textarea"); evidence.placeholder = "Claim, [[entity]], and source URL…"; evidence.setAttribute("aria-label", "Evidence note"); evidence.rows = 4; evidence.style.fontSize = "16px";
  const list = document.createElement("div"); list.className = "workspace-evidence-list";
  const session = appState.get().sessionId;
  const prefix = session ? `sessions/${session}/evidence-` : "evidence/";
  const records = () => webDocuments().filter((doc) => doc.name.startsWith(prefix));
  const render = () => {
    list.replaceChildren(...records().map((doc) => {
      const row = document.createElement("button"); row.type = "button"; row.className = "workspace-evidence";
      row.style.minHeight = "44px"; row.style.textAlign = "left";
      const contradiction = doc.content.startsWith("# Contradiction\n");
      row.setAttribute("aria-pressed", String(contradiction));
      row.textContent = `${contradiction ? "CONTRADICTION · " : "EVIDENCE · "}${doc.content.replace(/^# (?:Evidence|Contradiction)\n\n/, "")}`;
      row.onclick = () => { webSaveDocument(doc.name, doc.content.replace(/^# (?:Evidence|Contradiction)/, contradiction ? "# Evidence" : "# Contradiction")); render(); };
      return row;
    }));
  };
  const add = document.createElement("button"); add.textContent = "Add evidence note"; add.style.minHeight = "44px";
  add.onclick = () => {
    if (!evidence.value.trim()) return;
    webSaveDocument(`${prefix}${crypto.randomUUID()}.md`, `# Evidence\n\n${evidence.value.trim()}`);
    evidence.value = ""; render();
  };
  const exportBtn = document.createElement("button"); exportBtn.textContent = "Download evidence + report"; exportBtn.style.minHeight = "44px";
  exportBtn.onclick = () => {
    const notes = records().map((doc) => doc.content).join("\n\n");
    const chat = appState.get().messages.map((message) => `## ${message.role}\n\n${message.content}`).join("\n\n");
    downloadText("openplanter-research-report.md", `# Research report\n\n## Evidence ledger\n${notes || "No evidence notes yet."}\n\n## Session\n${chat}`);
  };
  const close = document.createElement("button"); close.textContent = "Close"; close.style.minHeight = "44px"; close.onclick = () => panel.close();
  panel.append(title, cloud, hint, evidence, add, list, exportBtn, close);
  panel.addEventListener("close", () => panel.remove(), { once: true });
  document.body.append(panel); panel.showModal(); render();
}
