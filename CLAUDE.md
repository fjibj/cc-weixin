# cc-weixin Development Guide

## Project Overview

WeChat channel plugin for Claude Code, connecting WeChat via the official iLink Bot API.
Monorepo structure — the plugin source lives under `plugins/weixin/`.

## Code Style

- TypeScript strict mode, ES module syntax (`import`/`export`)
- 2-space indentation, LF line endings
- No semicolons omission — always use semicolons
- Prefer `const`, use `let` only when reassignment is needed
- All source files should have a JSDoc module comment at the top

## Build & Test

All commands run from `plugins/weixin/`:

```bash
bun install          # install dependencies
bun run typecheck    # tsc --noEmit
bun test             # run all tests
bun test src/media.test.ts  # run a single test file
```

- Prefer running single test files over the full suite during development
- Always run `typecheck` after code changes before committing

## Commit Convention

Follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` new feature
- `fix:` bug fix
- `docs:` documentation only
- `refactor:` code restructuring
- `test:` add/modify tests
- `chore:` build/tooling changes

## Project Structure

```
plugins/weixin/
├── server.ts        # MCP Server entry (platform adapter layer)
├── src/
│   ├── types.ts     # iLink Bot API type definitions
│   ├── api.ts       # HTTP API wrapper
│   ├── accounts.ts  # Credential storage (~/.claude/channels/weixin/)
│   ├── login.ts     # QR code login flow
│   ├── monitor.ts   # Long-poll message receiver (platform-agnostic)
│   ├── send.ts      # Message sending + markdown-to-plaintext
│   ├── media.ts     # CDN upload/download with AES-128-ECB encryption
│   ├── pairing.ts   # Pairing code + allowlist access control
│   └── cli-login.ts # Standalone login script
├── skills/          # Claude Code skill definitions
└── .claude-plugin/  # Plugin metadata
```

## Architecture Decisions

- **Two-layer design**: `src/` is platform-agnostic WeChat communication;
  `server.ts` is the Claude Code adapter. Keep them separated.
- **No reverse engineering**: Only use the official iLink Bot API.
- **Credentials**: Always `chmod 0600` for account files.
  State dir: `~/.claude/channels/weixin/` (overridable via `WEIXIN_STATE_DIR`).
- **Media encryption**: AES-128-ECB with random key per upload.
  Two aes_key encodings exist — see `parseAesKey()` in `media.ts`.

## Common Pitfalls

- `qrcode-terminal` has no types — use `src/qrcode-terminal.d.ts`
- `fetch` body requires `Uint8Array` not `Buffer` for TypeScript compatibility
- Long-poll timeout in `getUpdates` is expected — handle `AbortError` gracefully
- Version numbers must stay in sync across 4 files:
  `package.json`, `server.ts`, `.claude-plugin/plugin.json`, and
  root `.claude-plugin/marketplace.json`
- Test files use `WEIXIN_STATE_DIR` env var to isolate from real credentials

## Security Rules

- Never log or expose tokens, aes_keys, or account credentials
- Never commit `.env`, `account.json`, or any credential files
- Validate all user input at MCP tool boundaries (`server.ts`)

## References

- API protocol: @docs/API-REFERENCE.md
- Architecture design: @docs/DESIGN.md
- Access control: @plugins/weixin/ACCESS.md
- Contributing: @CONTRIBUTING.md

---

## WeChat 消息处理流程 (Harness)

### 流程概述

所有微信消息必须通过 **Harness 流程**处理：Plan → Work → Review → Reply，而且每一步都必须回复

### 处理步骤

1. **检测消息**
   -定时任务，每分钟检测一次
   ```bash
   cd ~/.claude/plugins/cache/cc-weixin/weixin/0.1.0
   bun run auto-process.ts
   ```

2. **创建计划** (`/harness-plan`)
   - 分析消息意图
   - 制定处理计划（Task列表）
   - **必须返回**：计划概要给微信用户

3. **执行计划** (`/harness-work`)
   - 执行计划中的每个 Task
   - **必须返回**：每步执行结果给微信用户
   - 格式：`【Phase 2: Work - Step X/Y】...`

4. **审查结果** (`/harness-review`)
   -- 审查处理结果
   - **必须返回**：审查维度和结论给微信用户
   - 格式：`【Phase 3: Review】...`

5. **发送回复**
   - 发送最终回复
   - **必须返回**：处理总结给微信用户
   - 格式：`【Phase 4: Reply - 处理完成】...`
	- 单行消息：`bun run auto-process.ts reply <chatId> <text> <contextToken>`
	- 多行消息：`bun run auto-process.ts reply-file <chatId> <filePath> <contextToken>`

### 消息回复
**多行文本（超过一行或包含换行符）必须使用 `reply-file` 方式发送，不能用 `reply`**

**Why:** 用户明确要求多行内容要用 reply-file 方式回复，直接 reply 会导致格式问题。

**How to apply:**
1. 如果回复内容包含 `\n` 换行符，或超过 100 个字符，或包含列表/代码块
2. 先写入临时文件（如 `/tmp/msg.md`）
3. 使用 `bun run auto-process.ts reply-file <chatId> <filePath> [contextToken]`
4. 发送后删除临时文件

**示例:**
```bash
# 多行内容写入文件
echo "第一行\n第二行\n第三行" > /tmp/msg.txt

