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
const COLORS_PATH = path.resolve(__dirname, '../colorConfig/colors.json');
const LLM_MODEL = 'deepseek-chat';
const upload = multer({ dest: UPLOAD_DIR });

const llm = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: 'https://api.deepseek.com',
});

const configData = JSON.parse(fs.readFileSync(COLORS_PATH, 'utf-8'));
const strokeConfig = configData.strokeConfig;
const colorsData = configData.colors;

const LLM_SYSTEM_PROMPT = `你是一个图标描述分析器。用户会给你一段描述图标的文字（可能是中文或英文），你需要从中提取出图标名称和样式属性信息，输出为JSON对象。

规则：
1. name字段：提取简洁的中文关键词（2-4个字），用于图标库搜索。英文要翻译成中文，描述要提取核心含义
2. size字段：提取图标大小，只允许以下值："12"、"24"、"48"，无法识别取空字符串""
3. style字段：提取图标风格，只允许以下值："线性"、"面性"、"线性双色"、"面性双色"、"圆底托"、"方底托"。描述中"线性/细线/描边"对应"线性"，"面性/填充/实心"对应"面性"，无法识别取空字符串""
4. colorKey字段：提取颜色名称，用英文小写表示。单色如"红色"提取"red"，"白色"提取"white"；多色用逗号分隔如"红白色"提取"red,white"。无法识别取空字符串""
5. 只输出JSON对象，不要输出任何其他内容

示例：
输入：download → 输出：{"name":"下载","size":"","style":"","colorKey":""}
输入：下载图标 24×24 细线 → 输出：{"name":"下载","size":"24","style":"线性","colorKey":""}
输入：红色搜索图标 48px 填充 → 输出：{"name":"搜索","size":"48","style":"面性","colorKey":"red"}
输入：下载图标 12 红白双色线性 → 输出：{"name":"下载","size":"12","style":"线性双色","colorKey":"red,white"}
输入：箭头 → 输出：{"name":"箭头","size":"","style":"","colorKey":""}`;

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
  try {
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
      return { name: raw, size: '', style: '', colorKey: '' };
    }
  } catch (err) {
    console.log(`AI解析失败(${err.message}), 使用规则匹配`);
    return ruleBasedParse(label);
  }
}

function ruleBasedParse(label) {
  const result = { name: '', size: '', style: '', colorKey: '' };

  const sizeMatch = label.match(/(\d+)(?:[×x]\d+|px)/);
  if (sizeMatch && ['12', '24', '48'].includes(sizeMatch[1])) {
    result.size = sizeMatch[1];
  }

  if (/线性双色/.test(label)) result.style = '线性双色';
  else if (/面性双色/.test(label)) result.style = '面性双色';
  else if (/圆底/.test(label)) result.style = '圆底托';
  else if (/方底/.test(label)) result.style = '方底托';
  else if (/面性|填充|实心/.test(label)) result.style = '面性';
  else if (/线性|细线|描边/.test(label)) result.style = '线性';

  const colorMap = {
    '红色': 'red', '白色': 'white', '蓝色': 'blue', '绿色': 'green', '黄色': 'yellow', '黑色': 'black', '灰色': 'gray',
    '红白': 'red,white', '红蓝': 'red,blue',
  };

  for (const [cn, en] of Object.entries(colorMap)) {
    if (label.includes(cn)) {
      result.colorKey = en;
      break;
    }
  }

  if (!result.colorKey) {
    const singleColorMap = { '红': 'red', '白': 'white', '蓝': 'blue', '绿': 'green', '黄': 'yellow', '黑': 'black', '灰': 'gray' };
    for (const [cn, en] of Object.entries(singleColorMap)) {
      if (label.includes(cn)) {
        if (result.colorKey) result.colorKey += ',' + en;
        else result.colorKey = en;
      }
    }
  }

  result.name = label
    .replace(/\d+(?:[×x]\d+|px)/g, '')
    .replace(/线性双色|面性双色|线性|面性|细线|粗线|描边|填充|实心|圆底|方底|红色|白色|蓝色|绿色|黄色|黑色|灰色|红白|红蓝|红|白|蓝|绿|黄|黑|灰|色|图标|icon/g, '')
    .trim();

  if (!result.name) result.name = label.trim();

  return result;
}

function resolveColor(colorKey, style) {
  if (!colorKey) return '';
  for (const domain of Object.keys(colorsData)) {
    const domainColors = colorsData[domain]?.[style];
    if (domainColors) {
      const value = domainColors[colorKey];
      if (value) return value;
    }
  }
  return '';
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

  const colorValue = resolveColor(parsed.colorKey, parsed.style);
  const stroke = parsed.style ? (strokeConfig[parsed.style]?.[parsed.size] || '') : '';
  const finalSvg = modifySvg(icon.svg, parsed.size, colorValue, stroke, parsed.style);
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

    const colorValue = resolveColor(parsed.colorKey, parsed.style);
    const stroke = parsed.style ? (strokeConfig[parsed.style]?.[parsed.size] || '') : '';
    const finalSvg = modifySvg(icon.svg, parsed.size, colorValue, stroke, parsed.style);

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