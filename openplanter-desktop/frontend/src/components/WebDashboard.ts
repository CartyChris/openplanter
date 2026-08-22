import { appState } from "../state/store";
import { downloadText } from "../api/web";

export function openWebDashboard() {
  const overlay = document.createElement("div"); overlay.className = "settings-overlay";
  const panel = document.createElement("section"); panel.className = "settings-panel"; panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "Agent dashboard");
  const title = document.createElement("h2"); title.textContent = "Agent dashboard"; panel.appendChild(title);
  const summary = document.createElement("div"); const timeline = document.createElement("div"); timeline.className = "workspace-evidence-list"; panel.append(summary, timeline);
  const pause = document.createElement("button"); pause.textContent = "Pause / stop"; pause.onclick = () => window.dispatchEvent(new CustomEvent("agent-cancel"));
  const exportBtn = document.createElement("button"); exportBtn.textContent = "Export timeline"; exportBtn.onclick = () => downloadText("openplanter-timeline.md", appState.get().messages.filter((m) => m.role === "assistant" || m.role === "tool").map((m) => `- ${m.timestamp ? new Date(m.timestamp).toISOString() : ""} ${m.content}`).join("\n"));
  const close = document.createElement("button"); close.textContent = "Close"; close.onclick = () => overlay.remove(); panel.append(pause, exportBtn, close);
  const render = () => { const s = appState.get(); summary.textContent = `Step ${s.currentStep} · depth ${s.currentDepth} · ${s.inputTokens + s.outputTokens} tokens`; timeline.replaceChildren(...s.messages.slice(-12).map((m) => { const row = document.createElement("div"); row.className = "workspace-evidence"; row.textContent = `${m.role}: ${m.content.slice(0, 180)}`; return row; })); };
  overlay.appendChild(panel); overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); }; document.body.appendChild(overlay); render(); const unsubscribe = appState.subscribe(render); overlay.addEventListener("remove", unsubscribe, { once: true });
}
