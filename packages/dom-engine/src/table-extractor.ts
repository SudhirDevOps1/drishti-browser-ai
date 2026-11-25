export interface ExtractedTable {
  index: number;
  caption?: string;
  headers: string[];
  rows: string[][];
  rowCount: number;
  colCount: number;
}

export function extractTables(): ExtractedTable[] {
  if (typeof document === 'undefined') return [];
  const tables = Array.from(document.querySelectorAll('table'));

  return tables.map((table, i) => {
    const caption = table.querySelector('caption')?.textContent?.trim();
    const headerRow = table.querySelector('thead tr') || table.querySelector('tr');
    const headers = headerRow
      ? Array.from(headerRow.querySelectorAll('th, td')).map((h) => h.textContent?.trim() || '')
      : [];

    const bodyRows = Array.from(table.querySelectorAll('tbody tr, tr:not(:first-child)'));
    const rows = bodyRows
      .map((row) =>
        Array.from(row.querySelectorAll('td, th')).map((cell) => cell.textContent?.trim() || '')
      )
      .slice(0, 100);

    return {
      index: i,
      caption,
      headers,
      rows,
      rowCount: rows.length,
      colCount: Math.max(headers.length, ...rows.map((r) => r.length), 0),
    };
  }).slice(0, 20);
}
