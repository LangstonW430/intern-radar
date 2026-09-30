/**
 * Email-list matching, case-insensitive and whitespace-tolerant. Sign-up is
 * open; this now only gates admin surfaces via ADMIN_EMAILS.
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

/** True when the email is in ADMIN_EMAILS. Closed by default. */
export function isAdminEmail(
  email: string | undefined,
  adminRaw: string | undefined,
): boolean {
  return isEmailAllowed(email, adminRaw);
}
