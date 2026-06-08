require('dotenv').config();
const OpenAI = require('openai');

const LLM_MODEL = 'deepseek-chat';

const llm = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: 'https://api.deepseek.com',
});

const LLM_SYSTEM_PROMPT = `你是一个图标描述分析器。用户会给你一段描述图标的文字（可能是中文或英文），你需要从中提取出图标名称和样式属性信息，输出为JSON对象。

规则：
1. name字段：提取简洁的中文关键词（2-4个字），用于图标库搜索。英文要翻译成中文，描述要提取核心含义
2. size字段：提取图标大小（数字部分），如"24×24"提取"24"，如"16px"提取"16"
3. color字段：提取颜色信息，如"红色"提取"红色"，如"#ff0000"提取"#ff0000"
4. borderSize字段：提取线条粗细描述，如"粗线"提取"粗"，如"细线"提取"细"，如"2px线"提取"2"
5. styled字段：提取线条风格，"线性/细线/描边"输出"border"，"面性/填充/实心"输出"filled"
6. 无法识别的属性取空字符串""
7. 只输出JSON对象，不要输出任何其他内容

示例：
输入：download → 输出：{"name":"下载","color":"","size":"","borderSize":"","styled":""}
输入：下载图标 24×24 细线 → 输出：{"name":"下载","color":"","size":"24","borderSize":"细","styled":"border"}
输入：红色搜索图标 32px 填充 → 输出：{"name":"搜索","color":"红色","size":"32","borderSize":"","styled":"filled"}
输入：箭头 → 输出：{"name":"箭头","color":"","size":"","borderSize":"","styled":""}`;

async function parseLabel(label) {
  const response = await llm.chat.completions.create({
    model: LLM_MODEL,
    messages: [
      { role: 'system', content: LLM_SYSTEM_PROMPT },
      { role: 'user', content: label },
    ],
    temperature: 0.1,
    max_tokens: 100,
  }, {
    extraBody: {
      thinking: { type: 'disabled' },
    },
  });
  const raw = response.choices[0].message.content.trim();
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[^}]+\}/);
    if (match) return JSON.parse(match[0]);
    return { name: raw, color: '', size: '', borderSize: '', styled: '' };
  }
}

module.exports = { parseLabel };