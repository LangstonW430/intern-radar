"use client";

import { useSyncExternalStore } from "react";

type ThemeChoice = "light" | "dark" | "system";

const ORDER: ThemeChoice[] = ["light", "dark", "system"];
const LABELS: Record<ThemeChoice, string> = {
  light: "Theme: light",
  dark: "Theme: dark",
  system: "Theme: follows your system",
};

// localStorage as an external store: storage events cover other tabs,
// the local listener list covers this one.
let listeners: (() => void)[] = [];
function subscribe(callback: () => void): () => void {
  listeners.push(callback);
  window.addEventListener("storage", callback);
  return () => {
    listeners = listeners.filter((l) => l !== callback);
    window.removeEventListener("storage", callback);
  };
}
function getChoice(): ThemeChoice {
  const stored = localStorage.getItem("theme");
  return stored === "light" || stored === "dark" ? stored : "system";
}

function resolve(choice: ThemeChoice): "light" | "dark" {
  if (choice !== "system") return choice;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/** Cycles light → dark → system; persists the choice. The inline script in
 * layout.tsx applies it before paint on the next load. */
export default function ThemeToggle() {
  const choice = useSyncExternalStore(subscribe, getChoice, () => "system" as const);

  function cycle() {
    const next = ORDER[(ORDER.indexOf(choice) + 1) % ORDER.length];
    if (next === "system") {
      localStorage.removeItem("theme");
    } else {
      localStorage.setItem("theme", next);
    }
    document.documentElement.dataset.theme = resolve(next);
    for (const listener of listeners) listener();
  }

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={LABELS[choice]}
      title={`${LABELS[choice]} — click to change`}
      className="inline-flex size-8 items-center justify-center rounded-md text-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {choice === "light" && <SunIcon />}
      {choice === "dark" && <MoonIcon />}
      {choice === "system" && <AutoIcon />}
    </button>
  );
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="3.25" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M8 1v1.5M8 13.5V15M15 8h-1.5M2.5 8H1m11.95-4.95-1.06 1.06M4.11 11.89l-1.06 1.06m9.9 0-1.06-1.06M4.11 4.11 3.05 3.05"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M13.5 9.5A6 6 0 0 1 6.5 2.5a6 6 0 1 0 7 7Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AutoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 2a6 6 0 0 1 0 12Z" fill="currentColor" />
    </svg>
  );
}
