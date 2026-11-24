import { passageId } from '../../src/lib/scripture-reference.mjs';

export default async function scripture(request) {
  const respond = (payload, status = 200) =>
    Response.json(payload, { status, headers: { 'Cache-Control': 'no-store' } });
  if (request.method !== 'GET') return respond({}, 405);
  const reference = new URL(request.url).searchParams.get('reference') ?? '';
  const id = reference.length <= 100 && passageId(reference);
  if (!id) return respond({}, 400);
  const key = process.env.YOUVERSION_APP_KEY;
  if (!key) return respond({}, 503);
  try {
    const upstream = await fetch('https://api.youversion.com/v1/bibles/1713/passages/' +
      encodeURIComponent(id) + '?format=text', {
        headers: { 'X-YVP-App-Key': key },
        signal: AbortSignal.timeout(5000)
      });
    if (!upstream.ok) return respond({}, upstream.status === 404 ? 404 : 502);
    const { content } = await upstream.json();
    if (typeof content !== 'string' || !content.trim()) return respond({}, 502);
    return respond({ text: content });
  } catch {
    return respond({}, 502);
  }
}
