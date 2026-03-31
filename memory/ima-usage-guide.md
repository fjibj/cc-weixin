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

**小 C 工作日记**：`NX2GnZKAAef-Q6Adh8IEgIi1pHeJL--uN3M-EuEjPWg=`

---

## 笔记上传方法

### 重要：使用 Python 避免编码问题

在 Windows 环境下，bash/curl 可能导致中文内容乱码。**必须使用 Python 进行 UTF-8 编码上传**。

```python
import json
import urllib.request

# 1. 配置凭证
client_id = "your_client_id"
api_key = "your_api_key"

# 2. 准备内容（Markdown 格式）
content = """# 笔记标题

## 章节
- 内容1
- 内容2

*记录时间: 2026-03-31*
"""

# 3. 创建笔记
payload = {
    "content_format": 1,
    "content": content
}

req = urllib.request.Request(
    "https://ima.qq.com/openapi/note/v1/import_doc",
    data=json.dumps(payload, ensure_ascii=False).encode('utf-8'),
    headers={
        "Content-Type": "application/json",
        "ima-openapi-clientid": client_id,
        "ima-openapi-apikey": api_key
    },
    method='POST'
)

with urllib.request.urlopen(req) as response:
    result = json.loads(response.read().decode('utf-8'))
    print(result)
    # 返回：{"code": 0, "data": {"doc_id": "...", "note_id": "..."}}
```

### 将笔记添加到知识库

```python
import json
import urllib.request

client_id = "your_client_id"
api_key = "your_api_key"
kb_id = "your_knowledge_base_id"  # 如：NX2GnZKAAef-Q6Adh8IEgIi1pHeJL--uN3M-EuEjPWg=
doc_id = "note_doc_id_from_import"  # 从上一步获取
note_id = "note_id_from_import"

payload = {
    "media_type": 11,  # 笔记类型
    "note_info": {
        "content_id": doc_id,
        "note_id": note_id
    },
    "knowledge_base_id": kb_id
}

req = urllib.request.Request(
    "https://ima.qq.com/openapi/wiki/v1/add_knowledge",
    data=json.dumps(payload, ensure_ascii=False).encode('utf-8'),
    headers={
        "Content-Type": "application/json",
        "ima-openapi-clientid": client_id,
        "ima-openapi-apikey": api_key
    },
    method='POST'
)

with urllib.request.urlopen(req) as response:
    result = json.loads(response.read().decode('utf-8'))
    print(result)
```

### 完整流程（笔记 → 知识库）

```python
import json
import urllib.request

# 配置
CLIENT_ID = "your_client_id"
API_KEY = "your_api_key"
KB_ID = "your_knowledge_base_id"

# 1. 创建笔记内容
def create_note(title, content):
    payload = {
        "content_format": 1,
        "content": f"# {title}\n\n{content}\n\n*记录时间: 2026-03-31*"
    }

    req = urllib.request.Request(
        "https://ima.qq.com/openapi/note/v1/import_doc",
        data=json.dumps(payload, ensure_ascii=False).encode('utf-8'),
        headers={
            "Content-Type": "application/json",
            "ima-openapi-clientid": CLIENT_ID,
            "ima-openapi-apikey": API_KEY
        },
        method='POST'
    )

    with urllib.request.urlopen(req) as response:
        return json.loads(response.read().decode('utf-8'))

# 2. 添加到知识库
def add_to_knowledge_base(doc_id, note_id, kb_id):
    payload = {
        "media_type": 11,
        "note_info": {
            "content_id": doc_id,
            "note_id": note_id
        },
        "knowledge_base_id": kb_id
    }

    req = urllib.request.Request(
        "https://ima.qq.com/openapi/wiki/v1/add_knowledge",
        data=json.dumps(payload, ensure_ascii=False).encode('utf-8'),
        headers={
            "Content-Type": "application/json",
            "ima-openapi-clientid": CLIENT_ID,
            "ima-openapi-apikey": API_KEY
        },
        method='POST'
    )

    with urllib.request.urlopen(req) as response:
        return json.loads(response.read().decode('utf-8'))

# 使用示例
result1 = create_note("工作日记", "## 今日完成\n- 任务1\n- 任务2")
if result1['code'] == 0:
    doc_id = result1['data']['doc_id']
    note_id = result1['data']['note_id']
    result2 = add_to_knowledge_base(doc_id, note_id, KB_ID)
    print("上传成功!")
```

---

## 文件上传到知识库

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

---

## 参考文档

- [IMA Skill 目录结构](ima-skill-structure.md) — 完整目录结构和关键文件说明
- [IMA 文件上传完整流程](ima-upload-workflow.md) — 从预检到验证的完整步骤
