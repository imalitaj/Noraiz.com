// Vercel Serverless Function — Contact Form Mailer
// Uses Nodemailer + Gmail SMTP. Credentials in Vercel env vars, never in browser.
// Required env vars: GMAIL_USER, GMAIL_PASS (Gmail App Password, not account password)

const nodemailer = require('nodemailer');

// Basic in-memory rate limit — 5 submissions per 10 min per IP
const _rl = new Map();
const RL_WINDOW_MS = 600_000;
const RL_MAX       = 5;

function isRateLimited(ip) {
  const now = Date.now();
  if (_rl.size > 5_000) _rl.clear(); // circuit breaker
  const entry = _rl.get(ip) || { count: 0, start: now };
  if (now - entry.start > RL_WINDOW_MS) { _rl.set(ip, { count: 1, start: now }); return false; }
  if (entry.count >= RL_MAX) return true;
  entry.count++;
  _rl.set(ip, entry);
  return false;
}

function sanitize(str) {
  return String(str).replace(/<[^>]*>/g, '').trim();
}

// HTML-encode for safe interpolation into email HTML template (HIGH-5)
function he(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

module.exports = async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Access-Control-Allow-Origin', 'https://noraiz.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const ct = req.headers['content-type'] || '';
  if (!ct.includes('application/json')) return res.status(415).json({ error: 'Unsupported media type' });

  // Use Vercel's real IP header — XFF last value as fallback (HIGH-4)
  const ip = req.headers['x-real-ip'] || req.headers['x-forwarded-for']?.split(',').pop()?.trim() || 'unknown';
  if (isRateLimited(ip)) return res.status(429).json({ error: 'Too many submissions. Try again later.' });

  // Validate + sanitize fields
  const name    = sanitize(req.body?.name    || '');
  const email   = sanitize(req.body?.email   || '');
  const subject = sanitize(req.body?.subject || '');
  const message = sanitize(req.body?.message || '');

  if (!name    || name.length    < 2  || name.length    > 100) return res.status(400).json({ error: 'Invalid name' });
  if (!email   || !isValidEmail(email))                         return res.status(400).json({ error: 'Invalid email address' });
  if (!message || message.length < 10 || message.length > 2000) return res.status(400).json({ error: 'Message must be 10–2000 characters' });
  if (subject.length > 150) return res.status(400).json({ error: 'Subject too long' });

  if (!process.env.GMAIL_USER || !process.env.GMAIL_PASS) {
    console.error('Missing GMAIL_USER or GMAIL_PASS env vars');
    return res.status(500).json({ error: 'Mail service not configured' });
  }

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false, // STARTTLS
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_PASS, // Gmail App Password
    },
  });

  const mailOptions = {
    from:     `"noraiz.com Portfolio" <${process.env.GMAIL_USER}>`,
    to:       process.env.GMAIL_USER,
    replyTo:  email,
    subject:  subject ? `[noraiz.com] ${he(subject)}` : `[noraiz.com] New message from ${he(name)}`,
    text: `Name: ${name}\nEmail: ${email}\nSubject: ${subject || '(none)'}\n\n${message}`,
    html: `
      <div style="font-family:monospace;background:#0a0e1a;color:#e0e8ff;padding:24px;border-radius:8px;max-width:600px">
        <div style="color:#00ffb2;font-size:1.1rem;margin-bottom:16px">&#x2b21; noraiz.com &#x2014; New Contact</div>
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="color:#8892b0;padding:4px 0;width:80px">Name</td><td style="color:#e0e8ff">${he(name)}</td></tr>
          <tr><td style="color:#8892b0;padding:4px 0">Email</td><td><a href="mailto:${he(email)}" style="color:#4aaeff">${he(email)}</a></td></tr>
          <tr><td style="color:#8892b0;padding:4px 0">Subject</td><td style="color:#e0e8ff">${he(subject) || '&#x2014;'}</td></tr>
        </table>
        <div style="margin-top:20px;padding:16px;background:#0d1627;border-left:3px solid #00ffb2;border-radius:0 4px 4px 0">
          <div style="color:#8892b0;font-size:.75rem;margin-bottom:8px">MESSAGE</div>
          <div style="color:#e0e8ff;white-space:pre-wrap">${he(message)}</div>
        </div>
        <div style="margin-top:16px;color:#3d4f6b;font-size:.7rem">Sent via noraiz.com portfolio &#xb7; Reply directly to respond</div>
      </div>`,
  };

  try {
    await transporter.sendMail(mailOptions);
    return res.json({ success: true });
  } catch (e) {
    console.error('Mail error:', e.message);
    return res.status(502).json({ error: 'Failed to send. Email malitajofficial@gmail.com directly.' });
  }
};
