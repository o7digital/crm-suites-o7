export function duplicateBaseTitle(title: string): string {
  return title.replace(/(?:\s+copy\s+[1-9]\d*)+$/i, '').trim();
}

export function nextDuplicateTitle(sourceTitle: string, existingTitles: string[]): string {
  const base = duplicateBaseTitle(sourceTitle);
  const prefix = `${base} copy `;
  let highest = 0;
  for (const title of existingTitles) {
    if (!title.toLowerCase().startsWith(prefix.toLowerCase())) continue;
    const suffix = title.slice(prefix.length);
    if (!/^[1-9]\d*$/.test(suffix)) continue;
    highest = Math.max(highest, Number(suffix));
  }
  return `${prefix}${highest + 1}`;
}
