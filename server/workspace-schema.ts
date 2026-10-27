import { z } from "zod";
const short = z.string().max(500);
export const workspaceData = z.object({
  sessions: z.array(z.object({ id: short, created_at: short, turn_count: z.number().int().nonnegative(), last_objective: z.string().max(100000).nullable() })).max(1000),
  history: z.record(z.string().max(500), z.array(z.object({ seq: z.number().int(), timestamp: short, role: short, content: z.string().max(500000), tool_name: short.optional(), is_rendered: z.boolean().optional(), step_number: z.number().optional(), step_tokens_in: z.number().optional(), step_tokens_out: z.number().optional(), step_elapsed: z.number().optional(), step_model_preview: z.string().max(500000).optional(), step_tool_calls: z.array(z.object({ name: short, key_arg: z.string().max(500000), elapsed: z.number() })).max(1000).optional() })).max(500)),
  documents: z.array(z.object({ name: short, content: z.string().max(500000), createdAt: short })).max(2000),
}).strict();
export const workspaceWrite = z.object({ revision: z.number().int().nonnegative(), data: workspaceData }).strict();
