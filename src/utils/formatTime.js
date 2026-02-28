export function formatMinutes(totalSeconds) {
  return Math.round(totalSeconds / 60);
}

export function formatDuration(totalSeconds, unit) {
  if (unit === 'hours') {
    return (totalSeconds / 3600).toFixed(1);
  }
  return Math.round(totalSeconds / 60);
}

export function formatTime(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((v) => String(v).padStart(2, '0'))
    .join(':');
}
