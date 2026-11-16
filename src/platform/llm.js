// Thin wrapper over the Forge LLM API (Atlassian-hosted Claude models).
// Returning plain text keeps src/core independent of Forge, so it can be unit tested.

import { chat as forgeChat } from '@forge/llm';

const MODEL = 'claude-sonnet-4-6';

export async function chat(messages, { maxTokens = 1200 } = {}) {
  const res = await forgeChat({
    model: MODEL,
    messages,
    temperature: 0,
    max_completion_tokens: maxTokens,
  });
  const content = res?.choices?.[0]?.message?.content;
  return Array.isArray(content) ? content.map((p) => p.text || '').join('') : String(content || '');
}
