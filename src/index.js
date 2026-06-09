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

function resolveColor(colorPath) {
  const parts = colorPath.split('/');
  if (parts.length !== 3) return null;
  const [domain, style, colorKey] = parts;
  const domainColors = colorsData[domain]?.[style];
  if (!domainColors) return null;
  const colorValue = domainColors[colorKey];
  if (!colorValue) return null;
  return colorValue;
}

const server = new McpServer({
  name: 'icon-mcp',
  version: '1.0.0',
});

server.tool(
  'icon_color_list',
  '查询可选的颜色配置。返回按领域和风格分类的颜色选项。格式为: 领域/风格/颜色key，例如"领域1/线性/red"。找到想要的颜色后，将完整路径作为color参数传给icon_search。多色key用逗号分隔，如"领域1/线性双色/red,white"。',
  {},
  async () => {
    return {
      content: [
        { type: 'text', text: JSON.stringify(colorsData, null, 2) },
      ],
    };
  }
);

server.tool(
  'icon_search',
  '根据关键词搜索图标并返回SVG字符串。stroke（描边粗细）由style和size自动计算，无需手动传入。',
  {
    keyword: z.string().describe('图标关键词，用于直接匹配图标库。例如："下载"、"箭头"、"搜索"'),
    size: z.enum(['12', '24', '48']).describe('图标大小'),
    style: z.enum(['线性', '面性', '线性双色', '面性双色', '圆底托', '方底托']).describe('图标风格'),
    color: z.string().describe('颜色路径，格式: 领域/风格/颜色key。从icon_color_list返回中选取。例如"领域1/线性/red"，多色"领域1/线性双色/red,white"'),
  },
  async ({ keyword, size, style, color }) => {
    try {
      const icon = findIcon(keyword);

      if (!icon) {
        return {
          content: [
            { type: 'text', text: `未找到匹配图标: "${keyword}"` },
          ],
          isError: true,
        };
      }

      const colorValue = resolveColor(color);
      if (!colorValue) {
        return {
          content: [
            { type: 'text', text: `颜色路径无效: "${color}"。请先调用icon_color_list查看可用颜色，格式为: 领域/风格/颜色key` },
          ],
          isError: true,
        };
      }

      const stroke = strokeConfig[style]?.[size] || '';
      const finalSvg = modifySvg(icon.svg, size, colorValue, stroke, style);

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