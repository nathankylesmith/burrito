import type { Match } from "../types";

const KEY = "foil-matches-cville-v1";

export function loadMatches(): Match[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Match[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveMatches(matches: Match[]): void {
  localStorage.setItem(KEY, JSON.stringify(matches));
}

export function upsertMatch(matches: Match[], next: Match): Match[] {
  const without = matches.filter((match) => match.id !== next.id);
  return [next, ...without];
}
