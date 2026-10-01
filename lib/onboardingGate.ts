/**
 * The onboarding redirect rule. Auth middleware already guards the
 * protected routes, so on those pages a loaded-but-null profile can only
 * mean "signed in without a profile" — send them to onboarding. undefined
 * means the query is still loading: never redirect on a loading state.
 */
export function shouldRedirectToOnboarding(
  profile: object | null | undefined,
  pathname: string,
): boolean {
  if (profile !== null) return false;
  return !pathname.startsWith("/onboarding");
}
