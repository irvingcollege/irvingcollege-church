import { createHash, timingSafeEqual } from "node:crypto";
import { getStore } from "@netlify/blobs";

const TIME_ZONE = "America/Chicago";
const store = () => getStore("wednesday-meal-rsvps");
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
});

function localParts(date = new Date()) {
  return Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", hourCycle: "h23", weekday: "short",
  }).formatToParts(date).map(({ type, value }) => [type, value]));
}

function addDays(year, month, day, amount) {
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

const iso = ({ year, month, day }) => `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
const label = (date, year = true) => new Intl.DateTimeFormat("en-US", {
  month: "long", day: "numeric", ...(year ? { year: "numeric" } : {}), timeZone: "UTC",
}).format(new Date(`${iso(date)}T12:00:00Z`));

function currentWeek() {
  const p = localParts();
  const weekday = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[p.weekday];
  let days = (3 - weekday + 7) % 7;
  if (weekday === 2 && Number(p.hour) >= 16) days = 8;
  else if (weekday >= 3 && days === 0) days = 7;
  const meal = addDays(Number(p.year), Number(p.month), Number(p.day), days);
  const deadline = addDays(meal.year, meal.month, meal.day, -1);
  return { eventDate: iso(meal), eventLabel: label(meal), deadlineLabel: `Tuesday, ${label(deadline, false)} at 4:00 PM` };
}

function resultsWeek() {
  const p = localParts();

  const weekday = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  }[p.weekday];

  // Results always stay with the upcoming/current Wednesday,
  // even after Tuesday's noon RSVP cutoff.
  const days = (3 - weekday + 7) % 7;

  const meal = addDays(
    Number(p.year),
    Number(p.month),
    Number(p.day),
    days
  );

  const deadline = addDays(
    meal.year,
    meal.month,
    meal.day,
    -1
  );

  return {
    eventDate: iso(meal),
    eventLabel: label(meal),
    deadlineLabel: `Tuesday, ${label(deadline, false)} at 4:00 PM,
  };

function authorized(request) {
  const expected = process.env.MEAL_RESULTS_PASSWORD ?? "";
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(expected); const b = Buffer.from(supplied);
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

async function responsesFor(eventDate) {
  const dataStore = store();
  const { blobs } = await dataStore.list({ prefix: `${eventDate}/`});
  return (await Promise.all(blobs.map(({ key }) => dataStore.get(key, { type: "json" })))).filter(Boolean);
}

export default async (request) => {
  const week = currentWeek();
  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  if (request.method === "GET" && action === "info") return json(week);
  if (request.method === "GET" && action === "results") {
  if (!authorized(request)) {
    return json({ error: "Incorrect results password." }, 401);
  }

  const resultsMeal = resultsWeek();

  const responses = (
    await responsesFor(resultsMeal.eventDate)
  ).sort((a, b) =>
    a.familyName.localeCompare(b.familyName)
  );

  const yes = responses.filter(
    (item) => item.attending
  );

  return json({
    ...resultsMeal,
    responses,
    totalFamilies: responses.length,
    attendingFamilies: yes.length,
    notAttendingFamilies:
      responses.length - yes.length,
    totalMeals: yes.reduce(
      (sum, item) => sum + item.numberEating,
      0
    ),
  });
}
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  let body;
  try { body = await request.json(); } catch { return json({ error: "Please submit the form again." }, 400); }
  const familyName = String(body.familyName ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  const attending = body.attending === "yes";
  const numberEating = attending ? Number(body.numberEating) : 0;
  if (body.eventDate !== week.eventDate) return json({ error: "A new RSVP week has started. Refresh and try again.", refresh: true }, 409);
  if (familyName.length < 2) return json({ error: "Please enter your family name." }, 400);
  if (!['yes', 'no'].includes(body.attending)) return json({ error: "Please choose Yes or No." }, 400);
  if (attending && (!Number.isInteger(numberEating) || numberEating < 1 || numberEating > 30)) return json({ error: "Please enter a number between 1 and 30." }, 400);

  const hash = createHash("sha256").update(familyName.toLowerCase()).digest("hex").slice(0, 32);
  await store().setJSON(`${week.eventDate}/${hash}`, { familyName, attending, numberEating, eventDate: week.eventDate, updatedAt: new Date().toISOString() });
  return json({ success: true, message: attending
    ? `Thank you! We have your family down for ${numberEating} ${numberEating === 1 ? "meal" : "meals"}.`
    : "Thank you! We recorded that your family will not be eating this Wednesday." });
};
