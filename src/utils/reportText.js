import { formatDuration } from './formatTime';

// Shared report-text builder. Sole consumer is ReportGeneratorModal, which backs all
// three report entry points (R shortcut, Daily view button, Stats view range export).

export function buildReportText({ logs, startDate, endDate, items, t, timeUnit, groupByCategory = true }) {
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

  const lines = [
    `${t('date')}: ${dateLabel}`,
    `${t('total')}: ${fmt(grandTotal)}`,
  ];

  const pushSection = (heading, entries) => {
    if (entries.length === 0) return;
    lines.push('');
    if (heading) lines.push(heading);
    for (const entry of entries) {
      lines.push(`${entry.name}: ${fmt(entry.duration)}`);
    }
  };

  if (groupByCategory) {
    // legacy items predate `category` and are reported as fundamentals
    pushSection(
      `${t('categories.fundamentals')}:`,
      breakdown.filter((e) => e.category === 'fundamentals' || !e.category)
    );
    pushSection(
      `${t('categories.songs')}:`,
      breakdown.filter((e) => e.category === 'songs')
    );
  } else {
    pushSection(null, breakdown);
  }

  return lines.join('\n');
}

export function formatReportDate(dateString) {
  const [year, month, day] = dateString.split('-');
  return `${year}/${month}/${day}`;
}
