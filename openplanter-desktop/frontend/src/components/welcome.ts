import type { ChatMessage } from "../state/store";

export const SPLASH_ART = [
  " .oOo.      ___                   ____  _             _                .oOo. ",
  "oO.|.Oo    / _ \\ _ __   ___ _ __ |  _ \\| | __ _ _ __ | |_ ___ _ __    oO.|.Oo",
  "Oo.|.oO   | | | | '_ \\ / _ \\ '_ \\| |_) | |/ _` | '_ \\| __/ _ \\ '__|   Oo.|.oO",
  "  .|.     | |_| | |_) |  __/ | | |  __/| | (_| | | | | ||  __/ |        .|.  ",
  "[=====]    \\___/| .__/ \\___|_| |_|_|   |_|\\__,_|_| |_|\\__\\___|_|      [=====]",
  " \\___/          |_|                                                    \\___/ ",
].join("\n");

export function welcomeMessage(): ChatMessage {
  return { id: crypto.randomUUID(), role: "splash", content: SPLASH_ART, timestamp: Date.now() };
}
