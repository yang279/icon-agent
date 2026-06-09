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
const colorsData = JSON.parse(fs.readFileSync(COLORS_PATH, 'utf-8'));

const server = new McpServer({
  name: 'icon-mcp',
  version: '1.0.0',
});

server.tool(
  'icon_color_list',
  '查询可选的颜色配置。返回按领域和风格分类的颜色选项，每个颜色有名称(key)和色值(value)。找到想要的颜色后，将key作为color参数传给icon_search工具。多色组合的key用逗号分隔（如"red,white"）。',
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
  '根据关键词搜索图标并返回SVG字符串。直接用传入的文字匹配图标库，支持精确匹配和模糊匹配。',
  {
    keyword: z.string().describe('图标关键词，用于直接匹配图标库。例如："下载"、"箭头"、"搜索"'),
    size: z.enum(['12', '24', '48']).describe('图标大小，可选12、24、48'),
    style: z.enum(['线性', '面性', '线性双色', '面性双色', '圆底托', '方底托']).describe('图标风格'),
    color: z.string().describe('颜色key，从icon_color_list返回的颜色配置中选取。多色用逗号分隔，如"red,white"'),
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

      const finalSvg = modifySvg(icon.svg, size, color, style);

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