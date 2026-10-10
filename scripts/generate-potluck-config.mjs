
import { readFile, mkdir, writeFile } from "node:fs/promises";

const source = await readFile(
  "src/content/potluck/potluck.md",
  "utf8"
);

const frontmatter = source.match(/^---\s*\n([\s\S]*?)\n---/);

if (!frontmatter) {
  throw new Error("Potluck settings frontmatter not found.");
}

function field(name) {
  const match = frontmatter[1].match(
    new RegExp(`^${name}:\\s*(.*)$`, "m")
  );

  if (!match) {
    throw new Error(`Missing potluck setting: ${name}`);
  }

  return match[1].trim().replace(/^["']|["']$/g, "");
}

const date = field("date");

if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  throw new Error("Potluck date must use YYYY-MM-DD.");
}

const config = {
  eventId: date,
  acceptingSignups: field("acceptingSignups") === "true",
};

await mkdir("netlify/functions/generated", {
  recursive: true,
});

await writeFile(
  "netlify/functions/generated/potluck-config.json",
  JSON.stringify(config, null, 2)
);

console.log("Potluck configuration generated:", config);
