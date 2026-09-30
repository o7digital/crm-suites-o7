export function monthlyPostSalesName(
  title: string,
  index: number | null | undefined,
  months: number | null | undefined,
): string {
  return index && months ? `${title} (Mes ${index}/${months})` : title;
}
