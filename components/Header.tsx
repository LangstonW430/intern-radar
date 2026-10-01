"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import ThemeToggle from "./ThemeToggle";

function NavLink({ href, children }: { href: string; children: string }) {
  const pathname = usePathname();
  const active = pathname === href;
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-md px-1 py-0.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
        active ? "font-medium text-ink" : "text-muted hover:text-ink"
      }`}
    >
      {children}
    </Link>
  );
}

export default function Header() {
  const { signOut } = useAuthActions();
  const router = useRouter();
  return (
    <header className="sticky top-0 z-10 border-b border-hairline bg-canvas">
      <div className="mx-auto flex h-12 max-w-4xl items-center justify-between gap-3 px-4 sm:px-6">
        <nav className="flex items-center gap-4 sm:gap-5">
          <Link
            href="/matches"
            className="text-sm font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            intern-radar
          </Link>
          <NavLink href="/matches">Matches</NavLink>
          <NavLink href="/settings">Settings</NavLink>
        </nav>
        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          <button
            className="rounded-md px-2 py-1 text-sm text-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            onClick={() => void signOut().then(() => router.push("/signin"))}
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
