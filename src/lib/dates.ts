// Sin `timeZone`, Intl usa la zona configurada en el dispositivo.
const businessDateTimeFormatter = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

export function businessWallDateToISOString(wallDate: Date): string {
  const target = Date.UTC(wallDate.getFullYear(), wallDate.getMonth(), wallDate.getDate(), wallDate.getHours(), wallDate.getMinutes(), wallDate.getSeconds());
  let guess = target;
  for (let pass = 0; pass < 3; pass += 1) {
    const parts = businessDateTimeFormatter.formatToParts(new Date(guess));
    const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
    const seen = Date.UTC(value('year'), value('month') - 1, value('day'), value('hour'), value('minute'), value('second'));
    const delta = target - seen;
    guess += delta;
    if (delta === 0) break;
  }
  return new Date(guess).toISOString();
}

export function formatBusinessDateTimeInput(value: string): string {
  const parts = businessDateTimeFormatter.formatToParts(new Date(value));
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '00';
  return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}`;
}

const timeFormatter = new Intl.DateTimeFormat('es-MX', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
});

const dateFormatter = new Intl.DateTimeFormat('es-MX', {
  weekday: 'short',
  day: '2-digit',
  month: 'short',
  hour12: false,
});

const fullDateFormatter = new Intl.DateTimeFormat('es-MX', {
  weekday: 'long',
  day: '2-digit',
  month: 'long',
  year: 'numeric',
  hour12: false,
});

export function formatTime(value: string | Date | null | undefined): string {
  if (!value) return '--:--';
  const date = typeof value === 'string' ? new Date(value) : value;
  return timeFormatter.format(date);
}

export function formatDate(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return dateFormatter.format(date);
}

export function formatFullDate(value: Date): string {
  return fullDateFormatter.format(value);
}

export function formatDuration(start: string | Date, end: string | Date): string {
  const from = typeof start === 'string' ? new Date(start) : start;
  const to = typeof end === 'string' ? new Date(end) : end;
  const minutes = Math.max(0, Math.round((to.getTime() - from.getTime()) / 60000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return `${h} h ${m} min`;
}
