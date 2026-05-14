/**
 * Thin Groq API helper for Netlify Functions.
 * Uses the OpenAI-compatible endpoint — no SDK dependency required.
 * API key is read from GROQ_API_KEY environment variable.
 */

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL   = 'llama-3.3-70b-versatile';

/**
 * @param {Array<{role:string,content:string}>} messages
 * @param {{ temperature?: number, max_tokens?: number, system?: string }} opts
 * @returns {Promise<string>} assistant message text
 */
export async function chat(messages, { temperature = 0.4, max_tokens = 2048, system } = {}) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY environment variable not set.');

  const payload = {
    model: GROQ_MODEL,
    temperature,
    max_tokens,
    messages: system
      ? [{ role: 'system', content: system }, ...messages]
      : messages,
  };

  const res = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Groq API error ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}
