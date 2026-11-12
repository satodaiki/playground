export type IcsEvent = {
  uid: string;
  title: string;
  /** YYYY-MM-DD */
  date: string;
  /** その日の開始からの分（到着）。 */
  startMinutes: number;
  /** その日の開始からの分（終了）。 */
  endMinutes: number;
  location?: string;
  description?: string;
};

function escapeText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

function stamp(date: string, minutes: number): string {
  const total = Math.max(0, Math.floor(minutes));
  const dayOffset = Math.floor(total / 1440);
  const parsed = new Date(`${date}T00:00:00`);
  parsed.setDate(parsed.getDate() + dayOffset);
  const pad = (value: number) => String(value).padStart(2, '0');
  const within = total % 1440;
  return `${parsed.getFullYear()}${pad(parsed.getMonth() + 1)}${pad(parsed.getDate())}T${pad(Math.floor(within / 60))}${pad(within % 60)}00`;
}

/** 旅程イベントを .ics（iCalendar）文字列にする。時刻は現地時間の浮動表記。 */
export function buildIcs(events: IcsEvent[], calendarName = '旅の余白'): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//playground//trip-planner//JA',
    `X-WR-CALNAME:${escapeText(calendarName)}`,
  ];
  for (const event of events) {
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${event.uid}@playground.trip-planner`);
    lines.push(`DTSTART:${stamp(event.date, event.startMinutes)}`);
    lines.push(`DTEND:${stamp(event.date, event.endMinutes)}`);
    lines.push(`SUMMARY:${escapeText(event.title)}`);
    if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
    if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}

export function downloadTextFile(filename: string, text: string, type: string): void {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
