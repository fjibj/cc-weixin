---
name: IMA 文件上传完整流程
description: 从文件预检到验证的完整步骤，包含所有命令和参数说明
type: reference
---

# IMA 文件上传到知识库 - 完整流程

## 前置准备

### 1. 配置凭证
```bash
# 方式一：配置文件（推荐）
mkdir -p ~/.config/ima
echo "your_client_id" > ~/.config/ima/client_id
echo "your_api_key" > ~/.config/ima/api_key

# 方式二：环境变量
export IMA_OPENAPI_CLIENTID="your_client_id"
export IMA_OPENAPI_APIKEY="your_api_key"
```

### 2. 获取知识库 ID
```bash
IMA_CLIENT_ID=$(cat ~/.config/ima/client_id 2>/dev/null)
IMA_API_KEY=$(cat ~/.config/ima/api_key 2>/dev/null)

# 搜索知识库
curl -s -X POST "https://ima.qq.com/openapi/wiki/v1/search_knowledge_base" \
  -H "ima-openapi-clientid: $IMA_CLIENT_ID" \
  -H "ima-openapi-apikey: $IMA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "知识库名称", "limit": 10}'

# 返回示例：
# {
#   "code": 0,
#   "data": {
#     "info_list": [{"id": "NX2GnZKAAef-Q6Ad...", "name": "小 C 工作日记"}]
#   }
# }
```

## 完整上传流程

### Step 1: 文件预检

```bash
# 运行预检脚本
PREFLIGHT=$(node ~/.claude/plugins/ima-skills/ima-skill/knowledge-base/scripts/preflight-check.cjs \
  --file "/path/to/your/file.md")

echo "$PREFLIGHT"
# 输出示例：
# {"pass":true,"file_path":"...","file_name":"file.md","file_size":8850,"media_type":7,"content_type":"text/markdown"}

# 提取字段（如果通过检查）
FILE_NAME=$(echo "$PREFLIGHT" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));process.stdout.write(d.file_name)")
FILE_SIZE=$(echo "$PREFLIGHT" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));process.stdout.write(String(d.file_size))")
MEDIA_TYPE=$(echo "$PREFLIGHT" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));process.stdout.write(String(d.media_type))")
CONTENT_TYPE=$(echo "$PREFLIGHT" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));process.stdout.write(d.content_type)")
FILE_EXT=$(echo "$PREFLIGHT" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));process.stdout.write(d.file_ext)")
```

**如果 `pass=false`**：根据 `reason` 字段提示用户（类型不支持/大小超限）

### Step 2: 检查文件名重复

```bash
KB_ID="your_knowledge_base_id"  # 从搜索获取

curl -s -X POST "https://ima.qq.com/openapi/wiki/v1/check_repeated_names" \
  -H "ima-openapi-clientid: $IMA_CLIENT_ID" \
  -H "ima-openapi-apikey: $IMA_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"params\": [{\"name\": \"$FILE_NAME\", \"media_type\": $MEDIA_TYPE}],
    \"knowledge_base_id\": \"$KB_ID\"
  }"

# 返回示例：
# {
#   "code": 0,
#   "data": {
#     "results": [{"name": "file.md", "is_repeated": false}]
#   }
# }
```

**如果 `is_repeated=true`**：询问用户是否保留两者（追加时间戳）或取消上传

### Step 3: 创建媒体（获取 COS 凭证）

```bash
CREATE_RESPONSE=$(curl -s -X POST "https://ima.qq.com/openapi/wiki/v1/create_media" \
  -H "ima-openapi-clientid: $IMA_CLIENT_ID" \
  -H "ima-openapi-apikey: $IMA_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"file_name\": \"$FILE_NAME\",
    \"file_size\": $FILE_SIZE,
    \"content_type\": \"$CONTENT_TYPE\",
    \"knowledge_base_id\": \"$KB_ID\",
    \"file_ext\": \"$FILE_EXT\"
  }")

echo "$CREATE_RESPONSE"
# 返回示例：
# {
#   "code": 0,
#   "data": {
#     "media_id": "markdown_xxx...",
#     "cos_credential": {
#       "token": "...",
#       "secret_id": "...",
#       "secret_key": "...",
#       "bucket_name": "ima-share-kb-1258344701",
#       "region": "ap-shanghai",
#       "cos_key": "...",
#       "start_time": "1774920437",
#       "expired_time": "1774963637"
#     }
#   }
# }

# 提取关键字段
MEDIA_ID=$(echo "$CREATE_RESPONSE" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));process.stdout.write(d.data.media_id)")
COS_KEY=$(echo "$CREATE_RESPONSE" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));process.stdout.write(d.data.cos_credential.cos_key)")
COS_TOKEN=$(echo "$CREATE_RESPONSE" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));process.stdout.write(d.data.cos_credential.token)")
COS_SECRET_ID=$(echo "$CREATE_RESPONSE" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));process.stdout.write(d.data.cos_credential.secret_id)")
COS_SECRET_KEY=$(echo "$CREATE_RESPONSE" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));process.stdout.write(d.data.cos_credential.secret_key)")
COS_BUCKET=$(echo "$CREATE_RESPONSE" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));process.stdout.write(d.data.cos_credential.bucket_name)")
COS_REGION=$(echo "$CREATE_RESPONSE" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));process.stdout.write(d.data.cos_credential.region)")
COS_START_TIME=$(echo "$CREATE_RESPONSE" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));process.stdout.write(d.data.cos_credential.start_time)")
COS_EXPIRED_TIME=$(echo "$CREATE_RESPONSE" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));process.stdout.write(d.data.cos_credential.expired_time)")
```

