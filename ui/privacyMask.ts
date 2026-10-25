// Stand-ins preserve email separators and whitespace, never the underlying identity.
export function maskSensitive(value: string, bullets = false): string {
  let hash = 7;
  return Array.from(value, char => {
    if (/[\s@.]/u.test(char)) return char;
    if (bullets) return '•';
    hash = (Math.imul(hash, 31) + char.codePointAt(0)!) >>> 0;
    const letters = /[A-Z]/.test(char) ? 'AEHNRST' : 'aehnorst';
    const alternatives = Array.from(letters).filter(letter => letter !== char);
    return alternatives[hash % alternatives.length];
  }).join('');
}

// Match only known identity fields and email addresses within surrounding prose.
export function sensitiveParts(text: string, values: readonly string[] = []): { text: string; sensitive: boolean }[] {
  const names = [...new Set(values.filter(Boolean))].sort((a, b) => b.length - a.length);
  const escaped = names.map(value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const email = '[\\w.+*•-]+@[\\w*•-]+(?:\\.[\\w*•-]+)+';
  const pattern = new RegExp([email, ...escaped].join('|'), 'gu');
  const isEmail = new RegExp(`^${email}$`, 'u');
  const word = (char = '') => /[\p{L}\p{N}_]/u.test(char);
  const joined = (index: number, step: number) => word(text[index]) || /[-.]/.test(text[index] ?? '') && word(text[index + step]);
  const parts: { text: string; sensitive: boolean }[] = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const end = match.index + match[0].length;
    if (!isEmail.test(match[0]) && (word(match[0][0]) && joined(match.index - 1, -1) || word(match[0].at(-1)) && joined(end, 1))) continue;
    if (match.index > last) parts.push({ text: text.slice(last, match.index), sensitive: false });
    parts.push({ text: match[0], sensitive: true });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), sensitive: false });
  return parts;
}
