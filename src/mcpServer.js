require('dotenv').config();
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const z = require('zod');
const modifySvg = require('../iconFunction');

const ICONS_PATH = path.resolve(__dirname, '../iconJson/icons.json');
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

const iconsData = JSON.parse(fs.readFileSync(ICONS_PATH, 'utf-8'));
const iconMap = new Map(iconsData.map(i => [i.id, i]));

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

function findIcon(keyword) {
  const direct = iconMap.get(keyword);
  if (direct) return direct;

  let bestMatch = null;
  let bestScore = 0;
  for (const icon of iconsData) {
    if (icon.name === keyword) {
      return icon;
    }
    if (icon.name.includes(keyword) || keyword.includes(icon.name)) {
      const score = Math.min(icon.name.length, keyword.length) / Math.max(icon.name.length, keyword.length);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = icon;
      }
    }
  }
  return bestMatch;
}

const server = new McpServer({
  name: 'icon-agent',
  version: '1.0.0',
});

server.tool(
  'icon_search',
  '根据描述文字搜索图标并返回SVG字符串。AI会分析描述提取图标名称和样式属性（大小、颜色、线条风格等），匹配图标后返回经过样式修改的SVG。',
  {
    prompt: z.string().describe('对图标的描述文字，可包含图标名称、大小、颜色、线条风格等信息，支持中文和英文。例如："下载图标 24×24 细线"、"红色搜索 32px 填充"、"download"'),
  },
  async ({ prompt }) => {
    try {
      const parsed = await parseLabel(prompt);
      const icon = findIcon(parsed.name);

      if (!icon) {
        return {
          content: [
            { type: 'text', text: `未找到匹配图标: "${parsed.name}"` },
          ],
          isError: true,
        };
      }

      const finalSvg = modifySvg(icon.svg, parsed.size, parsed.color, parsed.borderSize, parsed.styled);

      return {
        content: [
          { type: 'text', text: finalSvg },
        ],
      };
    } catch (err) {
      return {
        content: [
          { type: 'text', text: `图标查询失败: ${err.message}` },
        ],
        isError: true,
      };
    }
  }
);

const transport = new StdioServerTransport();
server.connect(transport).catch(err => {
  console.error('MCP 服务启动失败:', err);
  process.exit(1);
});