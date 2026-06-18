// /api/horse-results.js
// Serverless function (Vercel). Fetches recent past results for a single
// horse, on demand (called when the user expands a horse row in the UI),
// rather than pre-loading this for every runner in every race up front.
//
// Uses GET /v1/racecards/{horse_id}/results — the Basic-plan endpoint for
// "historic results for a horse on any upcoming racecard". Each item
// returned is a full past race (ResultBasic), containing a `runners` array;
// we extract just the entry for the requested horse_id from each, since
// that's the one row relevant to this horse.
//
// Requires the same RACING_API_USER / RACING_API_PASS env vars as
// /api/racecard.js.

module.exports = async (req, res) => {
  const user = process.env.RACING_API_USER;
  const pass = process.env.RACING_API_PASS;

  if (!user || !pass) {
    res.status(500).json({
      error: "Missing RACING_API_USER / RACING_API_PASS environment variables.",
    });
    return;
  }

  const horseId = req.query.horse_id;
  if (!horseId) {
    res.status(400).json({ error: "Missing horse_id query parameter." });
    return;
  }

  const auth = Buffer.from(`${user}:${pass}`).toString("base64");
  const limit = Math.min(Number(req.query.limit) || 5, 20);

  try {
    const apiUrl = `https://api.theracingapi.com/v1/racecards/${encodeURIComponent(horseId)}/results?limit=${limit}`;
    const apiRes = await fetch(apiUrl, {
      headers: { Authorization: `Basic ${auth}` },
    });

    if (!apiRes.ok) {
      const text = await apiRes.text().catch(() => "");
      throw new Error(`${apiRes.status} ${apiRes.statusText} ${text}`);
    }

    const data = await apiRes.json();
    const pastRaces = data.results || [];

    const runs = pastRaces
      .map((race) => {
        const runner = (race.runners || []).find((r) => r.horse_id === horseId);
        if (!runner) return null;
        return {
          date: race.date,
          course: race.course,
          distance_f: race.dist_f,
          going: race.going,
          position: runner.position,
          sp: runner.sp,
          jockey: runner.jockey,
          btn: runner.btn,
        };
      })
      .filter(Boolean)
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
      .slice(0, limit);

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=120");
    res.status(200).json({ horseId, runs });
  } catch (err) {
    res.status(502).json({ error: "Upstream request failed", detail: String(err.message || err) });
  }
};