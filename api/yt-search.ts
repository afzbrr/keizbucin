export default async function handler(
  req: { query?: { q?: string | string[] } },
  res: {
    status: (code: number) => { json: (body: unknown) => void };
    setHeader: (name: string, val: string) => void;
  }
) {
  const rawQ = req.query?.q;
  const q = (Array.isArray(rawQ) ? rawQ[0] : rawQ || '').trim();
  if (!q) {
    res.status(400).json({ error: 'Missing query q' });
    return;
  }

  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');

  try {
    const response = await fetch(
      `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      }
    );
    const html = await response.text();
    const match = html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
    if (match?.[1]) {
      res.status(200).json({ videoId: match[1] });
      return;
    }
  } catch {
    // try fallback
  }

  res.status(404).json({ error: 'Video not found' });
}
