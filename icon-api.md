# iconAgent 接口文档

## 1. 图标解析接口

递归遍历 JSON，查找所有 `semantic=icon` 的节点，用 `label` 字段作为关键词进行向量搜索，匹配到图标后在当前对象同级添加 `iconPath` 字段。

**URL:** `POST /resolve`

**请求方式:** 文件上传（multipart/form-data）

**参数:**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| file | File | 是 | JSON 文件，内容为需要解析的结构化数据 |

**JSON 文件要求:**

- 必须是合法的 JSON 对象或数组
- 需要解析的图标节点须包含 `semantic: "icon"` 和 `label` 字段
- 支持任意层级嵌套，服务会递归遍历所有对象和数组

**请求示例:**

```bash
curl -X POST http://localhost:3000/resolve -F "file=@example.json"
```

**输入 JSON 示例:**

```json
{
  "page": {
    "title": "测试页面",
    "sections": [
      {
        "name": "导航区",
        "items": [
          { "semantic": "icon", "label": "搜索" },
          { "semantic": "icon", "label": "箭头" }
        ]
      },
      {
        "name": "内容区",
        "nested": {
          "deep": {
            "buttons": [
              { "semantic": "icon", "label": "下载" },
              { "semantic": "text", "label": "普通文本" }
            ]
          }
        }
      }
    ]
  }
}
```

**成功响应:**

```json
{
  "content": {
    "page": {
      "title": "测试页面",
      "sections": [
        {
          "name": "导航区",
          "items": [
            { "semantic": "icon", "label": "搜索", "iconPath": "/icons/research.svg" },
            { "semantic": "icon", "label": "箭头", "iconPath": "/icons/arrow-left.svg" }
          ]
        },
        {
          "name": "内容区",
          "nested": {
            "deep": {
              "buttons": [
                { "semantic": "icon", "label": "下载", "iconPath": "/icons/download.svg" },
                { "semantic": "text", "label": "普通文本" }
              ]
            }
          }
        }
      ]
    }
  },
  "errorCode": 200,
  "errorMessage": "",
  "success": true
}
```

**失败响应:**

```json
{
  "content": null,
  "errorCode": 500,
  "errorMessage": "错误描述",
  "success": false
}
```

**说明:**

- `iconPath` 为 SVG 文件的相对路径，通过 `http://localhost:3000/icons/{iconId}.svg` 可访问下载
- 同名图标只会生成一次 SVG 文件，后续请求直接复用

---

## 2. 关键词搜索接口

用关键词直接搜索图标库，返回最佳匹配及候选结果。

**URL:** `POST /search`

**请求方式:** multipart/form-data

**参数:**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| keyword | String | 是 | 搜索关键词，支持中文和英文 |

**请求示例:**

```bash
curl -X POST http://localhost:3000/search -F "keyword=箭头"
```

**成功响应:**

```json
{
  "content": {
    "match": {
      "id": "arrow-right",
      "name": "arrow-right",
      "description": "指向右侧的箭头，用于导航、前进、下一步等场景",
      "svg": "<svg ...>...</svg>",
      "score": 0.916
    },
    "candidates": [
      { "id": "arrow-left", "name": "arrow-left", "description": "...", "score": 0.912 },
      { "id": "arrow-up", "name": "arrow-up", "description": "...", "score": 0.91 },
      { "id": "arrow-down", "name": "arrow-down", "description": "...", "score": 0.909 },
      { "id": "upload", "name": "upload", "description": "...", "score": 0.899 }
    ]
  },
  "errorCode": 200,
  "errorMessage": "",
  "success": true
}
```

**字段说明:**

| 字段 | 说明 |
|------|------|
| match | 最佳匹配结果，包含完整 SVG |
| candidates | 其余 4 个候选结果（不含 SVG） |
| score | 相似度分数，0~1，越高越匹配 |

---

## 3. 健康检查接口

**URL:** `GET /health`

**请求示例:**

```bash
curl http://localhost:3000/health
```

**响应:**

```json
{
  "content": { "status": "ok", "icons": 1000 },
  "errorCode": 200,
  "errorMessage": "",
  "success": true
}
```

---

## 4. 图标文件访问

匹配到的 SVG 文件可通过静态路径直接访问下载。

**URL:** `GET /icons/{iconId}.svg`

**示例:**

```bash
curl http://localhost:3000/icons/arrow-right.svg
```

---

## 5. 通用响应格式

所有接口统一返回以下结构：

| 字段 | 类型 | 说明 |
|------|------|------|
| content | Any/null | 成功时为结果数据，失败时为 null |
| errorCode | Number | 200 表示成功，400/500 表示错误 |
| errorMessage | String | 错误信息，成功时为空字符串 |
| success | Boolean | true 表示成功，false 表示失败 |

---

## 6. 错误码

| errorCode | 说明 |
|-----------|------|
| 200 | 成功 |
| 400 | 参数错误（缺少文件、JSON 格式错误等） |
| 500 | 服务内部错误 |

---

## 7. 启动与部署

```bash
# 安装依赖
npm install

# 构建向量索引（首次或数据更新后）
npm run build-index

# 启动服务
npm start
```

**环境变量（.env）:**

| 变量 | 默认值 | 说明 |
|------|--------|------|
| PORT | 3000 | 服务端口 |
| HF_ENDPOINT | - | HuggingFace 镜像地址（国内建议设为 `https://hf-mirror.com`） |