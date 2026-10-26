/** Shorten readable native catalog names only; opaque IDs never enter this function. */
export function shortenModelLabel(name: string): string {
  // A prefix must end at a word separator and leave a model name behind.
  const match = /^(?:OpenAI|Anthropic|Google|Meta|Mistral|DeepSeek|GPT|Claude|Gemini|Grok|Qwen)[\s-]+(.+)$/i.exec(name);
  if (!match || !/[^\s-]/.test(match[1])) return name;
  return match[1].replace(/(?<=[\p{L}\p{N}])-(?=[\p{L}\p{N}])/gu, ' ');
}
