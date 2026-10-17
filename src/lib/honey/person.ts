/** A child is a name on the books, not a sign-in. Adults and others may carry an email. */
export function personEmail(relation: string, raw: unknown): string {
  if (relation === "child") return "";
  const email = String(raw ?? "").trim().toLowerCase();
  if (!email) return "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("That email does not look right.");
  return email.slice(0, 120);
}
