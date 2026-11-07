// "1st", "2nd", "3rd", "4th"... including the teens, which break the pattern.
// Shared because both sides count things: the main process labels milestones,
// the recap page labels placements. The number itself is grouped the way
// `locale` writes it: "1,000th", or "1.000th" in pt-BR.
export function ordinal(n: number, locale: string | undefined): string {
  return `${n.toLocaleString(locale)}.º`;
}
