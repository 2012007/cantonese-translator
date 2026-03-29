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

  const prompt = '你是专业粤语翻译专家，熟悉香港地道粤语口语及粤拼（Jyutping）。\n\n'
    + '请将以下普通话翻译成地道香港粤语口语，并为每个汉字标注粤拼：\n'
    + '「' + text.trim() + '」\n\n'
    + '翻译要求：\n'
    + '1. 使用地道香港粤语口语，而非书面语直译\n'
    + '2. 多用粤语特有字（如唔係喺嘅咁佢冇食睇等）\n'
    + '3. 保持自然口语语感\n\n'
    + '请严格按以下 JSON 格式回复，不要加任何其他文字：\n'
    + '{\n'
    + '  "cantonese": "粤语翻译结果（繁体字）",\n'
    + '  "jyutping": ["每","个","字","对","应","的","粤","拼"],\n'
    + '  "explanation": "简短说明主要差异，无特殊差异则填空字符串"\n'
    + '}\n\n'
    + 'jyutping数组长度必须与cantonese字符数完全一致，标点符号对应填空字符串。';

  const endpoints = [
    'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions',
    'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
  ];

  let lastError = null;

  for (const endpoint of endpoints) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25000);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + apiKey,
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
        throw new Error(err.error?.message || 'API错误 ' + response.status);
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
      console.error('Endpoint failed:', endpoint, err.message);
      lastError = err;
      const isNetworkErr = err.message.includes('fetch') || err.message.includes('abort') || err.name === 'AbortError';
      if (!isNetworkErr) break;
    }
  }

  return res.status(500).json({ error: lastError?.message || '翻译失败，请稍后再试' });
}
