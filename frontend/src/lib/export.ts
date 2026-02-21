/**
 * تصدير CSV مع دعم العربية (BOM).
 */
export function downloadCSV(
  headers: string[],
  rows: (string | number)[][],
  filename: string,
): void {
  const escape = (v: string | number) => {
    const s = String(v ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const csv = [
    '\uFEFF',
    headers.join(','),
    ...rows.map((row) => row.map(escape).join(',')),
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
