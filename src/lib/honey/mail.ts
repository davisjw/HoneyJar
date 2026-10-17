export function smtpConfigured(): boolean {
  const host = process.env.SMTP_HOST?.trim();
  const from = process.env.SMTP_FROM?.trim();
  return Boolean(host && from);
}

export async function sendMail(to: string, subject: string, text: string): Promise<void> {
  if (!smtpConfigured()) throw new Error("Email is not configured.");
  const nodemailer = await import("nodemailer");
  const port = Number(process.env.SMTP_PORT || 587);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" }
      : undefined,
  });
  await transport.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject,
    text,
  });
}
