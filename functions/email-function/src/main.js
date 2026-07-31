const nodemailer = require("nodemailer");

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = String(process.env.SMTP_SECURE).toLowerCase() === "true";
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const EMAIL_FROM = process.env.EMAIL_FROM || SMTP_USER;

module.exports = async ({ req, res, log, error }) => {
  let payload;

  try {
    payload = JSON.parse(req.body || "{}");
  } catch {
    return res.json({ ok: false, error: "Invalid JSON payload." }, 400);
  }

  const { to, subject, text, html, replyTo } = payload;

  if (!to || !subject) {
    return res.json({ ok: false, error: "Payload must include 'to' and 'subject'." }, 400);
  }

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    error("SMTP is not configured in the Appwrite function environment.");
    return res.json({ ok: false, error: "SMTP is not configured." }, 500);
  }

  try {
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });

    const info = await transporter.sendMail({
      from: EMAIL_FROM,
      to,
      subject,
      text: text || undefined,
      html: html || undefined,
      replyTo: replyTo || undefined,
    });

    log(`Email sent: ${info.response}`);
    return res.json({ ok: true, info: info.response });
  } catch (sendError) {
    const message = sendError instanceof Error ? sendError.message : "Unable to send email.";
    error(`Email send failed: ${message}`);
    return res.json({ ok: false, error: message }, 500);
  }
};
