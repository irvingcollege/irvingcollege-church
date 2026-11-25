import ical from 'node-ical';

const zone = 'America/Chicago';
const dayFormat = new Intl.DateTimeFormat('sv-SE', { timeZone: zone, dateStyle: 'short' });
const timeFormat = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeStyle: 'short' });
const dayMs = 86_400_000;

export function publicFeed(value) {
  const url = new URL(value);
  if (url.origin !== 'https://calendar.google.com') throw new Error('Expected a Google Calendar URL.');
  if (/^\/calendar\/ical\/[^/]+\/public\/basic\.ics$/.test(url.pathname)) {
    return url.origin + url.pathname;
  }
  const calendarId = url.searchParams.get('src');
  if (url.pathname !== '/calendar/embed' || !calendarId) throw new Error('Expected a public calendar.');
  return `https://calendar.google.com/calendar/ical/${encodeURIComponent(calendarId)}/public/basic.ics`;
}

export function agenda(source, now = new Date()) {
  const first = dayFormat.format(now);
  const start = new Date(first + 'T00:00:00Z');
  const last = new Date(+start + 42 * dayMs).toISOString().slice(0, 10);
  const range = { from: new Date(+start - dayMs), to: new Date(+start + 44 * dayMs) };

  return Object.values(ical.sync.parseICS(source))
    .filter(event => event.type === 'VEVENT' && event.start && event.status !== 'CANCELLED')
    .flatMap(event => ical.expandRecurringEvent(event, range))
    .filter(instance => instance.event.status !== 'CANCELLED' && instance.summary)
    .map(instance => ({
      title: instance.summary,
      date: instance.isFullDay ? instance.start.toISOString().slice(0, 10) : dayFormat.format(instance.start),
      time: instance.isFullDay ? 'All day' : [instance.start, instance.end && instance.end > instance.start ? instance.end : null].filter(Boolean).map(date => timeFormat.format(date)).join(' – '),
      location: instance.event.location || '',
      description: typeof instance.event.description === 'string' ? instance.event.description : '',
      order: instance.isFullDay ? 0 : +instance.start,
    }))
    .filter(event => event.date >= first && event.date <= last)
    .sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order || a.title.localeCompare(b.title))
    .map(({ order, ...event }) => event);
}

// Runs during Astro's build, so the published app contains the event list.
export async function loadCalendarEvents(calendarUrl) {
  if (!calendarUrl?.trim()) return null;
  try {
    const response = await fetch(publicFeed(calendarUrl), {
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`Google Calendar returned ${response.status}.`);
    const body = await response.text();
    if (!body.trimStart().startsWith('BEGIN:VCALENDAR')) throw new Error('Expected an iCalendar feed.');
    return agenda(body);
  } catch (error) {
    console.warn('Calendar import unavailable:', error.message);
    return null;
  }
}
