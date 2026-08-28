const ACCOUNT_ACCENTS = ['#22d3ee', '#fb923c', '#f472b6', '#c084fc', '#2dd4bf'] as const;

/** Stable, bright dark-mode accent derived solely from the isolated account id. */
export function accountAccent(accountId: string): string {
  let hash = 0;
  for (const character of accountId) hash = ((hash * 31) + character.charCodeAt(0)) >>> 0;
  return ACCOUNT_ACCENTS[hash % ACCOUNT_ACCENTS.length];
}
