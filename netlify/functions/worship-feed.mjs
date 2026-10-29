const BASE = "https://live.irvingcollege.church";
const jsonHeaders = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store, max-age=0" };
async function load(path) {
  const response = await fetch(BASE + path, { signal: AbortSignal.timeout(8000), cache: "no-store" });
  if (!response.ok) throw new Error("Source returned " + response.status);
  return response.json();
}
export default async () => {
  const [status, catalog] = await Promise.allSettled([load("/api/status"), load("/sermons/catalog.json")]);
  const sermons = catalog.status === "fulfilled" && Array.isArray(catalog.value)
    ? catalog.value.filter(s => {
        if (!s || typeof s.date !== "string" || typeof s.title !== "string" || typeof s.url !== "string") return false;
        try {
          const u = new URL(s.url);
          return u.origin === BASE && u.pathname.startsWith("/sermons/") && u.pathname.endsWith(".mp4");
        } catch { return false; }
      }).sort((a,b) => b.date.localeCompare(a.date))
    : [];
  if (status.status === "rejected") console.error("Owncast status error", status.reason);
  if (catalog.status === "rejected") console.error("Sermon catalog error", catalog.reason);
  return new Response(JSON.stringify({
    online: status.status === "fulfilled" && status.value.online === true,
    liveUrl: BASE + "/embed/video",
    latestSermon: sermons[0] || null,
    sermons
  }), { status: (status.status === "rejected" && catalog.status === "rejected") ? 503 : 200, headers: jsonHeaders });
};