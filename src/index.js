require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { SSEServerTransport } = require('@modelcontextprotocol/sdk/server/sse.js');
const z = require('zod');
const { findIcon } = require('./matcher');
const modifySvg = require('../iconFunction');

const COLORS_PATH = path.resolve(__dirname, '../colorConfig/colors.json');
const configData = JSON.parse(fs.readFileSync(COLORS_PATH, 'utf-8'));
const strokeConfig = configData.strokeConfig;
const colorsData = configData.colors;



const server = new McpServer({
  name: 'icon-mcp',
  version: '1.0.0',
});

server.tool(
  'icon_color_list',
  '查询可选的颜色配置。传入风格和可选的领域，返回该风格下的所有颜色key-value（如"red": "#E53935"）。从中选择一个key对应的色值，作为icon_search的color参数直接传入。',
  {
    style: z.enum(['线性', '面性', '线性双色', '面性双色', '圆底托', '方底托']).describe('图标风格'),
    领域: z.enum(['领域1', '领域2']).optional().describe('限定搜索的领域，不传则搜索所有领域'),
  },
  async ({ style, 领域 }) => {
    const domains = 领域 ? [领域] : Object.keys(colorsData);
    const merged = {};
    for (const d of domains) {
      const styleColors = colorsData[d]?.[style];
      if (!styleColors) continue;
      Object.assign(merged, styleColors);
    }
    if (Object.keys(merged).length === 0) {
      return {
        content: [
          { type: 'text', text: `未找到风格"${style}"下的颜色配置` },
        ],
        isError: true,
      };
    }
    return {
      content: [
        { type: 'text', text: JSON.stringify(merged, null, 2) },
      ],
    };
  }
);

server.tool(
  'icon_search',
  '根据关键词搜索图标并返回SVG字符串。stroke（描边粗细）由style和size自动计算，无需手动传入。attempt表示当前搜索次数（从1开始），第2次搜索将直接返回结果并提示不能再继续搜索。',
  {
    keyword: z.string().describe('图标关键词，用于直接匹配图标库。例如："下载"、"箭头"、"搜索"'),
    size: z.enum(['12', '24', '48']).describe('图标大小'),
    style: z.enum(['线性', '面性', '线性双色', '面性双色', '圆底托', '方底托']).describe('图标风格'),
    color: z.string().describe('色值字符串，从icon_color_list返回中选取。例如"#E53935"，多色"#E53935,#FFFFFF"'),
    attempt: z.number().int().min(1).max(2).default(1).describe('搜索次数，从1开始，最多2次。第2次搜索将作为最终结果，不能继续搜索'),
  },
  async ({ keyword, size, style, color, attempt }) => {
    try {
      const result = findIcon(keyword, attempt);

      if (!result.icon) {
        return {
          content: [
            { type: 'text', text: `未找到匹配图标: "${keyword}"` },
          ],
          isError: true,
        };
      }

      const stroke = strokeConfig[style]?.[size] || '';
      const finalSvg = modifySvg(result.icon.svg, size, color, stroke, style);

      let message = finalSvg;
      if (!result.exact) {
        message = `模糊匹配到图标: "${result.icon.name}"（共${result.totalMatches}个匹配，当前第${result.attempt}次搜索）\n${finalSvg}`;
      }
      if (attempt >= 2) {
        message = `⚠️ 已达最大搜索次数(2次)，不能继续搜索。当前匹配图标: "${result.icon.name}"\n${finalSvg}`;
      }

      return {
        content: [
          { type: 'text', text: message },
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

const app = express();
app.use(express.json());

const transports = {};

app.get('/sse', (req, res) => {
  const transport = new SSEServerTransport('/messages', res);
  transports[transport.sessionId] = transport;
  server.connect(transport);
});

app.post('/messages', (req, res) => {
  const sessionId = req.query.sessionId;
  const transport = transports[sessionId];
  if (transport) {
    transport.handlePostMessage(req, res, req.body);
  } else {
    res.status(400).json({ error: 'No session found' });
  }
});

const PORT = process.env.PORT || 3104;
app.listen(PORT, () => {
  console.log(`iconMcp SSE 服务已启动: http://localhost:${PORT}/sse`);
});