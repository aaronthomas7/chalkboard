import Anthropic from '@anthropic-ai/sdk';

export const MODEL = 'claude-opus-5-5';

let client: Anthropic | undefined;

// Created on first use so the rest of the app runs before a key is configured.
export function claude(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('Set ANTHROPIC_API_KEY in .env so Chalkboard can use Claude.');
  }
  return (client ??= new Anthropic());
}
