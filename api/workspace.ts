import type { VercelRequest, VercelResponse } from "@vercel/node";
import { fromNodeHeaders } from "better-auth/node";
import { and, eq } from "drizzle-orm";
import { auth } from "../server/auth.js";
import { db, workspaces } from "../server/db.js";
import { workspaceWrite } from "../server/workspace-schema.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "GET" && req.method !== "PUT") {
    res.setHeader("Allow", "GET, PUT");
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (!session) return res.status(401).json({ error: "Sign in to access private research." });
    const userId = session.user.id;
    const expectedOwner = req.headers["x-workspace-owner"];
    if ((req.method === "PUT" || expectedOwner) && expectedOwner !== userId) {
      return res.status(409).json({ error: "The signed-in account changed. Export unsaved research, then reload before saving." });
    }
    if (req.method === "GET") {
      const [workspace] = await db.select({ data: workspaces.data, revision: workspaces.revision, updatedAt: workspaces.updatedAt }).from(workspaces).where(eq(workspaces.userId, userId));
      return res.status(200).json(workspace ?? { data: null, revision: 0 });
    }
    const origin = req.headers.origin;
    const allowed = (await auth.$context).trustedOrigins;
    if (!origin || !allowed.includes(origin)) return res.status(403).json({ error: "Untrusted request origin" });
    if (!req.headers["content-type"]?.startsWith("application/json")) return res.status(415).json({ error: "JSON required" });
    if (Buffer.byteLength(JSON.stringify(req.body ?? {})) > 3_000_000) return res.status(413).json({ error: "Workspace exceeds the 3 MB limit. Export older research before saving." });
    const parsed = workspaceWrite.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid research workspace" });
    const { data, revision } = parsed.data;
    const updatedAt = new Date();
    const result = revision === 0
      ? await db.insert(workspaces).values({ userId, data, revision: 1, updatedAt }).onConflictDoNothing().returning({ revision: workspaces.revision })
      : await db.update(workspaces).set({ data, revision: revision + 1, updatedAt }).where(and(eq(workspaces.userId, userId), eq(workspaces.revision, revision))).returning({ revision: workspaces.revision });
    if (!result.length) return res.status(409).json({ error: "A newer cloud revision exists. Load it before saving to avoid overwriting another device." });
    return res.status(200).json({ revision: result[0].revision, updatedAt });
  } catch (error) {
    console.error("Workspace operation failed", error instanceof Error ? error.name : "Unknown error");
    return res.status(500).json({ error: "Research storage is unavailable. Your local workspace has not been changed." });
  }
}
