const UPPERCASE_WORDS: Record<string, string> = {
  dj: 'DJ',
  kyc: 'KYC',
  ph: 'PH',
  qr: 'QR',
  uat: 'UAT',
  vip: 'VIP',
};

/**
 * Organizer-created event titles are sometimes entered in all caps. Preserve
 * intentional mixed-case titles, but normalize fully-uppercase titles so hero
 * layouts remain editorial rather than shouting.
 */
export function formatEventDisplayTitle(title: string) {
  const hasLetters = /[A-Za-z]/.test(title);
  if (!hasLetters || title !== title.toUpperCase()) return title;

  return title
    .toLocaleLowerCase('en-PH')
    .replace(/(^|[\s:–—-])([a-z])/g, (_match, prefix: string, letter: string) => `${prefix}${letter.toUpperCase()}`)
    .replace(/\b(Dj|Kyc|Ph|Qr|Uat|Vip)\b/g, (word) => UPPERCASE_WORDS[word.toLowerCase()] ?? word);
}

export function isDuplicateEventCopy(value: string | null | undefined, title: string) {
  if (!value?.trim()) return true;
  const normalize = (text: string) => text.toLocaleLowerCase('en-PH').replace(/[^a-z0-9]+/g, ' ').trim();
  return normalize(value) === normalize(title);
}

/** Return a complete, concise sentence for a hero without line-clamp ellipses. */
export function conciseHeroCopy(value: string | null | undefined, maxLength = 150) {
  const clean = value?.replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  const firstSentence = clean.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim() ?? clean;
  if (firstSentence.length <= maxLength) return firstSentence;
  const shortened = firstSentence.slice(0, maxLength);
  const boundary = shortened.lastIndexOf(' ');
  return `${shortened.slice(0, boundary > maxLength * 0.65 ? boundary : maxLength).replace(/[,:;\s]+$/, '')}.`;
}

export function scarcityLabel(available: number | null | undefined, total: number | null | undefined) {
  if (available == null || available <= 0) return null;
  const isLowByCount = available <= 50;
  const isLowByRatio = total != null && total > 0 && available / total <= 0.2;
  return isLowByCount || isLowByRatio ? `Only ${available.toLocaleString('en-PH')} left` : null;
}
