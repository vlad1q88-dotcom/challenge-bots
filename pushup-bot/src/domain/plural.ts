/** Русское склонение по числу: 1 день, 2 дня, 5 дней. */
export function pluralRu(value: number, one: string, few: string, many: string): string {
  const mod10 = Math.abs(value) % 10;
  const mod100 = Math.abs(value) % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export function days(value: number): string {
  return `${value} ${pluralRu(value, 'день', 'дня', 'дней')}`;
}
