import { expect, it } from "vitest";
import { buildResearchGraph, getNodeProvenance } from "./researchGraph";
const document = (name: string, content: string) => ({ name, content, createdAt: "2026-10-27" });
it("connects explicit entities and deduplicated citations to source documents", () => {
  const graph = buildResearchGraph([document("a.md", "[[Example Company]] cites https://example.com/report. Again https://example.com/report")]);
  expect(graph.nodes).toHaveLength(3); expect(graph.edges).toHaveLength(2);
  expect(graph.edges.map((edge) => edge.label)).toEqual(["mentions", "cites"]);
  expect(graph.nodes.find((node) => node.category === "citation")?.path).toBe("https://example.com/report");
});
it("keeps document IDs stable across reorder and deletion", () => {
  const a = document("a.md", "A"), b = document("b.md", "B");
  expect(buildResearchGraph([a, b]).nodes[1].id).toBe(buildResearchGraph([b]).nodes[0].id);
});
it("lists all supporting documents and their citations without unrelated entities", () => {
  const graph = buildResearchGraph([
    document("a.md", "[[Company]] https://example.com/a"),
    document("b.md", "[[Company]] https://example.com/b"),
    document("c.md", "[[Unrelated]] https://example.com/c"),
  ]);
  const sources = getNodeProvenance(graph, "entity:company");
  expect(sources.map((node) => node.path).sort()).toEqual(["a.md", "b.md", "https://example.com/a", "https://example.com/b"]);
});
it("terminates on cyclic explicit references", () => {
  const graph = buildResearchGraph([document("a.md", "[b](b.md) [[Company]]"), document("b.md", "[a](a.md) https://example.com/b")]);
  expect(getNodeProvenance(graph, "entity:company")).toHaveLength(3);
});
it("does not invent relationships from filename substrings", () => {
  expect(buildResearchGraph([document("a.md", "This mentions a letter b"), document("b.md", "")]).edges).toEqual([]);
});
it("preserves explicit document-reference provenance", () => {
  const graph = buildResearchGraph([document("a.md", "[See source](b.md)"), document("b.md", "# Contradiction\n\nA claim")]);
  expect(graph.edges).toEqual([{ source: "document:a.md", target: "document:b.md", label: "references" }]);
  expect(graph.nodes[1].category).toBe("contradiction");
});
