require('dotenv').config();
const fs = require('fs');
const express = require('express');
const path = require('path');
const multer = require('multer');
const OpenAI = require('openai');
const modifySvg = require('../iconFunction');

const app = express();

const UPLOAD_DIR = path.resolve(__dirname, '../uploads');
const ICONS_PATH = path.resolve(__dirname, '../iconJson/icons.json');
const LLM_MODEL = 'deepseek-chat';
const upload = multer({ dest: UPLOAD_DIR });

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

let iconsData;
let iconMap;

const rawIcons = JSON.parse(fs.readFileSync(ICONS_PATH, 'utf-8'));
iconsData = rawIcons;
iconMap = new Map(iconsData.map(i => [i.id, i]));

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

function traverseAndResolve(obj, results) {
  if (Array.isArray(obj)) {
    for (const item of obj) {
      traverseAndResolve(item, results);
    }
  } else if (obj && typeof obj === 'object') {
    if (obj.semantic === 'icon' && obj.label) {
      results.push(obj);
    }
    for (const key of Object.keys(obj)) {
      traverseAndResolve(obj[key], results);
    }
  }
}

async function parseLabel(label) {
  const response = await llm.chat.completions.create({
    model: LLM_MODEL,
    messages: [
      { role: 'system', content: LLM_SYSTEM_PROMPT },
      { role: 'user', content: label },
    ],
    temperature: 0.1,
    max_tokens: 100,
    reasoning_effort: 'none',
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

async function resolveIcon(iconObj) {
  const label = iconObj.label;
  const parsed = await parseLabel(label);
  console.log(`label: "${label}" → 解析:`, parsed);

  const icon = findIcon(parsed.name);
  if (!icon) {
    console.log(`未找到匹配图标: "${parsed.name}"`);
    return;
  }

  const finalSvg = modifySvg(icon.svg, parsed.size, parsed.color, parsed.borderSize, parsed.styled);
  iconObj.iconSvg = finalSvg;
}

function successResponse(content) {
  return { content, errorCode: 200, errorMessage: '', success: true };
}

function errorResponse(errorCode, errorMessage) {
  return { content: null, errorCode, errorMessage, success: false };
}

app.post('/resolve', upload.single('file'), async (req, res) => {
  const tmpPath = req.file?.path;
  try {
    let data;
    if (req.file) {
      const raw = fs.readFileSync(tmpPath, 'utf-8');
      data = JSON.parse(raw);
    } else {
      return res.json(errorResponse(400, '请上传 JSON 文件（field: file）'));
    }

    if (!data || typeof data !== 'object') {
      return res.json(errorResponse(400, 'JSON 内容必须为对象或数组'));
    }

    const iconNodes = [];
    traverseAndResolve(data, iconNodes);

    for (const node of iconNodes) {
      await resolveIcon(node);
    }

    res.json(successResponse(data));
  } catch (err) {
    console.error('处理失败:', err.message);
    res.json(errorResponse(500, err.message));
  } finally {
    if (tmpPath) {
      fs.unlink(tmpPath, () => {});
    }
  }
});

app.post('/icon', upload.none(), async (req, res) => {
  try {
    const prompt = req.body.prompt;
    if (!prompt) {
      return res.json(errorResponse(400, '缺少 prompt 参数'));
    }

    const parsed = await parseLabel(prompt);
    const icon = findIcon(parsed.name);

    if (!icon) {
      return res.json(errorResponse(404, `未找到匹配图标: "${parsed.name}"`));
    }

    const finalSvg = modifySvg(icon.svg, parsed.size, parsed.color, parsed.borderSize, parsed.styled);

    res.json(successResponse({ svg: finalSvg }));
  } catch (err) {
    console.error('图标查询失败:', err.message);
    res.json(errorResponse(500, err.message));
  }
});

app.get('/health', (req, res) => {
  res.json(successResponse({ status: 'ok', icons: iconsData.length }));
});

const PORT = process.env.PORT || 3103;

app.listen(PORT, () => {
  console.log(`iconAgent 服务已启动: http://localhost:${PORT}`);
});