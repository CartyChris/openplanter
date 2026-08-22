import { appState } from "../state/store";
import { downloadText } from "../api/web";

export function openWorkspaceTools() {
  const overlay = document.createElement("div"); overlay.className = "settings-overlay";
  const panel = document.createElement("section"); panel.className = "settings-panel"; panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "Research workspace");
  const title = document.createElement("h2"); title.textContent = "Research workspace"; panel.appendChild(title);
  const evidence = document.createElement("textarea"); evidence.placeholder = "Claim or evidence note..."; evidence.rows = 4;
  const list = document.createElement("div"); list.className = "workspace-evidence-list";
  const stored = JSON.parse(localStorage.getItem("openplanter:evidence") || "[]") as { text: string; contradiction: boolean }[];
  const render = () => { list.replaceChildren(...stored.map((item, i) => { const row = document.createElement("div"); row.className = "workspace-evidence"; row.textContent = `${item.contradiction ? "CONTRADICTION · " : ""}${item.text}`; row.onclick = () => { stored[i].contradiction = !stored[i].contradiction; localStorage.setItem("openplanter:evidence", JSON.stringify(stored)); render(); }; return row; })); };
  const add = document.createElement("button"); add.textContent = "Add evidence note"; add.onclick = () => { if (!evidence.value.trim()) return; stored.push({ text: evidence.value.trim(), contradiction: false }); localStorage.setItem("openplanter:evidence", JSON.stringify(stored)); evidence.value = ""; render(); };
  const exportBtn = document.createElement("button"); exportBtn.textContent = "Download evidence + report"; exportBtn.onclick = () => { const notes = stored.map((x) => `- ${x.contradiction ? "[CONTRADICTION] " : ""}${x.text}`).join("\n"); const chat = appState.get().messages.map((m) => `## ${m.role}\n\n${m.content}`).join("\n\n"); downloadText("openplanter-research-report.md", `# OpenPlanter Research Report\n\n## Evidence ledger\n${notes || "No evidence notes yet."}\n\n## Session\n${chat}`); };
  const close = document.createElement("button"); close.textContent = "Close"; close.onclick = () => overlay.remove();
  panel.append(evidence, add, list, exportBtn, close); overlay.appendChild(panel); overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); }; document.body.appendChild(overlay); render();
}
