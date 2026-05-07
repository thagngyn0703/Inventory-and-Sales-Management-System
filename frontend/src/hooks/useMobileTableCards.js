import { useEffect } from 'react';

function extractHeaderLabels(table) {
  const headerRow = table.querySelector('thead tr');
  if (!headerRow) return [];
  const headers = Array.from(headerRow.querySelectorAll('th'));
  return headers.map((th) => th.textContent?.trim() || '');
}

function annotateTableCells(table) {
  if (table.dataset.mobileCards === 'off') return;
  const headers = extractHeaderLabels(table);
  if (!headers.length) return;

  const bodyRows = Array.from(table.querySelectorAll('tbody tr'));
  bodyRows.forEach((row) => {
    const cells = Array.from(row.querySelectorAll('td'));
    cells.forEach((cell, idx) => {
      if (cell.hasAttribute('colspan') || cell.hasAttribute('rowspan')) {
        cell.setAttribute('data-label', '');
        return;
      }
      if (!cell.getAttribute('data-label')) {
        cell.setAttribute('data-label', headers[idx] || '');
      }
    });
  });

  table.classList.add('mobile-card-table-enabled');
}

function annotateAllTables() {
  const tables = document.querySelectorAll('table');
  tables.forEach(annotateTableCells);
}

export default function useMobileTableCards() {
  useEffect(() => {
    let rafId = 0;
    const scheduleAnnotate = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(annotateAllTables);
    };

    scheduleAnnotate();
    const observer = new MutationObserver(scheduleAnnotate);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, []);
}
