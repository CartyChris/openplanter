import { z } from "zod";

export const runTelemetrySchema = z.object({
  id: z.string(), timestamp: z.string(), provider: z.string(), model: z.string(), objective: z.string(),
  status: z.enum(["running", "completed", "failed", "cancelled"]), elapsedMs: z.number(),
  error: z.string().optional(),
  usage: z.object({ input: z.number(), output: z.number() }).nullable(),
  citations: z.array(z.object({ url: z.string().url(), title: z.string() })),
  toolCalls: z.array(z.object({ name: z.string(), arguments: z.string() })),
});
export type RunTelemetry = z.infer<typeof runTelemetrySchema>;

export function safeSourceUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : null; }
  catch { return null; }
}

/** Collect only provider-exposed events; tool requests are not proof of execution. */
export function collectStreamTelemetry(chunk: any, run: RunTelemetry): string {
  if (!chunk || typeof chunk !== "object") return "";
  if (chunk.error) throw new Error(String(chunk.error.message || "Provider stream failed"));
  if (chunk.usage && Number.isFinite(chunk.usage.prompt_tokens) && Number.isFinite(chunk.usage.completion_tokens)) {
    run.usage = { input: chunk.usage.prompt_tokens, output: chunk.usage.completion_tokens };
  }
  const choice = chunk.choices?.[0];
  const delta = choice?.delta;
  for (const annotation of delta?.annotations || choice?.message?.annotations || []) {
    const citation = annotation.url_citation;
    const url = safeSourceUrl(citation?.url);
    if (url && !run.citations.some((item) => item.url === url)) run.citations.push({ url, title: typeof citation.title === "string" ? citation.title : url });
  }
  for (const call of delta?.tool_calls || []) {
    if (!Number.isInteger(call.index) || call.index < 0 || call.index > 30) continue;
    const existing = run.toolCalls[call.index] || { name: "", arguments: "" };
    if (typeof call.function?.name === "string") existing.name += call.function.name;
    if (typeof call.function?.arguments === "string") existing.arguments = (existing.arguments + call.function.arguments).slice(0, 8000);
    run.toolCalls[call.index] = existing;
  }
  return typeof delta?.content === "string" ? delta.content : "";
}
