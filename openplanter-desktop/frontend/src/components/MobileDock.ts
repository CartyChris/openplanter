export interface MobileDockActions {
  newSession(): Promise<void> | void;
  renderThreads(container: HTMLElement): Promise<void> | void;
  openResearch(): void;
  openSettings(): void;
  openDashboard(): void;
}

function button(label: string, action: string, onClick: () => void): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.textContent = label;
  el.dataset.action = action;
  el.setAttribute("aria-label", label);
  el.addEventListener("click", onClick);
  return el;
}

function openSheet(titleText: string): { backdrop: HTMLElement; sheet: HTMLElement; body: HTMLElement } {
  document.querySelector(".mobile-sheet-backdrop")?.remove();

  const backdrop = document.createElement("div");
  backdrop.className = "mobile-sheet-backdrop";

  const sheet = document.createElement("section");
  sheet.className = "mobile-sheet";
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-modal", "true");
  sheet.setAttribute("aria-label", titleText);

  const header = document.createElement("header");
  header.className = "mobile-sheet-header";
  const title = document.createElement("strong");
  title.textContent = titleText;
  const close = button("Close", "close-sheet", () => backdrop.remove());
  header.append(title, close);

  const body = document.createElement("div");
  body.className = "mobile-sheet-body";
  sheet.append(header, body);
  backdrop.appendChild(sheet);
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) backdrop.remove();
  });
  document.body.appendChild(backdrop);
  return { backdrop, sheet, body };
}

export function createMobileDock(actions: MobileDockActions): HTMLElement {
  const dock = document.createElement("nav");
  dock.className = "mobile-dock";
  dock.setAttribute("aria-label", "OpenPlanter mobile actions");

  const newButton = button("New", "new-session", () => void actions.newSession());
  const threadsButton = button("Threads", "threads", () => {
    const { backdrop, body } = openSheet("Threads");
    const create = document.createElement("button");
    create.type = "button";
    create.className = "mobile-new-session";
    create.textContent = "+ New Session";
    create.addEventListener("click", () => {
      void actions.newSession();
      backdrop.remove();
    });
    const list = document.createElement("div");
    list.className = "mobile-session-list";
    body.append(create, list);
    void actions.renderThreads(list);
  });
  const researchButton = button("Research", "research", actions.openResearch);
  const settingsButton = button("Settings", "settings", actions.openSettings);
  const moreButton = button("More", "more", () => {
    const { backdrop, body } = openSheet("More");
    const dashboard = button("Dashboard", "dashboard", () => {
      backdrop.remove();
      actions.openDashboard();
    });
    const hint = document.createElement("p");
    hint.className = "mobile-sheet-hint";
    hint.textContent = "Desktop graph and advanced workspace views remain available from Dashboard/Research.";
    body.append(dashboard, hint);
  });

  dock.append(newButton, threadsButton, researchButton, settingsButton, moreButton);
  return dock;
}
