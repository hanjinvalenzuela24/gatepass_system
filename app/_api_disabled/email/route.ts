import { NextResponse } from "next/server";
import { sendEmail, ALLOWED_DOMAIN } from "@/lib/email";

export async function POST(request: Request) {
  type EmailRequestBody = {
    to?: string | string[];
    subject?: string;
    text?: string;
    html?: string;
    replyTo?: string | string[];
    allowExternalRecipients?: boolean;
  };

  let body: EmailRequestBody | null = null;
  try {
    body = (await request.json()) as EmailRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const to = body?.to;
  const subject = body?.subject ?? "(no subject)";
  const text = body?.text ?? "";
  const html = body?.html;
  const replyTo = body?.replyTo;
  const allowExternalRecipients = body?.allowExternalRecipients;

  if (!to) return NextResponse.json({ error: "Missing `to` field." }, { status: 400 });

  try {
    await sendEmail({ to, subject, text, html, replyTo, allowExternalRecipients });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to send email.";
    // Never leak SMTP credentials in responses
    if (message.includes("SMTP is not configured")) {
      return NextResponse.json({ error: message }, { status: 500 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
