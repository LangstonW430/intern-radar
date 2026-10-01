import type { ButtonHTMLAttributes } from "react";

const VARIANTS = {
  primary: "bg-accent text-accent-contrast hover:opacity-90",
  subtle: "border border-hairline bg-surface text-ink hover:border-muted",
  ghost: "text-muted hover:text-ink",
  destructive: "text-neg hover:bg-neg-tint",
} as const;

export type ButtonVariant = keyof typeof VARIANTS;

export default function Button({
  variant = "subtle",
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      type={type}
      className={`inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}