### Step 4: 上传文件到 COS

```bash
node ~/.claude/plugins/ima-skills/ima-skill/knowledge-base/scripts/cos-upload.cjs \
  --file "/path/to/your/file.md" \
  --secret-id "$COS_SECRET_ID" \
  --secret-key "$COS_SECRET_KEY" \
  --token "$COS_TOKEN" \
  --bucket "$COS_BUCKET" \
  --region "$COS_REGION" \
  --cos-key "$COS_KEY" \
  --content-type "$CONTENT_TYPE" \
  --start-time "$COS_START_TIME" \
  --expired-time "$COS_EXPIRED_TIME"

# 成功返回：Upload successful (HTTP 200)
```

### Step 5: 添加到知识库

```bash
curl -s -X POST "https://ima.qq.com/openapi/wiki/v1/add_knowledge" \
  -H "ima-openapi-clientid: $IMA_CLIENT_ID" \
  -H "ima-openapi-apikey: $IMA_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"media_type\": $MEDIA_TYPE,
    \"media_id\": \"$MEDIA_ID\",
    \"title\": \"$FILE_NAME\",
    \"knowledge_base_id\": \"$KB_ID\",
    \"file_info\": {
      \"cos_key\": \"$COS_KEY\",
      \"file_size\": $FILE_SIZE,
      \"file_name\": \"$FILE_NAME\"
    }
  }"

# 成功返回：
# {
#   "code": 0,
#   "data": {
#     "media_id": "markdown_xxx..."
#   }
# }
```

### Step 6: 验证上传

```bash
curl -s -X POST "https://ima.qq.com/openapi/wiki/v1/search_knowledge" \
  -H "ima-openapi-clientid: $IMA_CLIENT_ID" \
  -H "ima-openapi-apikey: $IMA_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"query\": \"$FILE_NAME\",
    \"knowledge_base_id\": \"$KB_ID\"
  }"

# 成功返回包含刚上传的文件信息
```

## 批量上传流程

```bash
# 1. 批量预检所有文件
# 2. 批量检查重名（最多 2000 个）
curl -s -X POST "https://ima.qq.com/openapi/wiki/v1/check_repeated_names" \
  -H "ima-openapi-clientid: $IMA_CLIENT_ID" \
  -H "ima-openapi-apikey: $IMA_API_KEY" \
  -d "{
    \"params\": [
      {\"name\": \"file1.pdf\", \"media_type\": 1},
      {\"name\": \"file2.docx\", \"media_type\": 3}
    ],
    \"knowledge_base_id\": \"$KB_ID\"
  }"

# 3. 逐个调用 create_media → cos-upload → add_knowledge
```

## 常见问题

### 1. COS 上传返回 403 InvalidAccessKeyId
- 原因：临时密钥已过期
- 解决：重新调用 `create_media` 获取新凭证

### 2. 文件类型不支持
- 视频文件、Bilibili/YouTube URL、本地 HTML 不支持通过 API 上传
- 提示用户：「仅支持在 ima 桌面端内添加进知识库」

### 3. 文件大小超限
- Excel/TXT/Xmind/Markdown: 10 MB
- 图片: 30 MB
- PDF/Word/PPT/音频: 200 MB
- 超限文件应在上传前拦截

### 4. 文件名重复
- 不支持替换操作
- 可选：保留两者（自动追加 `_YYYYMMDDHHmmss` 时间戳）或取消

## 参考

- 完整 API 文档：`~/.claude/plugins/ima-skills/ima-skill/knowledge-base/references/api.md`
- 技能主文档：`~/.claude/plugins/ima-skills/ima-skill/SKILL.md`
