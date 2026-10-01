import type {
  InputHTMLAttributes,
  SelectHTMLAttributes,
} from "react";

const FIELD =
  "h-9 rounded-md border border-hairline bg-surface px-2.5 text-sm text-ink placeholder:text-muted/70 transition-colors focus:border-accent focus:outline-2 focus:-outline-offset-1 focus:outline-accent disabled:opacity-50";

export function Input({
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${FIELD} ${className}`} {...props} />;
}

export function Select({
  className = "",
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${FIELD} ${className}`} {...props} />;
}
