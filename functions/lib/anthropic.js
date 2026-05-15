/**
 * anthropic.js — thin wrapper around the Anthropic Messages API.
 *
 * Uses Node 20 native fetch. No SDK dependency. No retry logic —
 * callers handle retries if needed.
 *
 * API key is read from ANTHROPIC_API_KEY environment variable.
 */

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MODEL = 'claude-sonnet-4-6';

/**
 * Call the Anthropic Messages API.
 *
 * @param {{ systemPrompt: string, userMessage: string, temperature?: number, maxTokens?: number }} opts
 * @returns {Promise<{ content: string, usage: { input_tokens: number, output_tokens: number } }>}
 * @throws {Error} if the API key is missing or the request fails
 */
export async function callClaude({ systemPrompt, userMessage, temperature = 0.4, maxTokens = 2000 }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable not set.');
  }

  const payload = {
    model: MODEL,
    max_tokens: maxTokens,
    temperature,
    system: systemPrompt,
    messages: [
      { role: 'user', content: userMessage },
    ],
  };

  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => '');
    throw new Error(`Anthropic API error ${res.status}: ${errorBody.slice(0, 400)}`);
  }

  const data = await res.json();

  // Anthropic returns content as an array of blocks; extract the text block.
  const content = data.content
    ?.filter(block => block.type === 'text')
    .map(block => block.text)
    .join('') ?? '';

  const usage = {
    input_tokens: data.usage?.input_tokens ?? 0,
    output_tokens: data.usage?.output_tokens ?? 0,
  };

  return { content, usage };
}
