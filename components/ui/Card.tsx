import type { HTMLAttributes } from "react";

export default function Card({
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-lg border border-hairline bg-surface ${className}`}
      {...props}
    />
  );
}
