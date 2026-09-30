/**
 * Evaluates a Cloudflare Turnstile siteverify response. A token passes only
 * when success is true, the action matches the one our widget stamps
 * ("signin"), and the hostname is the app's own (when we know it).
 */

export const TURNSTILE_ACTION = "signin";

export interface SiteverifyResponse {
  success?: boolean;
  action?: string;
  hostname?: string;
  "error-codes"?: string[];
}

export function evaluateTurnstileVerdict(
  body: SiteverifyResponse,
  options: { expectedHostname: string | null },
): { ok: boolean; reason: string | null } {
  if (body.success !== true) {
    return { ok: false, reason: `not successful: ${body["error-codes"]?.join(",") ?? "unknown"}` };
  }
  // Cloudflare echoes the action the widget was rendered with; a token
  // minted for some other widget/action must not pass here.
  if (body.action !== undefined && body.action !== TURNSTILE_ACTION) {
    return { ok: false, reason: `action mismatch: ${body.action}` };
  }
  if (
    options.expectedHostname &&
    body.hostname !== undefined &&
    body.hostname !== options.expectedHostname
  ) {
    return { ok: false, reason: `hostname mismatch: ${body.hostname}` };
  }
  return { ok: true, reason: null };
}

/** The hostname tokens should carry, derived from APP_URL. */
export function expectedHostnameFromAppUrl(appUrl: string | undefined): string | null {
  if (!appUrl) return null;
  try {
    return new URL(appUrl).hostname;
  } catch {
    return null;
  }
}
