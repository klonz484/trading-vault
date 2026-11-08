/**
 * Resolve a redirect target only when it remains on the current application origin.
 * Reject backslashes before URL parsing because special-scheme URL parsers normalize
 * them to slashes, which can turn an apparently local path into a protocol-relative URL.
 */
export function safeInternalRedirect(
  value: string | null,
  origin: string,
): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\\u0000-\\u001f]/.test(value)
  ) {
    return "/";
  }

  try {
    const expectedOrigin = new URL(origin).origin;
    const target = new URL(value, expectedOrigin);
    if (target.origin !== expectedOrigin) return "/";
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return "/";
  }
}
