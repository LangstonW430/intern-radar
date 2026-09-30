"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export default function SignInPage() {
  const { signIn } = useAuthActions();
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSendCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signIn("resend-otp", { email });
      setStep("code");
    } catch {
      setError("Couldn't send a code to that address.");
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
      setError("Invalid or expired code.");
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-2xl font-semibold">Sign in to intern-radar</h1>
      {step === "email" ? (
        <form onSubmit={handleSendCode} className="flex w-full max-w-sm flex-col gap-3">
          <input
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded border border-neutral-300 px-3 py-2"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded bg-neutral-900 px-3 py-2 text-white disabled:opacity-50"
          >
            {busy ? "Sending…" : "Email me a code"}
          </button>
        </form>
      ) : (
        <form onSubmit={handleVerify} className="flex w-full max-w-sm flex-col gap-3">
          <p className="text-sm text-neutral-500">
            Enter the 8-digit code sent to {email}.
          </p>
          <input
            name="code"
            required
            inputMode="numeric"
            pattern="[0-9]{8}"
            placeholder="12345678"
            className="rounded border border-neutral-300 px-3 py-2 tracking-widest"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded bg-neutral-900 px-3 py-2 text-white disabled:opacity-50"
          >
            {busy ? "Verifying…" : "Sign in"}
          </button>
          <button
            type="button"
            className="text-sm text-neutral-500 underline"
            onClick={() => setStep("email")}
          >
            Use a different email
          </button>
        </form>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </main>
  );
}
