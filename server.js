const http = require("http");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const nodemailer = require("nodemailer");

const OUT_DIR = fs.existsSync(path.join(__dirname, "index.html"))
  ? __dirname
  : path.join(__dirname, "out");
const PORT = Number(process.env.PORT || 3000);
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = String(process.env.SMTP_SECURE) === "true";
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const EMAIL_FROM = process.env.EMAIL_FROM || SMTP_USER;

const hasSmtpConfig = Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);
let transporter = null;
if (hasSmtpConfig) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
} else {
  console.warn("SMTP is not fully configured. /email will return an error.");
}

const mimeMap = {
  html: "text/html; charset=UTF-8",
  css: "text/css; charset=UTF-8",
  js: "application/javascript; charset=UTF-8",
  json: "application/json; charset=UTF-8",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  ico: "image/x-icon",
  txt: "text/plain; charset=UTF-8",
  xml: "application/xml; charset=UTF-8",
};

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=UTF-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function getContentType(filePath) {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  return mimeMap[ext] || "application/octet-stream";
}

function getFilePath(urlPath) {
  const normalized = path.normalize(urlPath).replace(/^\/+/, "");
  const safePath = normalized.split(path.sep).filter((segment) => segment !== ".." && segment !== "").join(path.sep);
  if (!safePath) {
    return path.join(OUT_DIR, "index.html");
  }

  const candidatePaths = [
    path.join(OUT_DIR, safePath),
    path.join(OUT_DIR, `${safePath}.html`),
    path.join(OUT_DIR, safePath, "index.html"),
  ];

  for (const candidate of candidatePaths) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }

  return null;
}

async function handleEmailRequest(req, res) {
  if (!hasSmtpConfig || !transporter) {
    sendJson(res, 500, { error: "SMTP is not configured on this server." });
    return;
  }

  try {
    const body = await parseJsonBody(req);
    const { to, subject, text, html, replyTo, allowExternalRecipients } = body;

    if (!to || !subject) {
      sendJson(res, 400, { error: "Missing required fields: to and subject." });
      return;
    }

    const mailOptions = {
      from: EMAIL_FROM,
      to,
      subject,
      text: text || undefined,
      html: html || undefined,
      replyTo: replyTo || undefined,
    };

    await transporter.sendMail(mailOptions);
    sendJson(res, 200, { ok: true });
  } catch (error) {
    console.error("Email send failed:", error);
    sendJson(res, 500, { error: error instanceof Error ? error.message : "Unable to send email." });
  }
}

function serveStaticFile(req, res, urlPath) {
  const filePath = getFilePath(urlPath);
  if (!filePath) {
    const notFoundPath = path.join(OUT_DIR, "_not-found.html");
    if (fs.existsSync(notFoundPath)) {
      const body = fs.readFileSync(notFoundPath);
      res.writeHead(404, { "Content-Type": "text/html; charset=UTF-8" });
      res.end(body);
      return;
    }
    res.writeHead(404, { "Content-Type": "text/plain; charset=UTF-8" });
    res.end("Not found");
    return;
  }

  const body = fs.readFileSync(filePath);
  res.writeHead(200, { "Content-Type": getContentType(filePath) });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "", `http://${req.headers.host}`);
  if (req.method === "POST" && url.pathname === "/email") {
    await handleEmailRequest(req, res);
    return;
  }

  if (req.method === "GET") {
    serveStaticFile(req, res, url.pathname);
    return;
  }

  res.writeHead(405, { "Content-Type": "text/plain; charset=UTF-8" });
  res.end("Method not allowed");
});

server.listen(PORT, () => {
  console.log(`Static site server running on http://localhost:${PORT}`);
  if (!hasSmtpConfig) {
    console.log("Warning: SMTP is not configured. /email endpoint will fail.");
  }
});
