---
name: IMA Skill 目录结构
description: IMA Skill 完整目录结构和关键文件说明
type: reference
---

# IMA Skill 目录结构

## 完整目录树

```
~/.claude/plugins/ima-skills/ima-skill/
├── SKILL.md                      # [必读] 技能主文档：凭证配置、API 调用模板
├── knowledge-base/               # 知识库模块
│   ├── SKILL.md                # [必读] 知识库详细 API 指南
│   ├── references/
│   │   └── api.md            # 完整 API 参考
│   └── scripts/                # 辅助脚本
│       ├── preflight-check.cjs   # [重要] 前置检查：类型检测、大小校验
│       └── cos-upload.cjs         # [重要] COS 文件上传
└── notes/                     # 笔记模块
    └── SKILL.md               # 笔记相关 API 指南
```

## 关键文件说明

### 1. SKILL.md (根目录)
**作用**: 技能入口文档，包含基础配置和 API 调用模板

**核心内容**:
- 凭证配置方式（文件 vs 环境变量）
- `ima_api()` 辅助函数定义
- 模块决策表（何时使用 knowledge-base vs notes）

**常用代码片段**:
```bash
# 加载凭证
IMA_CLIENT_ID="${IMA_OPENAPI_CLIENTID:-$(cat ~/.config/ima/client_id 2>/dev/null)}"
IMA_API_KEY="${IMA_OPENAPI_APIKEY:-$(cat ~/.config/ima/api_key 2>/dev/null)}"

# API 调用函数
ima_api() {
  local path="$1" body="$2"
  curl -s -X POST "https://ima.qq.com/$path" \
    -H "ima-openapi-clientid: $IMA_CLIENT_ID" \
    -H "ima-openapi-apikey: $IMA_API_KEY" \
    -H "Content-Type: application/json" \
    -d "$body"
}
```

### 2. knowledge-base/SKILL.md
**作用**: 知识库操作的完整指南

**核心章节**:
- 接口决策表（根据用户意图选择接口）
- 文件类型检测表（扩展名 → media_type 映射）
- URL 类型检测（网页 vs 微信文章 vs 不支持类型）
- 添加前置检查流程（类型 → 大小 → 音频时长 → 重名）
- 常用工作流（上传文件、添加网页、批量上传）

### 3. scripts/preflight-check.cjs
**作用**: 上传前自动检查文件类型和大小

**用法**:
```bash
node ~/.claude/plugins/ima-skills/ima-skill/knowledge-base/scripts/preflight-check.cjs \
  --file "/path/to/file.pdf"

# 返回 JSON:
# {
#   "pass": true/false,
#   "file_path": "...",
#   "file_name": "file.pdf",
#   "file_ext": "pdf",
#   "file_size": 12345,
#   "media_type": 1,
#   "content_type": "application/pdf"
# }
```

**支持的类型**:
- PDF (media_type=1)
- Word/PPT/Excel (3/4/5)
- Markdown (7)
- 图片 PNG/JPG/WEBP (9)
- TXT (13)
- XMind (14)
- 音频 MP3/M4A/WAV (15)

**不支持的类型**: 视频、Bilibili/YouTube URL、本地 HTML

### 4. scripts/cos-upload.cjs
**作用**: 使用临时密钥上传文件到腾讯云 COS

**用法**:
```bash
node ~/.claude/plugins/ima-skills/ima-skill/knowledge-base/scripts/cos-upload.cjs \
  --file "/path/to/file" \
  --secret-id "..." \
  --secret-key "..." \
  --token "..." \
  --bucket "..." \
  --region "..." \
  --cos-key "..." \
  --content-type "..." \
  --start-time "..." \
  --expired-time "..."
```

**注意**: 所有参数都来自 `create_media` 返回的 `cos_credential`

## 知识库 API 流程概览

```
上传文件到知识库:
  1. preflight-check.cjs (类型+大小检查)
  2. check_repeated_names (检查重名)
  3. create_media (获取上传凭证)
  4. cos-upload.cjs (上传到 COS)
  5. add_knowledge (添加到知识库)
  6. search_knowledge (验证)

添加网页/微信文章:
  1. URL 类型检测
  2. import_urls (直接导入)
```

## 常用知识库 ID

- **小 C 工作日记**: `NX2GnZKAAef-Q6Adh8IEgIi1pHeJL--uN3M-EuEjPWg=`

## 注意事项

1. **文件大小限制**:
   - Excel/TXT/Xmind/Markdown: 10 MB
   - 图片: 30 MB
   - PDF/Word/PPT/音频: 200 MB
   - 音频时长: 最长 2 小时

2. **COS 凭证有效期**: 约 12 小时，超时需重新调用 `create_media`

3. **重名处理**: 不支持替换，可选择保留两者（自动追加时间戳）或取消

4. **批量上传**: 最多 2000 个文件，可一次性检查重名

## 参考链接

- IMA OpenAPI 文档: https://ima.qq.com/agent-interface
- 完整 API 参考: `knowledge-base/references/api.md`
