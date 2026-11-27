import { getStore } from "@netlify/blobs";

// One-off remover for the preview test report. Deleted after it runs.
const NOTE = "TEST from Devi — ignore";

export default async function handler(request) {
  if (request.method !== "POST") {
    return json(405, { error: "Use POST." });
  }
  const store = getStore("reports");
  const listed = await store.list();
  const deleted = [];
  const blobs = listed && listed.blobs ? listed.blobs : [];
  for (let i = 0; i < blobs.length; i++) {
    const key = blobs[i] && blobs[i].key;
    if (!key || String(key).indexOf("rl-") === 0) continue;
    let data = null;
    try {
      data = await store.get(key, { type: "json", consistency: "strong" });
    } catch (e) {
      continue;
    }
    if (data && data.note === NOTE) {
      await store.delete(key);
      deleted.push(key);
    }
  }
  return json(200, { deleted: deleted });
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status: status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}
