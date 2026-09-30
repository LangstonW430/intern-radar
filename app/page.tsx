import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-3xl font-semibold">intern-radar</h1>
      <p className="text-neutral-500">
        Personalized Summer 2027 internship matching.
      </p>
      <Link
        href="/matches"
        className="rounded bg-neutral-900 px-4 py-2 text-white"
      >
        View your matches
      </Link>
    </main>
  );
}
