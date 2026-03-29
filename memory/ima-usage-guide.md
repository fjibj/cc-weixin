---
name: IMA Skill 使用指南
description: |
  IMA (Intelligent Multi-Agent) 知识库技能使用指南，
  包含凭证配置、API 调用方法和常用接口。
type: reference
---

# IMA Skill 使用指南

## 凭证配置

**存储位置**：
```
~/.config/ima/client_id  # IMA Client ID
~/.config/ima/api_key    # IMA API Key
```

**获取方式**：
1. 访问 https://ima.qq.com/agent-interface
2. 创建应用获取 Client ID 和 API Key
3. 保存到上述文件路径

## 技能路径

```
~/.claude/plugins/ima-skills/ima-skill/
├── SKILL.md              # 技能主文档
├── knowledge-base/       # 知识库模块
│   ├── SKILL.md         # 知识库使用指南
│   └── scripts/         # 辅助脚本
└── notes/               # 笔记模块
```

## API 端点

**Base URL**：`https://ima.qq.com/openapi/wiki/v1/`

**Headers**：
```
ima-openapi-clientid: {CLIENT_ID}
ima-openapi-apikey: {API_KEY}
Content-Type: application/json
```

## 核心接口

### 1. 搜索知识库列表
```bash
curl -X POST "https://ima.qq.com/openapi/wiki/v1/search_knowledge_base" \
  -H "ima-openapi-clientid: $CLIENT_ID" \
  -H "ima-openapi-apikey: $API_KEY" \
  -d '{"query": "", "limit": 50}'
```

### 2. 在指定知识库中搜索
```bash
curl -X POST "https://ima.qq.com/openapi/wiki/v1/search_knowledge" \
  -H "ima-openapi-clientid: $CLIENT_ID" \
  -H "ima-openapi-apikey: $API_KEY" \
  -d '{
    "query": "搜索关键词",
    "knowledge_base_id": "知识库ID"
  }'
```

### 3. 获取知识库内容列表
```bash
curl -X POST "https://ima.qq.com/openapi/wiki/v1/get_knowledge_list" \
  -H "ima-openapi-clientid: $CLIENT_ID" \
  -H "ima-openapi-apikey: $API_KEY" \
  -d '{
    "knowledge_base_id": "知识库ID",
    "cursor": "",
    "limit": 50
  }'
```

## 常用知识库

**AI创业**：`E08055XO7o2aonsLo-_NnRCLU9QrE0Ne6h5oFC6xbDM=`

## 使用示例

**搜索一人公司政策**：
```bash
IMA_CLIENT_ID=$(cat ~/.config/ima/client_id)
IMA_API_KEY=$(cat ~/.config/ima/api_key)

curl -s -X POST "https://ima.qq.com/openapi/wiki/v1/search_knowledge" \
  -H "ima-openapi-clientid: $IMA_CLIENT_ID" \
  -H "ima-openapi-apikey: $IMA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "一人公司 OPC 政策",
    "knowledge_base_id": "E08055XO7o2aonsLo-_NnRCLU9QrE0Ne6h5oFC6xbDM="
  }'
```

## 返回字段说明

- `code`: 0 表示成功
- `msg`: 返回消息
- `data.info_list`: 搜索结果列表
  - `title`: 文档标题
  - `media_id`: 文档ID
  - `highlight_content`: 匹配内容摘要
  - `media_type`: 1=PDF, 2=网页, 6=微信文章
