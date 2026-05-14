// Vercel Serverless Function — TALIXA Groq Proxy
// API key in Vercel env vars (GROQ_KEY), never exposed to browser.

// Basic in-memory rate limit — resets on cold start, per Vercel instance.
// For a portfolio this is sufficient; upgrade to Vercel KV for persistent limiting.
const _rl = new Map();
const RL_WINDOW_MS = 60_000; // 1 minute
const RL_MAX       = 20;     // 20 req/min per IP

function isRateLimited(ip) {
  const now = Date.now();
  if (_rl.size > 5_000) _rl.clear(); // circuit breaker — prevent unbounded growth
  const entry = _rl.get(ip) || { count: 0, start: now };
  if (now - entry.start > RL_WINDOW_MS) { _rl.set(ip, { count: 1, start: now }); return false; }
  if (entry.count >= RL_MAX) return true;
  entry.count++;
  _rl.set(ip, entry);
  return false;
}

// Strip HTML/script tags — prevent prompt injection via markup
function sanitize(str) {
  return str.replace(/<[^>]*>/g, '').replace(/[^\u0020-\u007E\u00A0-\uFFFF]/g, '').trim();
}

module.exports = async function handler(req, res) {
  // Security headers (OWASP A05)
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Access-Control-Allow-Origin', 'https://noraiz.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  // Validate Content-Type (A03)
  const ct = req.headers['content-type'] || '';
  if (!ct.includes('application/json')) return res.status(415).json({ error: 'Unsupported media type' });

  // Rate limit (A04)
  const ip = req.headers['x-real-ip'] || req.headers['x-forwarded-for']?.split(',').pop()?.trim() || 'unknown';
  if (isRateLimited(ip)) return res.status(429).json({ reply: 'Too many requests. Reach Ali at malitajofficial@gmail.com' });

  // Input validation + sanitization (A03)
  const raw = req.body?.message;
  if (!raw || typeof raw !== 'string') return res.status(400).json({ error: 'Invalid message' });
  const message = sanitize(raw);
  if (!message || message.length < 2 || message.length > 800)
    return res.status(400).json({ error: 'Invalid message length' });

  const SYSTEM = `You are TALIXA, the AI assistant embedded in Ali Taj's portfolio at noraiz.com.
Ali Taj is a senior full-stack engineer and AI architect based in Pakistan (UTC+5).
Stack: .NET 9 / C#, PostgreSQL, Azure, AWS, Vanilla JS, Semantic Kernel, Azure OpenAI, RAG pipelines, n8n, Docker.
Builds: SaaS platforms, ERP systems, AI-integrated apps, REST APIs, real-time systems with SignalR.
5+ years experience. Company: Metavys Pvt Ltd. Contact: malitajofficial@gmail.com. Open to hire.
Rules:
- Answer in 2-4 sentences max. Be direct and confident.
- Tech problem/error: brief diagnosis, say "Ali can fix this properly."
- Hiring/project question: confirm Ali can do it, 1 relevant detail, say "Drop Ali a message."
- End every reply with a short CTA pointing to Ali.
- Tone: sharp, professional, slightly futuristic. No fluff.`;

  try {
    const groq = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + process.env.GROQ_KEY,
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user',   content: message },
        ],
        max_tokens: 180,
        temperature: 0.65,
      }),
    });

    if (!groq.ok) throw new Error('Groq error ' + groq.status);
    const data  = await groq.json();
    const reply = data.choices?.[0]?.message?.content ?? 'Reach Ali at malitajofficial@gmail.com';
    return res.json({ reply });
  } catch (e) {
    return res.status(502).json({ reply: 'AI offline. Reach Ali at malitajofficial@gmail.com' });
  }
};
