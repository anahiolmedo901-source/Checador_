export interface ExportColumn<T> {
  key: keyof T;
  header: string;
  /** Devuelve el valor a exportar (puede transformar). */
  get?: (row: T) => string | number;
}

function value<T>(row: T, col: ExportColumn<T>): string | number {
  if (col.get) return col.get(row);
  const v = row[col.key];
  return v === null || v === undefined ? '' : String(v);
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportCSV<T>(rows: T[], columns: ExportColumn<T>[], filename: string): void {
  const header = columns.map((c) => `"${c.header.replace(/"/g, '""')}"`).join(',');
  const body = rows
    .map((r) => columns.map((c) => `"${String(value(r, c)).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const csv = `\uFEFF${header}\n${body}`;
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), `${filename}.csv`);
}

export async function exportExcel<T>(rows: T[], columns: ExportColumn<T>[], filename: string, sheet = 'Datos'): Promise<void> {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheet);
  ws.columns = columns.map((c) => ({ header: c.header, key: String(c.key), width: 18 }));
  for (const r of rows) {
    ws.addRow(Object.fromEntries(columns.map((c) => [String(c.key), value(r, c)])));
  }
  ws.getRow(1).font = { bold: true };
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  const buffer = await wb.xlsx.writeBuffer();
  downloadBlob(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${filename}.xlsx`);
}

export async function exportPDF<T>(rows: T[], columns: ExportColumn<T>[], filename: string, title: string, subtitle?: string): Promise<void> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: 'landscape' });
  doc.setFontSize(14);
  doc.text(title, 14, 16);
  if (subtitle) {
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(subtitle, 14, 22);
    doc.setTextColor(0);
  }
  autoTable(doc, {
    startY: subtitle ? 28 : 24,
    head: [columns.map((c) => c.header)],
    body: rows.map((r) => columns.map((c) => String(value(r, c)))),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [34, 139, 230], textColor: 255 },
  });
  doc.save(`${filename}.pdf`);
}
