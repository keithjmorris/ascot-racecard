// /api/racecard.js
// Serverless function (Vercel). Holds API credentials server-side and proxies
// a single request to The Racing API, so the browser never sees them.
//
// Required environment variables (set in Vercel dashboard, Project Settings
// > Environment Variables, and in a local .env file for `vercel dev`):
//   RACING_API_USER
//   RACING_API_PASS
//
// Ascot's course id on The Racing API is "crs_52". We don't hardcode it
// blindly though — we look it up against /v1/courses on each request and
// fall back to the known id if that lookup fails for any reason, so a
// future change to course ids doesn't silently break the app.

const ASCOT_FALLBACK_ID = "crs_52";
const ASCOT_NAME = "Ascot";

async function authedGet(path, auth) {
  const res = await fetch(`https://api.theracingapi.com${path}`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${path} -> ${res.status} ${res.statusText} ${text}`);
  }
  return res.json();
}

async function resolveAscotId(auth) {
  try {
    const data = await authedGet("/v1/courses", auth);
    const match = (data.courses || []).find(
      (c) => c.course && c.course.toLowerCase() === ASCOT_NAME.toLowerCase()
    );
    if (match && match.id) return match.id;
  } catch (_) {
    // fall through to fallback id below
  }
  return ASCOT_FALLBACK_ID;
}

module.exports = async (req, res) => {
  const user = process.env.RACING_API_USER;
  const pass = process.env.RACING_API_PASS;

  if (!user || !pass) {
    res.status(500).json({
      error:
        "Missing RACING_API_USER / RACING_API_PASS environment variables.",
    });
    return;
  }

  const auth = Buffer.from(`${user}:${pass}`).toString("base64");
  const day = req.query.day === "today" ? "today" : "tomorrow";

  try {
    const courseId = await resolveAscotId(auth);
    const params = new URLSearchParams({ day });
    params.append("course_ids", courseId);

    const data = await authedGet(`/v1/racecards/basic?${params.toString()}`, auth);

    res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=60");
    res.status(200).json({ day, courseId, ...data });
  } catch (err) {
    res.status(502).json({ error: "Upstream request failed", detail: String(err.message || err) });
  }
};