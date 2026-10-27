export type CloudState = "guest" | "saved" | "pending" | "saving" | "paused";
export class CloudSync<T> {
  state: CloudState = "guest";
  message = "Guest research is temporary. Sign in for cloud storage.";
  owner: string | null = null;
  private revision = 0;
  private pending: string | null = null;
  private saved = "";
  private running: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(private send: (data: T, revision: number, owner: string) => Promise<number>, private notify: () => void) {}
  connect(owner: string, revision: number, data: T) {
    if (this.running) throw new Error("Wait for the current cloud save to finish.");
    clearTimeout(this.timer);
    this.owner = owner; this.revision = revision; this.saved = JSON.stringify(data); this.pending = null;
    this.set("saved", `Cloud revision ${revision} loaded. Automatic saving is on.`);
  }
  enqueue(data: T) {
    const serialized = JSON.stringify(data);
    if (serialized === this.saved && !this.running) { this.pending = null; return; }
    this.pending = serialized;
    if (!this.owner) { this.set("guest", "Unsaved guest research. Sign in or export before leaving."); return; }
    if (this.state === "paused") return;
    this.set("pending", "Research changes waiting to save…");
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { void this.flush().catch(() => {}); }, 400);
  }
  discard() {
    if (this.running) throw new Error("Wait for the current cloud save to finish.");
    clearTimeout(this.timer); this.pending = null;
  }
  get unsaved() { return this.pending !== null || this.running !== null; }
  flush(): Promise<void> {
    clearTimeout(this.timer);
    if (this.running) return this.running;
    if (!this.owner) return Promise.reject(new Error("Sign in to save research."));
    if (this.state === "paused") return Promise.reject(new Error(this.message));
    this.running = this.drain().finally(() => { this.running = null; });
    return this.running;
  }
  retry(): Promise<void> {
    if (this.state === "paused") this.set("pending", "Retrying cloud save…");
    return this.flush();
  }
  private async drain() {
    while (this.pending !== null) {
      const snapshot = this.pending;
      this.pending = null;
      this.set("saving", "Saving research to your private account…");
      try {
        this.revision = await this.send(JSON.parse(snapshot) as T, this.revision, this.owner!);
        this.saved = snapshot;
      } catch (error) {
        if (this.pending === null) this.pending = snapshot;
        this.set("paused", error instanceof Error ? error.message : "Cloud save failed. Export your research before leaving.");
        throw error;
      }
    }
    this.set("saved", `All research saved. Cloud revision ${this.revision}.`);
  }
  private set(state: CloudState, message: string) { this.state = state; this.message = message; this.notify(); }
}

export async function cloudRequest(path: string, method = "GET", body?: unknown, owner?: string) {
  const response = await fetch(path, { method, credentials: "same-origin", signal: AbortSignal.timeout(15000), headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(owner ? { "X-Workspace-Owner": owner } : {}) }, body: body ? JSON.stringify(body) : undefined });
  if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("Cloud services are unavailable. Export unsaved research before leaving.");
  const data = await response.json();
  if (!response.ok) throw new Error(path.startsWith("/api/auth") ? "Authentication failed. Check your details and try again." : data.error || "Cloud request failed.");
  return data;
}
