export default async function handler(req, res) {
  // Simple secret check — only you know this URL
  const { secret } = req.query;
  if (secret !== process.env.STATS_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const redisUrl = process.env.UPSTASH_REDIS_KV_REST_API_URL;
  const redisToken = process.env.UPSTASH_REDIS_KV_REST_API_TOKEN;

  if (!redisUrl || !redisToken) {
    return res.status(500).json({ error: 'Redis not configured' });
  }

  try {
    const response = await fetch(redisUrl + '/get/total_translations', {
      headers: { Authorization: 'Bearer ' + redisToken },
    });
    const data = await response.json();
    const count = parseInt(data.result) || 0;

    // Return a simple HTML page
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(`
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>粤语通 · 统计</title>
<style>
  body { font-family: -apple-system, sans-serif; background: #f0f4f8; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
  .card { background: white; border-radius: 16px; padding: 48px; text-align: center; box-shadow: 0 4px 24px rgba(0,0,0,0.08); min-width: 280px; }
  .num { font-size: 64px; font-weight: 700; color: #2a6496; line-height: 1; margin: 16px 0; }
  .label { font-size: 16px; color: #5a7a96; }
  .sub { font-size: 13px; color: #9ab0c4; margin-top: 24px; }
</style>
</head>
<body>
<div class="card">
  <div class="label">累计翻译次数</div>
  <div class="num">${count.toLocaleString()}</div>
  <div class="sub">粤语通 · ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Hong_Kong' })}</div>
</div>
</body>
</html>
    `);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
