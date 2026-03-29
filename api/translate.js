export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { text } = req.body;

  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return res.status(400).json({ error: '请输入要翻译的文字' });
  }
  if (text.trim().length > 200) {
    return res.status(400).json({ error: '文字长度不能超过200字' });
  }

  const apiKey = process.env.QWEN_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: '服务配置错误，请联系管理员' });
  }

  const prompt = `你是专业粤语翻译专家，熟悉香港地道粤语口语及粤拼（Jyutping）。

请将以下普通话翻译成地道香港粤语口语，并为每个汉字标注粤拼：
「${text.trim()}」

翻译要求：
1. 使用地道香港粤语口语，而非书面语直译
2. 多用粤语特有字（如「唔」「係」「喺」「嘅」「咁」「佢」「冇」「食」「睇」等）
3. 保持自然口语语感

请严格按以下 JSON 格式回复，不要加任何其他文字：
{
  "cantonese": "粤语翻译结果（繁体字）",
  "jyutping": ["每","个","字","对","应","的","粤","拼"],
  "explanation": "简短说明主要差异（只在有特殊词汇替换时说明，否则填空字符串\\"\\""）"
}

注意：jyutping 数组的长度必须与 cantonese 字符串的字符数完全一致（一字对一拼，标点符号填空字符串""）。`;

  // Try multiple endpoints in order — first international, fallback to mainland
  const endpoints = [
    'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions',
    'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
  ];

  let lastError = null;

  for (const endpoint of endpoints) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25000); // 25s timeout

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'qwen-plus',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.2,
          max_tokens: 600,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || `API错误 ${response.status}`);
      }

      const data = await response.json();
      const raw = data.choices[0].message.content.trim();

      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('响应格式错误');

      const parsed = JSON.parse(jsonMatch[0]);

      if (!parsed.cantonese || !Array.isArray(parsed.jyutping)) {
        throw new Error('翻译数据格式错误');
      }

      return res.status(200).json(parsed);

    } catch (err) {
      console.error(`Endpoint ${endpoint} failed:`, err.message);
      lastError = err;
      // If it's not a network error, don't try next endpoint
      if (!err.message.includes('fetch') && !err.message.includes('abort') && !err.message.includes('network')) {
        break;
      }
      // Otherwise try next endpoint
    }
  }

  return res.status(500).json({ error: lastError?.message || '翻译失败，请稍后再试' });
}
