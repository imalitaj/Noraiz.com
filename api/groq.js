// Vercel Serverless Function — TALIXA Groq Proxy
// API key stored in Vercel dashboard env vars, never in code.
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://noraiz.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const { message } = req.body ?? {};
  if (!message || message.length > 1000) return res.status(400).json({ error: 'Invalid message' });

  const SYSTEM = `You are TALIXA, the AI assistant embedded in Ali Taj's portfolio at noraiz.com.
Ali Taj is a senior full-stack engineer and AI architect based in Pakistan (UTC+5).
Stack: .NET 9 / C#, PostgreSQL, Azure, AWS, Vanilla JS, Semantic Kernel, Azure OpenAI, RAG pipelines, n8n, Docker.
Builds: SaaS platforms, ERP systems, AI-integrated apps, REST APIs, real-time systems with SignalR.
5+ years experience. Company: Metavystic Pvt Ltd. Contact: malitajofficial@gmail.com. Open to hire.
Rules:
- Answer in 2-4 sentences max. Be direct and confident.
- Tech problem/error → brief diagnosis, say "Ali can fix this properly."
- Hiring/project question → confirm Ali can do it, 1 relevant detail, say "Drop Ali a message."
- End every reply with a short CTA pointing to Ali.
- Tone: sharp, professional, slightly futuristic. No fluff.`;

  try {
    const groq = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_KEY}`,
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

    if (!groq.ok) throw new Error('Groq error');
    const data  = await groq.json();
    const reply = data.choices?.[0]?.message?.content ?? 'Reach Ali at malitajofficial@gmail.com';
    return res.json({ reply });
  } catch {
    return res.status(502).json({ reply: 'AI offline right now. Reach Ali at malitajofficial@gmail.com' });
  }
}
