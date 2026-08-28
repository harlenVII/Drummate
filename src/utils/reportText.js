import { formatDuration } from './formatTime';

// Shared report-text builder. Used by ReportGeneratorModal (arbitrary date range)
// and DailyReportModal (today only, opened with the R shortcut).

export function buildReportText(logs, startDate, endDate, items, t, timeUnit) {
  const totals = {};
  for (const log of logs) {
    totals[log.itemId] = (totals[log.itemId] || 0) + log.duration;
  }

  // items with no matching name are omitted (e.g. trashed items), matching DailyReport behaviour
  const breakdown = Object.entries(totals)
    .map(([itemId, duration]) => {
      const item = items.find((i) => i.id === Number(itemId));
      return { name: item?.name, category: item?.category, duration };
    })
    .filter((e) => e.name != null && e.duration > 0)
    .sort((a, b) => b.duration - a.duration);

  const grandTotal = breakdown.reduce((sum, e) => sum + e.duration, 0);
  const fmt = (d) => `${formatDuration(d, timeUnit)} ${t(timeUnit)}`;

  const dateLabel =
    startDate === endDate
      ? formatReportDate(startDate)
      : `${formatReportDate(startDate)} – ${formatReportDate(endDate)}`;

  const fundamentals = breakdown.filter((e) => e.category === 'fundamentals' || !e.category);
  const songs = breakdown.filter((e) => e.category === 'songs');

  const lines = [
    `${t('date')}: ${dateLabel}`,
    `${t('total')}: ${fmt(grandTotal)}`,
  ];

  if (fundamentals.length > 0) {
    lines.push('');
    lines.push(`${t('categories.fundamentals')}:`);
    for (const entry of fundamentals) {
      lines.push(`${entry.name}: ${fmt(entry.duration)}`);
    }
  }

  if (songs.length > 0) {
    lines.push('');
    lines.push(`${t('categories.songs')}:`);
    for (const entry of songs) {
      lines.push(`${entry.name}: ${fmt(entry.duration)}`);
    }
  }

  return lines.join('\n');
}

export function formatReportDate(dateString) {
  const [year, month, day] = dateString.split('-');
  return `${year}/${month}/${day}`;
}
