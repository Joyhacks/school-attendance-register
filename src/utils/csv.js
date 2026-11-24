// Builds CSV text that opens cleanly in Excel.
// Cells starting with = + - @ are prefixed with a quote mark so a
// spreadsheet never runs them as a formula.
function escapeCell(value) {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[",\n\r]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv(headers, rows) {
  const lines = [headers, ...rows].map((row) => row.map(escapeCell).join(','));
  // The BOM at the start tells Excel the file is UTF-8.
  return `﻿${lines.join('\r\n')}\r\n`;
}
