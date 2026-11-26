import { randomUUID, timingSafeEqual } from 'node:crypto';
import { getStore } from '@netlify/blobs';

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});

function authorized(request) {
  const expected = Buffer.from(process.env.MEAL_RESULTS_PASSWORD ?? '');
  const provided = Buffer.from(request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '');
  return expected.length > 0 && provided.length === expected.length && timingSafeEqual(expected, provided);
}

const field = (value, max) => typeof value === 'string' && value.trim().length <= max ? value.trim() : '';
const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Chicago' }).format(new Date());

export function validateSignup(body) {
  if (!body || typeof body !== 'object') return null;
  const name = field(body.name, 100);
  const contact = field(body.contact, 160);
  if (!name || !contact) return null;
  if (body.type === 'ministry') {
    const interest = field(body.interest, 1000);
    return interest ? { type: 'ministry', name, contact, interest } : null;
  }
  if (body.type === 'hall') {
    const date = field(body.date, 10);
    const start = field(body.start, 5);
    const end = field(body.end, 5);
    const purpose = field(body.purpose, 1000);
    const parsed = new Date(date + 'T00:00:00Z');
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(+parsed) && parsed.toISOString().slice(0, 10) === date;
    const validTime = value => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
    if (!validDate || date < today() || !validTime(start) || !validTime(end) || end <= start || !purpose) return null;
    return { type: 'hall', name, contact, date, start, end, purpose };
  }
  return null;
}

export default async function handler(request) {
  try {
    if (request.method === 'GET') {
      if (!authorized(request)) return json({ error: 'Incorrect results password.' }, 401);
      const store = getStore({ name: 'church-signup-requests', consistency: 'strong' });
      const { blobs } = await store.list();
      const requests = (await Promise.all(blobs.map(({ key }) => store.get(key, { type: 'json' }))))
        .filter(Boolean).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
      return json({ requests });
    }
    if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
    const text = await request.text();
    if (text.length > 8192) return json({ error: 'Request is too large.' }, 413);
    let body;
    try { body = JSON.parse(text); } catch { return json({ error: 'Invalid request.' }, 400); }
    if (body?.website) return json({ error: 'Unable to submit.' }, 400);
    const data = validateSignup(body);
    if (!data) return json({ error: 'Fill in all required fields, and make sure the requested date and times are valid.' }, 400);
    const id = randomUUID();
    const store = getStore('church-signup-requests');
    await store.setJSON(id, { id, submittedAt: new Date().toISOString(), ...data });
    return json({ success: true }, 201);
  } catch (error) {
    console.error('Signup storage failed', error?.name);
    return json({ error: 'Unable to save or retrieve requests. Please try again.' }, 503);
  }
}
