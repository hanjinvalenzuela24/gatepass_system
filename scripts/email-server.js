const http = require("http");
const nodemailer = require("nodemailer");

const PORT = process.env.EMAIL_SERVICE_PORT ? Number(process.env.EMAIL_SERVICE_PORT) : 3001;
const host = process.env.SMTP_HOST;
const port = Number(process.env.SMTP_PORT || 587);
const secure = String(process.env.SMTP_SECURE) === "true";
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;
const from = process.env.EMAIL_FROM || user;

if (!host || !user || !pass) {
  console.error("SMTP environment is not fully configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS, and optionally EMAIL_FROM.");
  process.exit(1);
}

const transporter = nodemailer.createTransport({
  host,
  port,
  secure,
  auth: { user, pass },
});

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      try {
        const value = raw ? JSON.parse(raw) : {};
        resolve(value);
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.url !== "/email" || req.method !== "POST") {
    sendJson(res, 404, { error: "Not found" });
    return;
  }

  try {
    const body = await parseRequestBody(req);
    const { to, subject, text, html, replyTo } = body;

    if (!to || !subject) {
      sendJson(res, 400, { error: "Missing required fields: to, subject." });
      return;
    }

    const mailOptions = {
      from,
      to,
      subject,
      text: text || undefined,
      html: html || undefined,
      replyTo: replyTo || undefined,
    };

    await transporter.sendMail(mailOptions);
    sendJson(res, 200, { ok: true });
  } catch (error) {
    console.error("Email service error:", error);
    sendJson(res, 500, { error: error instanceof Error ? error.message : "Unable to send email." });
  }
});

server.listen(PORT, () => {
  console.log(`Email service running at http://localhost:${PORT}/email`);
});
