"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function Header() {
  const { signOut } = useAuthActions();
  const router = useRouter();
  return (
    <header className="flex items-center justify-between border-b border-neutral-200 px-6 py-3">
      <nav className="flex items-center gap-5">
        <Link href="/matches" className="font-semibold">
          intern-radar
        </Link>
        <Link href="/matches" className="text-sm text-neutral-600 hover:underline">
          Matches
        </Link>
        <Link href="/settings" className="text-sm text-neutral-600 hover:underline">
          Settings
        </Link>
      </nav>
      <button
        className="text-sm text-neutral-500 hover:underline"
        onClick={() => void signOut().then(() => router.push("/signin"))}
      >
        Sign out
      </button>
    </header>
  );
}
