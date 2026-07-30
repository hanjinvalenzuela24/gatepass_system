const nodemailer = require("nodemailer");

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = String(process.env.SMTP_SECURE).toLowerCase() === "true";
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const EMAIL_FROM = process.env.EMAIL_FROM || SMTP_USER;

const rawData = process.env.APPWRITE_FUNCTION_DATA || "";

function exitWithError(message) {
  console.error(message);
  process.stdout.write(JSON.stringify({ ok: false, error: message }));
  process.exit(1);
}

if (!rawData) {
  exitWithError("Appwrite function data is required.");
}

let payload;
try {
  payload = JSON.parse(rawData);
} catch (error) {
  exitWithError("Invalid JSON payload in APPWRITE_FUNCTION_DATA.");
}

const { to, subject, text, html, replyTo } = payload || {};

if (!to || !subject) {
  exitWithError("Payload must include 'to' and 'subject'.");
}

if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
  exitWithError("SMTP is not configured in Appwrite function environment.");
}

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_SECURE,
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
});

const mailOptions = {
  from: EMAIL_FROM,
  to,
  subject,
  text: text || undefined,
  html: html || undefined,
  replyTo: replyTo || undefined,
};

transporter.sendMail(mailOptions, (error, info) => {
  if (error) {
    console.error("Email send failed:", error);
    process.stdout.write(JSON.stringify({ ok: false, error: error.message || String(error) }));
    process.exit(1);
    return;
  }

  console.log("Email sent:", info.response);
  process.stdout.write(JSON.stringify({ ok: true, info: info.response }));
});
