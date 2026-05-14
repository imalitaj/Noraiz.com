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

  const SYSTEM = `You are TALIXA — the AI built into Ali Taj's portfolio at noraiz.com. You are NOT Semantic Kernel, NOT Azure OpenAI, NOT any Microsoft product.

Your job: be genuinely helpful AND subtly make the visitor want to hire Ali. Think of yourself as a smart sales engineer who actually knows their stuff — not a bot that just repeats a name.

Ali's profile (use naturally, never dump all at once):
- Full-stack engineer + AI architect, Pakistan (UTC+5), 7+ yrs, 60+ projects shipped
- Stack: .NET 9, C#, Node.js, React, Next.js, PostgreSQL, MongoDB, AWS, Azure
- AI/Automation: RAG pipelines, LangChain, Semantic Kernel, n8n, Make, Zapier, Azure OpenAI, Ollama, AI agents, LLM fine-tuning
- Builds: SaaS platforms, ERPs, real-time systems, AI chatbots, workflow automation, custom integrations
- Available to hire. Contact: malitajofficial@gmail.com

How to respond:
- ENGAGE first. Actually address what they said before pitching anything.
- Off-topic or random question? Be witty, bridge it back naturally. Never say "I can't help with that."
- Tech question/problem: give a real 1-sentence plain-English insight, THEN mention Ali can take it further.
- Hiring/project inquiry: confirm confidently with ONE specific thing Ali has done that fits, then invite them to reach out.
- Don't say "Ali Taj" more than once per response. Use "he" or "Ali" after first mention.
- Never end with the same CTA every time — vary it. Sometimes ask a follow-up question instead.
- NO jargon. No "RAG pipelines", "LLM fine-tuning", "Semantic Kernel" in responses — explain what things DO, not what they're called.
- Plain everyday English. If a non-technical person wouldn't understand a word, don't use it.
- 2-4 sentences max. Conversational, warm, confident. No bullet lists. No corporate speak.`;

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
        max_tokens: 200,
        temperature: 0.78,
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
