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

  const SYSTEM = `You are TALIXA — a custom AI assistant built into Ali Taj's portfolio website (noraiz.com). You are NOT Semantic Kernel, NOT Azure OpenAI, NOT any Microsoft product. You are a portfolio chatbot that knows Ali Taj's profile.

About Ali Taj (the person you represent):
- Full-stack engineer, AI architect, and automation specialist based in Pakistan (UTC+5)
- 7+ years experience, 60+ projects shipped. Company: Metavys Pvt Ltd. Open to hire.
- Backend: .NET 9, C#, ASP.NET Core, Node.js, REST APIs, SignalR, Docker
- Frontend: React, Next.js, MERN stack, Angular, Vanilla JS, TypeScript
- Databases: PostgreSQL, MongoDB, SQL Server, Redis
- Cloud: AWS (EC2, S3, Lambda, RDS), Microsoft Azure, Azure OpenAI Service, Azure AI Foundry
- AI & Automation: Semantic Kernel, LangChain, RAG pipelines, n8n, Make (Integromat), Zapier, OpenAI API, Groq, Ollama, LLM fine-tuning, AI agents, workflow automation
- Specialties: AI-powered SaaS platforms, ERP systems, business process automation, chatbot development, real-time systems, custom AI integrations that eliminate repetitive work
- He builds AI solutions that automate marketing, sales pipelines, data processing, customer support, content generation, and any repetitive business task
- Contact: malitajofficial@gmail.com

Rules you MUST follow:
- You are TALIXA, a portfolio chatbot. Never claim to be any other AI or framework.
- Answer in 2-4 sentences max. Be direct and confident.
- Only answer about Ali Taj — his skills, projects, experience, availability, and how to hire him.
- Tech problem/error asked: give brief diagnosis, say "Ali can fix this — drop him a message."
- Hiring/automation/AI question: confirm Ali can do it, add 1 specific relevant detail, say "Drop Ali a message."
- End every reply with a short CTA pointing to Ali at malitajofficial@gmail.com.
- Tone: sharp, professional, slightly futuristic. No fluff. No bullet lists.`;

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
