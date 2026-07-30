import nodemailer from "nodemailer";

const ALLOWED_DOMAIN = "seiwakaiun.com.ph";

function normalizeRecipientList(input?: string) {
  return (input ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function getTrustedRecipients() {
  return new Set([
    ...normalizeRecipientList(process.env.EMAIL_ALLOWED_RECIPIENTS),
    ...normalizeRecipientList(process.env.NEXT_PUBLIC_ADMIN_EMAILS),
    ...normalizeRecipientList(process.env.NEXT_PUBLIC_MANAGER_EMAILS),
  ]);
}

function normalizeAddresses(input: string | string[]) {
  if (Array.isArray(input)) return input.map((s) => s.trim()).filter(Boolean);
  return String(input)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function partitionAllowed(addresses: string[]) {
  const trustedRecipients = getTrustedRecipients();
  const valid = addresses.filter((a) => {
    const normalized = a.toLowerCase();
    return normalized.endsWith(`@${ALLOWED_DOMAIN}`) || trustedRecipients.has(normalized);
  });
  const invalid = addresses.filter((a) => {
    const normalized = a.toLowerCase();
    return !normalized.endsWith(`@${ALLOWED_DOMAIN}`) && !trustedRecipients.has(normalized);
  });
  return { valid, invalid };
}

function getTransport() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = process.env.SMTP_SECURE === "true";
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error("SMTP is not configured. Set SMTP_HOST, SMTP_USER and SMTP_PASS.");
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
}

export type SendEmailOptions = {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  from?: string;
  replyTo?: string | string[];
  allowExternalRecipients?: boolean;
};

export async function sendEmail(opts: SendEmailOptions) {
  const to = normalizeAddresses(opts.to);
  const allowExternalRecipients = opts.allowExternalRecipients === true;
  const toPartition = allowExternalRecipients ? { valid: to, invalid: [] } : partitionAllowed(to);
  if (!toPartition.valid.length) {
    throw new Error(`No allowed recipients: ${toPartition.invalid.join(", ") || "(none)"}`);
  }

  const replyTo = opts.replyTo ? normalizeAddresses(opts.replyTo) : undefined;
  const replyToPartition = replyTo
    ? allowExternalRecipients
      ? { valid: replyTo, invalid: [] }
      : partitionAllowed(replyTo)
    : undefined;

  const from = opts.from ?? process.env.EMAIL_FROM ?? `no-reply@${ALLOWED_DOMAIN}`;

  if (toPartition.invalid.length) {
    console.warn(`Ignoring disallowed email recipients: ${toPartition.invalid.join(", ")}`);
  }

  const transporter = getTransport();

  const info = await transporter.sendMail({
    from,
    to: toPartition.valid.join(", "),
    replyTo: replyToPartition?.valid.length ? replyToPartition.valid.join(", ") : undefined,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
  });

  return info;
}

export { ALLOWED_DOMAIN };
