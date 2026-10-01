export default function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden className={`animate-pulse rounded-md bg-ink/8 ${className}`} />
  );
}
