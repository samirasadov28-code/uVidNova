/**
 * chat.js — Groq-powered AI assistant for uVidNova.
 *
 * POST /api/chat
 * Body: { messages: [{role: 'user'|'assistant', content: string}] }
 *
 * Prepends the uVidNova system prompt, calls the Groq API,
 * returns { message: { role: 'assistant', content: string } }.
 *
 * Requires GROQ_API_KEY in Netlify environment variables.
 */

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL   = 'llama-3.3-70b-versatile';
const MAX_TOKENS   = 1024;

const SYSTEM_PROMPT = `You are an expert AI assistant for uVidNova, the Ukraine Reconstruction Finance Atlas.

uVidNova is a project-finance-grade database of wartime damage to Ukrainian infrastructure. It provides:
- Deterministic asset-level reconstruction cost estimates (three paths: baseline, code-compliant, build-back-better)
- Defensible financing structures (grant / concessional / public equity / private)
- Re-damage tracking and wartime risk classification

Cost methodology is based on RDNA3 (World Bank, Government of Ukraine, European Commission, UN — Third Edition, February 2024) and KSE Institute benchmarks. AI is never used to generate numeric estimates — all figures come from deterministic lookups against published data.

Currently documented anchor assets:
1. Kakhovka Hydroelectric Power Plant (energy.hpp) — Kherson Oblast, destroyed June 2023, baseline USD 525M–1,538M
2. Trypilska Thermal Power Plant (energy.tpp) — Kyiv Oblast, destroyed April 2024, baseline USD 747M–1,913M
3. Mariupol Drama Theatre (heritage.theatre) — Donetsk Oblast, destroyed March 2022, baseline USD 55M–248M
4. Antonov An-225 Mriya aircraft (transport.aircraft) — Hostomel, destroyed February 2022, baseline USD 291M–930M
5. Okhmatdyt Children's Hospital — Toxicology Block (healthcare.tertiary_hospital) — Kyiv City, severely damaged July 2024, baseline USD 33M–82M

De-risking instruments available: MIGA War & Civil Disturbance Insurance, EBRD Risk Sharing Facility, EU Facility First-Loss Guarantee, UA Government Guarantee, UKEF.

Audience: DFI investment officers (EBRD, EIB, IFC, World Bank), infrastructure philanthropies, policy researchers, and journalists.

Respond in a professional, institutional register. Be concise and factual. Cite RDNA3 or KSE sources where relevant. Do not provide financial advice. Do not speculate on geopolitical or military outcomes. Do not invent cost figures — always refer to the ranges documented above or note that a figure is not yet assessed.

If asked about something outside reconstruction finance or Ukrainian infrastructure, politely redirect to uVidNova's scope.`;

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed.' }) };
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error('GROQ_API_KEY not set');
    return { statusCode: 503, body: JSON.stringify({ error: 'AI chat is not configured.' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body ?? '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body.' }) };
  }

  const userMessages = Array.isArray(body.messages) ? body.messages : [];
  if (userMessages.length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: 'messages array is required.' }) };
  }

  // Enforce maximum conversation history to limit token usage
  const recentMessages = userMessages.slice(-12);

  const payload = {
    model: GROQ_MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      ...recentMessages,
    ],
    max_tokens: MAX_TOKENS,
    temperature: 0.6,
  };

  let groqResponse;
  try {
    groqResponse = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error('Groq API network error:', err.message);
    return { statusCode: 502, body: JSON.stringify({ error: 'AI service unreachable.' }) };
  }

  if (!groqResponse.ok) {
    const errText = await groqResponse.text().catch(() => '');
    console.error('Groq API error:', groqResponse.status, errText.slice(0, 200));
    return {
      statusCode: 502,
      body: JSON.stringify({ error: `AI service returned error ${groqResponse.status}.` }),
    };
  }

  const data = await groqResponse.json();
  const message = data.choices?.[0]?.message;

  if (!message) {
    return { statusCode: 502, body: JSON.stringify({ error: 'Unexpected response from AI service.' }) };
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  };
};
