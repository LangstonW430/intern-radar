import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 py-8 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">intern-radar</h1>
      <p className="max-w-sm text-muted">
        Personalized Summer 2027 internship matching that learns from your
        feedback.
      </p>
      <Link
        href="/matches"
        className="inline-flex h-10 items-center rounded-md bg-accent px-4 text-sm font-medium text-accent-contrast transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        View your matches
      </Link>
      <Link href="/privacy" className="text-xs text-muted underline">
        Privacy
      </Link>
    </main>
  );
}
