export interface RosterPlayer { id: number; name: string; nickname: string | null }

export function normalizeName(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, '').trim();
}

/** Resolve a name as written in an article or on Wikipedia to a roster player: exact, nickname, first name, then loose. */
export function resolvePlayer<P extends RosterPlayer>(name: string, players: P[]): P | null {
  const n = normalizeName(name);
  if (!n) return null;
  const exact = players.find(p => normalizeName(p.name) === n || (p.nickname && normalizeName(p.nickname) === n));
  if (exact) return exact;
  const first = players.filter(p => normalizeName(p.name).split(' ')[0] === n.split(' ')[0]);
  if (first.length === 1) return first[0];
  const loose = players.filter(p => normalizeName(p.name).includes(n) || n.includes(normalizeName(p.name).split(' ')[0]));
  return loose.length === 1 ? loose[0] : null;
}
