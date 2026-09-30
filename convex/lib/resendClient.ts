/**
 * The one Resend client module: every email the app sends goes through here
 * (auth codes now, digests later).
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const TIMEOUT_MS = 10_000;

export interface SendEmailArgs {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

export async function sendEmail(args: SendEmailArgs): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.DIGEST_FROM_EMAIL;
  if (!apiKey || !from) {
    throw new Error("RESEND_API_KEY and DIGEST_FROM_EMAIL must be set");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, ...args }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text();
      console.error("Resend send failed", res.status, body);
      throw new Error(`Resend send failed with status ${res.status}`);
    }
  } finally {
    clearTimeout(timer);
  }
}
