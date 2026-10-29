import { test } from "node:test";
import assert from "node:assert/strict";
import { workspaceWrite } from "./workspace-schema.js";

const valid = { revision: 0, data: { sessions: [], history: {}, documents: [] } };
test("accepts an empty private workspace", () => assert.equal(workspaceWrite.safeParse(valid).success, true));
test("rejects credentials in cloud snapshots", () => assert.equal(workspaceWrite.safeParse({ ...valid, data: { ...valid.data, credentials: { openrouter: "should-never-upload" } } }).success, false));
test("rejects caller-supplied ownership", () => assert.equal(workspaceWrite.safeParse({ ...valid, userId: "another-user" }).success, false));
test("rejects invalid revisions", () => {
  for (const revision of [-1, 1.5, "1"]) assert.equal(workspaceWrite.safeParse({ ...valid, revision }).success, false);
});
test("retains findings and session history", () => {
  const data = { sessions: [{ id: "case-1", created_at: "2026-10-27", turn_count: 1, last_objective: "Research" }], history: { "case-1": [{ seq: 1, timestamp: "2026-10-27", role: "assistant", content: "Finding" }] }, documents: [{ name: "finding.md", content: "# Finding", createdAt: "2026-10-27" }] };
  assert.deepEqual(workspaceWrite.parse({ revision: 1, data }).data, data);
});
