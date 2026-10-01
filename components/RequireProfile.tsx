"use client";

import { useQuery } from "convex/react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import { shouldRedirectToOnboarding } from "@/lib/onboardingGate";

/** Sends signed-in users without a profile to /onboarding. Wrap protected
 * page content with this (auth itself is handled by the middleware). */
export default function RequireProfile({ children }: { children: ReactNode }) {
  const profile = useQuery(api.profile.getMine);
  const router = useRouter();
  const pathname = usePathname();
  const redirect = shouldRedirectToOnboarding(profile, pathname);

  useEffect(() => {
    if (redirect) router.replace("/onboarding");
  }, [redirect, router]);

  if (redirect) return null;
  return children;
}
