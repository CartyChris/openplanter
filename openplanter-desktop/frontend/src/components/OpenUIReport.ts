import { createElement as h, useState } from "react";
import { createRoot } from "react-dom/client";
import { createLibrary, defineComponent, Renderer } from "@openuidev/react-lang";
import { z } from "zod/v4";

const reportProps = z.object({
  title: z.string(),
  summary: z.string(),
  findings: z.array(z.object({ claim: z.string(), status: z.enum(["supported", "unverified", "contradicted"]), source: z.string() })),
});
function Report({ props }: { props: z.infer<typeof reportProps> }) {
  const [filter, setFilter] = useState("all");
  const findings = props.findings || [];
  return h("section", { style: { display: "grid", gap: "16px", overflowWrap: "anywhere" } },
    h("h2", null, props.title), h("p", null, props.summary),
    h("p", null, "AI-generated synthesis. Status labels are model assessments, not independent verification. Review the cited evidence."),
    h("label", null, "Filter findings ", h("select", { value: filter, onChange: (event) => setFilter((event.target as HTMLSelectElement).value), style: { minHeight: "44px", fontSize: "16px" } },
      ...["all", "supported", "unverified", "contradicted"].map((value) => h("option", { key: value, value }, value)))),
    h("p", { role: "status" }, `${findings.filter((item) => filter === "all" || item.status === filter).length} findings shown`),
    ...findings.filter((item) => filter === "all" || item.status === filter).map((item, index) => {
      let source: string | null = null;
      try { const url = new URL(item.source); if (["https:", "http:"].includes(url.protocol) && !url.username && !url.password) source = url.href; } catch { /* Missing sources stay visible as unverified text. */ }
      return h("article", { key: index, style: { border: "1px solid #64748b", borderRadius: "8px", padding: "16px" } },
        h("strong", null, item.status), h("p", null, item.claim),
        source ? h("a", { href: source, target: "_blank", rel: "noopener noreferrer", style: { display: "inline-flex", alignItems: "center", minHeight: "44px", color: "#93c5fd" } }, "Review source") : h("p", null, "No valid source URL supplied"));
    }));
}
const ResearchReport = defineComponent({ name: "ResearchReport", description: "A filterable evidence report. Never invent sources or treat allegations as established facts.", props: reportProps, component: Report });
export const researchLibrary = createLibrary({ components: [ResearchReport], root: "ResearchReport" });
export function openUIInstructions() {
  return researchLibrary.prompt({ additionalRules: ["Return the complete OpenUI Lang program inside a single fenced openui code block. Use only cited findings from the research context. Mark unsupported claims unverified. Never invent URLs or personal data."], examples: ['root = ResearchReport("Research findings", "Evidence summary", [{claim: "A claim needing verification", status: "unverified", source: ""}])'] });
}
export function openOpenUIReport(source: string) {
  const dialog = document.createElement("dialog"); dialog.className = "research-dialog"; dialog.setAttribute("aria-label", "Interactive OpenUI research report");
  Object.assign(dialog.style, { width: "min(820px, calc(100vw - 24px))", maxHeight: "calc(100dvh - 24px)", overflowY: "auto", background: "var(--bg-secondary)", color: "var(--text-primary)", margin: "auto", padding: "20px", border: "1px solid #64748b", borderRadius: "12px" });
  const close = document.createElement("button"); close.textContent = "Close report"; close.style.minHeight = "44px"; close.onclick = () => dialog.close();
  const status = document.createElement("p"); status.setAttribute("role", "status");
  const container = document.createElement("div");
  dialog.append(close, status, container); document.body.append(dialog);
  const root = createRoot(container);
  root.render(h(Renderer, { response: source, library: researchLibrary, isStreaming: false, onError: (errors) => { status.textContent = errors.length ? "Some report content could not render. The original response remains available in chat." : ""; } }));
  dialog.addEventListener("close", () => { root.unmount(); dialog.remove(); }, { once: true });
  dialog.showModal(); close.focus();
}