# 使用 reply-file 发送
bun run auto-process.ts reply-file "chatId" "/tmp/msg.txt" "contextToken"
```

**单条消息（单行，短文本）可用 reply:**
```bash
bun run auto-process.ts reply "chatId" "简短回复" "contextToken"

### 消息删除

处理完成后删除消息：
```bash
bun run auto-process.ts remove <timestamp>
```

---

## IMA 知识库/笔记上传

### 凭证配置

**存储位置**：
```
~/.config/ima/client_id  # IMA Client ID
~/.config/ima/api_key    # IMA API Key
```

**获取方式**：
1. 访问 https://ima.qq.com/agent-interface
2. 创建应用获取 Client ID 和 API Key
3. 保存到上述文件路径

### API 端点

**Base URL**：`https://ima.qq.com/openapi/wiki/v1/`

**Headers**：
```
ima-openapi-clientid: {CLIENT_ID}
ima-openapi-apikey: {API_KEY}
Content-Type: application/json
```

### 核心接口

#### 1. 搜索知识库列表
```bash
curl -X POST "https://ima.qq.com/openapi/wiki/v1/search_knowledge_base" \
  -H "ima-openapi-clientid: $CLIENT_ID" \
  -H "ima-openapi-apikey: $API_KEY" \
  -d '{"query": "", "limit": 50}'
```

#### 2. 在指定知识库中搜索
```bash
curl -X POST "https://ima.qq.com/openapi/wiki/v1/search_knowledge" \
  -H "ima-openapi-clientid: $CLIENT_ID" \
  -H "ima-openapi-apikey: $API_KEY" \
  -d '{
    "query": "搜索关键词",
    "knowledge_base_id": "知识库ID"
  }'
```

#### 3. 获取知识库内容列表
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

### 常用知识库

**【小 C 工作日记】**：`b7a2f763b7a2f763`

### 使用示例

**搜索知识库内容**：
```bash
IMA_CLIENT_ID=$(cat ~/.config/ima/client_id)
IMA_API_KEY=$(cat ~/.config/ima/api_key)

curl -s -X POST "https://ima.qq.com/openapi/wiki/v1/search_knowledge" \
  -H "ima-openapi-clientid: $IMA_CLIENT_ID" \
  -H "ima-openapi-apikey: $IMA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "工作日记",
    "knowledge_base_id": "b7a2f763b7a2f763"
  }'
```

### 返回字段说明

- `code`: 0 表示成功
- `msg`: 返回消息
- `data.info_list`: 搜索结果列表
  - `title`: 文档标题
  - `media_id`: 文档ID
  - `highlight_content`: 匹配内容摘要
  - `media_type`: 1=PDF, 2=网页, 6=微信文章
