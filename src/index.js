require('dotenv').config();
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const z = require('zod');
const { parseLabel } = require('./llm');
const { findIcon } = require('./matcher');
const modifySvg = require('../iconFunction');

const server = new McpServer({
  name: 'icon-mcp',
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