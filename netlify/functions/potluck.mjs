
import { randomUUID, randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { getStore } from "@netlify/blobs";
import { readFileSync } from "node:fs";

const potluckConfig = JSON.parse(
  readFileSync(
    new URL("./generated/potluck-config.json", import.meta.url),
    "utf8"
  )
);

const EVENT_ID = potluckConfig.eventId;
const ACCEPTING_SIGNUPS = potluckConfig.acceptingSignups;

const STORE_NAME = "church-potluck-signups";
const TIME_ZONE = "America/Chicago";
const MAX_ITEMS = 15;

const store = () => getStore(STORE_NAME);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function clean(value, max = 100) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function validate(body) {
  const firstName = clean(body.firstName, 50);
  const lastName = clean(body.lastName, 50);

  const items = Array.isArray(body.items)
    ? body.items.map(item => clean(item, 120)).filter(Boolean)
    : [];

  if (!firstName || !lastName) {
    throw new Error("Please enter your first and last name.");
  }

  if (items.length < 1 || items.length > MAX_ITEMS) {
    throw new Error("Please enter between 1 and 15 items.");
  }

  return { firstName, lastName, items };
}

function hashCode(code) {
  return createHash("sha256")
    .update(code)
    .digest("hex");
}

function codeMatches(code, storedHash) {
  if (!code || !storedHash) return false;

  const a = Buffer.from(hashCode(code));
  const b = Buffer.from(storedHash);

  return a.length === b.length && timingSafeEqual(a, b);
}

function authorized(request) {
  const expected = process.env.POTLUCK_ADMIN_PASSWORD
    ?? process.env.MEAL_RESULTS_PASSWORD
    ?? "";

  const supplied = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "") ?? "";

  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);

  return a.length > 0 &&
    a.length === b.length &&
    timingSafeEqual(a, b);
}

const entryKey = id => `events/${EVENT_ID}/entries/${id}`;

async function allEntries() {
  const dataStore = store();
  const entries = [];
  let cursor;

  do {
    const page = await dataStore.list({
      prefix: `events/${EVENT_ID}/entries/`,
      ...(cursor ? { cursor } : {}),
    });

    const batch = await Promise.all(
      page.blobs.map(blob =>
        dataStore.get(blob.key, { type: "json" })
      )
    );

    entries.push(...batch.filter(Boolean));
    cursor = page.cursor;
  } while (cursor);

  return entries.sort((a, b) =>
    `${a.lastName} ${a.firstName}`.localeCompare(
      `${b.lastName} ${b.firstName}`
    )
  );
}

function publicEntry(entry) {
  return {
    id: entry.id,
    firstName: entry.firstName,
    lastName: entry.lastName,
    items: entry.items,
  };
}

function adminEntry(entry) {
  const { editCodeHash, ...safe } = entry;
  return safe;
}

export default async function handler(request) {
  try {
    const url = new URL(request.url);
    const action = url.searchParams.get("action");
    const dataStore = store();

    // Public list of dishes
    if (request.method === "GET" && action === "list") {
      const entries = await allEntries();

      return json({
        eventId: EVENT_ID,
        entries: entries.map(publicEntry),
        totalSignups: entries.length,
        totalItems: entries.reduce(
          (sum, entry) => sum + entry.items.length, 0
        ),
      });
    }
// Retrieve a signup using its private edit code
if (request.method === "POST" && action === "lookup") {
  let body;

  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  const id = clean(body.id, 80);
  const editCode = String(body.editCode ?? "");

  const existing = await dataStore.get(
    entryKey(id),
    { type: "json" }
  );

  if (!existing || !codeMatches(editCode, existing.editCodeHash)) {
    return json({
      error: "Signup ID or edit code is incorrect."
    }, 403);
  }

  return json({
    success: true,
    entry: publicEntry(existing),
  });
}

    // Password-protected admin results
    if (request.method === "GET" && action === "results") {
      if (!authorized(request)) {
        return json({ error: "Incorrect admin password." }, 401);
      }

      const entries = await allEntries();

      return json({
        eventId: EVENT_ID,
        entries: entries.map(adminEntry),
        totalSignups: entries.length,
        totalItems: entries.reduce(
          (sum, entry) => sum + entry.items.length, 0
        ),
      });
    }

    if (request.method !== "POST") {
      return json({ error: "Method not allowed." }, 405);
    }

    let body;

    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid submission." }, 400);
    }

    // Create a new signup
    // Create a new signup
if (action === "signup") {
  if (!ACCEPTING_SIGNUPS) {
    return json({
      error: "Signups for this potluck are closed."
    }, 403);
  }
      const details = validate(body);
      const id = randomUUID();
      const editCode = randomBytes(16).toString("hex");

      const entry = {
        id,
        ...details,
        editCodeHash: hashCode(editCode),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await dataStore.setJSON(entryKey(id), entry);

      return json({
        success: true,
        id,
        editCode,
        message: "Your potluck signup has been saved!",
      });
    }

    // Update an existing signup with its private edit code
   
if (action === "update") {
  if (!ACCEPTING_SIGNUPS) {
    return json({
      error: "Signups for this potluck are closed."
    }, 403);
  }
      const id = clean(body.id, 80);
      const editCode = String(body.editCode ?? "");

      const existing = await dataStore.get(
        entryKey(id), { type: "json" }
      );

      if (!existing || !codeMatches(
        editCode, existing.editCodeHash
      )) {
        return json({
          error: "We could not verify your edit code."
        }, 403);
      }

      const details = validate(body);

      await dataStore.setJSON(entryKey(id), {
        ...existing,
        ...details,
        updatedAt: new Date().toISOString(),
      });

      return json({
        success: true,
        message: "Your potluck items have been updated!",
      });
    }

    // Admin edits a signup
    if (action === "admin-update") {
      if (!authorized(request)) {
        return json({ error: "Unauthorized." }, 401);
      }

      const id = clean(body.id, 80);
      const existing = await dataStore.get(
        entryKey(id), { type: "json" }
      );

      if (!existing) {
        return json({ error: "Signup not found." }, 404);
      }

      const details = validate(body);

      await dataStore.setJSON(entryKey(id), {
        ...existing,
        ...details,
        updatedAt: new Date().toISOString(),
      });

      return json({
        success: true,
        message: "Signup updated.",
      });
    }

    // Admin deletes a signup
    if (action === "admin-delete") {
      if (!authorized(request)) {
        return json({ error: "Unauthorized." }, 401);
      }

      const id = clean(body.id, 80);
      const existing = await dataStore.get(
        entryKey(id), { type: "json" }
      );

      if (!existing) {
        return json({ error: "Signup not found." }, 404);
      }

      await dataStore.delete(entryKey(id));

      return json({
        success: true,
        message: "Signup deleted.",
      });
    }

    return json({ error: "Unknown action." }, 400);

  } catch (error) {
    if (
      error.message?.startsWith("Please enter")
    ) {
      return json({ error: error.message }, 400);
    }

    console.error("Potluck function error:", error);

    return json({
      error: "Something went wrong. Please try again."
    }, 500);
  }
}
