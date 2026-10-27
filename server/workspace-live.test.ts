import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { pgSchema, text } from "drizzle-orm/pg-core";
import type { VercelRequest, VercelResponse } from "@vercel/node";

test("live cloud storage enforces sessions, ownership, origin, and revisions", { skip: process.env.OPENPLANTER_LIVE_TESTS !== "1" }, async () => {
  const { auth } = await import("./auth.js");
  const { db, pool, workspaces } = await import("./db.js");
  const { default: handler } = await import("../api/workspace.js");
  const users = pgSchema("openplanter").table("user", { id: text("id") });
  const created: string[] = [];
  async function account() {
    const response = await auth.api.signUpEmail({ body: { email: `validation-${randomUUID()}@example.com`, password: randomUUID() + randomUUID(), name: "Temporary storage test" }, asResponse: true });
    assert.equal(response.status, 200);
    const body = await response.json(); created.push(body.user.id);
    return response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
  }
  async function call(cookie: string, method = "GET", body?: unknown, origin = "http://localhost:3000") {
    let status = 200; let payload: any;
    const req = { method, headers: { cookie, origin, "content-type": "application/json" }, body } as unknown as VercelRequest;
    const res = { setHeader() {}, status(code: number) { status = code; return this; }, json(data: unknown) { payload = data; return this; } } as unknown as VercelResponse;
    await handler(req, res); return { status, payload };
  }
  try {
    assert.equal((await call("")).status, 401);
    const first = await account(); const second = await account();
    const snapshot = { revision: 0, data: { sessions: [], history: {}, documents: [{ name: "test.md", content: "Synthetic verification finding", createdAt: new Date().toISOString() }] } };
    assert.equal((await call(first, "PUT", snapshot)).status, 200);
    assert.equal((await call(first)).payload.data.documents[0].name, "test.md");
    assert.equal((await call(second)).payload.data, null);
    assert.equal((await call(first, "PUT", snapshot)).status, 409);
    assert.equal((await call(first, "PUT", { ...snapshot, revision: 1 }, "https://untrusted.example")).status, 403);
    await auth.api.signOut({ headers: new Headers({ cookie: first }) });
    assert.equal((await call(first)).status, 401);
  } finally {
    for (const id of created) {
      await db.delete(workspaces).where(eq(workspaces.userId, id));
      await db.delete(users).where(eq(users.id, id));
    }
    await pool.end();
  }
});
