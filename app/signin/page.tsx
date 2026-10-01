"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import Turnstile from "@/components/Turnstile";
import Button from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { convexSiteUrl } from "@/lib/convexSiteUrl";

/** Distinct, honest error categories for the sign-in flow. */
function sendCodeError(status: number): string {
  if (status === 429) {
    return "Too many sign-in attempts — please wait a bit and try again.";
  }
  if (status === 403) return "Captcha check failed — please retry it.";
  if (status === 400) return "That doesn't look like a valid email address.";
  if (status >= 500) {
    return "Something went wrong on our side — please try again in a minute.";
  }
  return "Couldn't send a code to that address.";
}

export default function SignInPage() {
  const { signIn } = useAuthActions();
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSendCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`${convexSiteUrl()}/auth/request-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, turnstileToken: turnstileToken || undefined }),
      });
      if (!res.ok) {
        setError(sendCodeError(res.status));
      } else {
        setStep("code");
      }
    } catch {
      setError("Couldn't reach the server — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    const code = new FormData(event.currentTarget).get("code") as string;
    try {
      await signIn("resend-otp", { email, code });
      router.push("/matches");
    } catch {
      setError("Invalid or expired code — request a fresh one if it keeps failing.");
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 py-8">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">intern-radar</h1>
        <p className="mt-1 text-sm text-muted">
          Sign in with a one-time email code.
        </p>
      </div>
      {step === "email" ? (
        <form
          onSubmit={handleSendCode}
          className="flex w-full max-w-sm flex-col gap-3"
        >
          <Input
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-label="Email address"
            className="h-10"
          />
          <Turnstile onToken={setTurnstileToken} />
          <Button type="submit" variant="primary" disabled={busy} className="h-10">
            {busy ? "Sending…" : "Email me a code"}
          </Button>
          <p className="text-center text-xs text-muted">
            New here? Signing in creates your account.{" "}
            <Link href="/privacy" className="underline">
              Privacy
            </Link>
          </p>
        </form>
      ) : (
        <form
          onSubmit={handleVerify}
          className="flex w-full max-w-sm flex-col gap-3"
        >
          <p className="text-sm text-muted">
            Enter the 8-digit code sent to {email}.
          </p>
          <Input
            name="code"
            required
            inputMode="numeric"
            pattern="[0-9]{8}"
            placeholder="12345678"
            aria-label="Sign-in code"
            className="h-10 font-mono tracking-widest"
          />
          <Button type="submit" variant="primary" disabled={busy} className="h-10">
            {busy ? "Verifying…" : "Sign in"}
          </Button>
          <Button variant="ghost" onClick={() => setStep("email")}>
            Use a different email
          </Button>
        </form>
      )}
      {error && (
        <p role="alert" className="max-w-sm text-center text-sm text-neg">
          {error}
        </p>
      )}
    </main>
  );
}
