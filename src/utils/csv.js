// CSV export utility — generates and downloads a CSV file from structured data.

/**
 * Escape a CSV cell value: wrap in quotes if it contains commas, quotes, or newlines.
 * Double any existing quotes per RFC 4180.
 */
function escapeCell(value) {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Download a CSV file in the browser.
 * @param {string} filename - File name including .csv extension
 * @param {string[]} headers - Column header labels
 * @param {string[][]} rows - Array of row arrays (each cell is a string)
 */
export function downloadCSV(filename, headers, rows) {
  const lines = [
    headers.map(escapeCell).join(','),
    ...rows.map((row) => row.map(escapeCell).join(',')),
  ];
  const csvString = lines.join('\r\n');

  // BOM for Excel compatibility with UTF-8
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csvString], { type: 'text/csv;charset=utf-8;' });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();

  // Cleanup
  setTimeout(() => {
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, 100);
}
