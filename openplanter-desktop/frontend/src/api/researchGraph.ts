import type { GraphData } from "./types";

type SourceDocument = { name: string; content: string; createdAt: string };

export function getNodeProvenance(graph: GraphData, nodeId: string): GraphData["nodes"] {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const incoming = new Map<string, string[]>();
  const citations = new Map<string, string[]>();
  for (const edge of graph.edges) {
    incoming.set(edge.target, [...(incoming.get(edge.target) || []), edge.source]);
    if (edge.label === "cites" || edge.label === "references") citations.set(edge.source, [...(citations.get(edge.source) || []), edge.target]);
  }
  const visited = new Set<string>();
  const sources = new Map<string, GraphData["nodes"][number]>();
  const queue = [nodeId];
  while (queue.length) {
    const id = queue.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const node = nodes.get(id);
    if (!node) continue;
    if (node.node_type === "source") sources.set(id, node);
    if (node.parent_id) queue.push(node.parent_id);
    queue.push(...(incoming.get(id) || []));
  }
  // Include citations from supporting documents, not unrelated entities sharing them.
  const references = [...sources.keys()];
  const followed = new Set<string>();
  while (references.length) {
    const id = references.pop()!;
    if (followed.has(id)) continue;
    followed.add(id);
    for (const target of citations.get(id) || []) {
      const node = nodes.get(target);
      if (node?.node_type === "source") { sources.set(target, node); references.push(target); }
    }
  }
  return [...sources.values()];
}

export function buildResearchGraph(documents: SourceDocument[]): GraphData {
  const nodes = new Map<string, GraphData["nodes"][number]>();
  const edges = new Map<string, GraphData["edges"][number]>();
  const link = (source: string, target: string, label: string) => {
    if (source !== target) edges.set(JSON.stringify([source, target, label]), { source, target, label });
  };
  const documentIds = new Map(documents.map((doc) => [doc.name, `document:${doc.name}`]));
  for (const doc of documents) {
    const id = documentIds.get(doc.name)!;
    nodes.set(id, { id, label: doc.name.split("/").pop()!, category: doc.content.startsWith("# Contradiction") ? "contradiction" : "document", path: doc.name, node_type: "source", content: doc.content });
    for (const match of doc.content.matchAll(/\[\[([^\]\n]{1,200})\]\]/g)) {
      const label = match[1].trim();
      if (!label) continue;
      const target = documentIds.get(label) || `entity:${label.toLowerCase()}`;
      if (!documentIds.has(label)) nodes.set(target, { id: target, label, category: "entity", path: "", node_type: "section", content: `Explicitly mentioned in evidence. Follow incoming edges to inspect the source documents; a mention does not establish a relationship as fact.` });
      link(id, target, "mentions");
    }
    for (const match of doc.content.matchAll(/https?:\/\/[^\s<>"\]]+/g)) {
      try {
        const url = new URL(match[0].replace(/[).,;!?]+$/, ""));
        if (url.username || url.password) continue;
        url.hash = "";
        const target = `url:${url.href}`;
        nodes.set(target, { id: target, label: url.hostname + (url.pathname === "/" ? "" : url.pathname), category: "citation", path: url.href, node_type: "source", content: `Cited URL: ${url.href}\nCaptured in a finding at ${doc.createdAt}. Citation presence does not verify the source or its claims.` });
        link(id, target, "cites");
      } catch { /* Ignore malformed citations rather than inventing a source. */ }
    }
    for (const match of doc.content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const target = documentIds.get(match[1]);
      if (target) link(id, target, "references");
    }
  }
  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}
