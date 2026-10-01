import type { HTMLAttributes } from "react";

const TONES = {
  neutral: "bg-ink/6 text-muted",
  pos: "bg-pos-tint text-pos",
  neg: "bg-neg-tint text-neg",
  warn: "bg-warn-tint text-warn",
  accent: "bg-accent/12 text-accent",
} as const;

export type ChipTone = keyof typeof TONES;

export default function Chip({
  tone = "neutral",
  className = "",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: ChipTone }) {
  return (
    <span
      className={`inline-flex h-6 max-w-full items-center gap-1 truncate rounded-full px-2.5 text-xs ${TONES[tone]} ${className}`}
      {...props}
    />
  );
}
