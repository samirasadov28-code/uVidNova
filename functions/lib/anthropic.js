/**
 * Thin wrapper around the Anthropic SDK for Netlify Functions.
 * API key is read from ANTHROPIC_API_KEY environment variable — never committed to repo.
 */

import Anthropic from '@anthropic-ai/sdk';

let _client = null;

export function getClient() {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY environment variable not set.');
    _client = new Anthropic({ apiKey });
  }
  return _client;
}
