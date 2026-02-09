type Delimiter = ',' | ';' | '\t' | '|';

function countDelimiterOutsideQuotes(line: string, delimiter: string): number {
  let inQuotes = false;
  let count = 0;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && ch === delimiter) count += 1;
  }
  return count;
}

export function detectCsvDelimiter(text: string): Delimiter {
  const lines = text.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/);
  const firstNonEmpty = lines.find((l) => l.trim().length > 0) ?? '';
  const candidates: Delimiter[] = [',', ';', '\t', '|'];
  let best: { delimiter: Delimiter; count: number } = { delimiter: ',', count: -1 };
  for (const delim of candidates) {
    const c = countDelimiterOutsideQuotes(firstNonEmpty, delim);
    if (c > best.count) best = { delimiter: delim, count: c };
  }
  return best.delimiter;
}

export function parseCsv(text: string, delimiter: Delimiter): string[][] {
  const input = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (ch === '"') {
      if (inQuotes && input[i + 1] === '"') {
        field += '"';
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && ch === delimiter) {
      row.push(field);
      field = '';
      continue;
    }

    if (!inQuotes && (ch === '\n' || ch === '\r')) {
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
      if (ch === '\r' && input[i + 1] === '\n') i += 1;
      continue;
    }

    field += ch;
  }

  row.push(field);
  rows.push(row);

  // Drop trailing blank rows (common with ending newline).
  while (rows.length > 0) {
    const last = rows[rows.length - 1];
    const isBlank = last.every((cell) => (cell ?? '').trim() === '');
    if (!isBlank) break;
    rows.pop();
  }

  return rows;
}

export function normalizeCsvHeader(value: string): string {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

