const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

function loadEnv(file) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx);
    const val = trimmed.slice(idx + 1);
    process.env[key] = val;
  }
}

const envPath = path.resolve(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) loadEnv(envPath);

console.log('Starting test-email.js (reads .env.local and attempts SMTP)');

async function run() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE) === 'true';
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.EMAIL_FROM || user;

  if (!host || !user || !pass) {
    console.error('SMTP env not fully configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS.');
    process.exit(2);
  }

  const transporter = nodemailer.createTransport({ host, port, secure, auth: { user, pass } });

  try {
    await transporter.verify();
    console.log('SMTP verified. Sending test message...');

    const to = process.env.NEXT_PUBLIC_ADMIN_EMAILS?.split(',')[0]?.trim() || 'jomar.abrise@seiwakaiun.com.ph';

    const info = await transporter.sendMail({
      from,
      to,
      subject: 'Gatepass system test email',
      text: `This is a test message from the Gatepass app to ${to}`,
    });

    console.log('Message sent:', info.messageId || info.response || info);
  } catch (err) {
    console.error('Error sending test email:', err && err.message ? err.message : err);
    process.exit(3);
  }
}

run();
