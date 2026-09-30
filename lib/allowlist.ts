/**
 * Allowlist gating for sign-in. ALLOWED_EMAILS is a comma-separated list of
 * email addresses; matching is case-insensitive and whitespace-tolerant.
 */

export function parseAllowedEmails(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);
}

export function isEmailAllowed(
  email: string | undefined,
  allowedRaw: string | undefined,
): boolean {
  if (!email) return false;
  const allowed = parseAllowedEmails(allowedRaw);
  return allowed.includes(email.trim().toLowerCase());
}
