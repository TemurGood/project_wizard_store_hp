export function calculateWizardRank(score: number): string {
  if (score > 500) return "Орден Мерлина I степени (Order of Merlin, First Class)";
  if (score >= 301) return "Мракоборец (Auror)";
  if (score >= 151) return "Староста (Prefect)";
  if (score >= 51) return "Первокурсник (First-Year)";
  return "Магл (Muggle)";
}

export const USD_TO_UZS_RATE = 12850;

