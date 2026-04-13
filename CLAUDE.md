<!-- OMC:START -->
<!-- OMC:VERSION:4.10.1 -->

# oh-my-claudecode - Intelligent Multi-Agent Orchestration

You are running with oh-my-claudecode (OMC), a multi-agent orchestration layer for Claude Code.
Coordinate specialized agents, tools, and skills so work is completed accurately and efficiently.

<operating_principles>
- Delegate specialized work to the most appropriate agent.
- Prefer evidence over assumptions: verify outcomes before final claims.
- Choose the lightest-weight path that preserves quality.
- Consult official docs before implementing with SDKs/frameworks/APIs.
</operating_principles>

<delegation_rules>
Delegate for: multi-file changes, refactors, debugging, reviews, planning, research, verification.
Work directly for: trivial ops, small clarifications, single commands.
Route code to `executor` (use `model=opus` for complex work). Uncertain SDK usage → `document-specialist` (repo docs first; Context Hub / `chub` when available, graceful web fallback otherwise).
</delegation_rules>

<model_routing>
`haiku` (quick lookups), `sonnet` (standard), `opus` (architecture, deep analysis).
Direct writes OK for: `~/.claude/**`, `.omc/**`, `.claude/**`, `CLAUDE.md`, `AGENTS.md`.
</model_routing>

<skills>
Invoke via `/oh-my-claudecode:<name>`. Trigger patterns auto-detect keywords.
Tier-0 workflows include `autopilot`, `ultrawork`, `ralph`, `team`, and `ralplan`.
Keyword triggers: `"autopilot"→autopilot`, `"ralph"→ralph`, `"ulw"→ultrawork`, `"ccg"→ccg`, `"ralplan"→ralplan`, `"deep interview"→deep-interview`, `"deslop"`/`"anti-slop"`→ai-slop-cleaner, `"deep-analyze"`→analysis mode, `"tdd"`→TDD mode, `"deepsearch"`→codebase search, `"ultrathink"`→deep reasoning, `"cancelomc"`→cancel.
Team orchestration is explicit via `/team`.
Detailed agent catalog, tools, team pipeline, commit protocol, and full skills registry live in the native `omc-reference` skill when skills are available, including reference for `explore`, `planner`, `architect`, `executor`, `designer`, and `writer`; this file remains sufficient without skill support.
</skills>

<verification>
Verify before claiming completion. Size appropriately: small→haiku, standard→sonnet, large/security→opus.
If verification fails, keep iterating.
</verification>

<execution_protocols>
Broad requests: explore first, then plan. 2+ independent tasks in parallel. `run_in_background` for builds/tests.
Keep authoring and review as separate passes: writer pass creates or revises content, reviewer/verifier pass evaluates it later in a separate lane.
Never self-approve in the same active context; use `code-reviewer` or `verifier` for the approval pass.
Before concluding: zero pending tasks, tests passing, verifier evidence collected.
</execution_protocols>

<hooks_and_context>
Hooks inject `<system-reminder>` tags. Key patterns: `hook success: Success` (proceed), `[MAGIC KEYWORD: ...]` (invoke skill), `The boulder never stops` (ralph/ultrawork active).
Persistence: `<remember>` (7 days), `<remember priority>` (permanent).
Kill switches: `DISABLE_OMC`, `OMC_SKIP_HOOKS` (comma-separated).
</hooks_and_context>

<cancellation>
`/oh-my-claudecode:cancel` ends execution modes. Cancel when done+verified or blocked. Don't cancel if work incomplete.
</cancellation>

<worktree_paths>
State: `.omc/state/`, `.omc/state/sessions/{sessionId}/`, `.omc/notepad.md`, `.omc/project-memory.json`, `.omc/plans/`, `.omc/research/`, `.omc/logs/`
</worktree_paths>

## Setup

Say "setup omc" or run `/oh-my-claudecode:omc-setup`.
<!-- OMC:END -->

---

## 权限自动确认 (P0)

**原则**: 微信消息处理时，自动确认权限请求，避免等待

### 自动确认范围

| 操作类型 | 策略 | 说明 |
|----------|------|------|
| 文件创建/编辑 | ✅ 自动确认 | 工作空间内文件 |
| Bash 命令 | ✅ 自动确认 | 白名单内命令 |
| 子 Agent 创建 | ✅ 自动确认 | 最多 3 个并行 |
| 网络请求 | ✅ 自动确认 | API 调用、知识库上传 |
| 外部工具 | ⚠️ 需确认 | 涉及敏感数据时 |
| WeChat 频道文件 | ✅ 自动确认 | `~/.claude/channels/weixin/` 目录（last-check.json、pending.json 等） |

### Bash 命令白名单

```
git (add|commit|status|diff|log|push|pull)
npm (install|run|test|build|list)
bun (run|test|build|install|x)
node --eval
curl
mkdir|touch|cp|mv|rm|cat|echo
```

### 例外情况（需人工确认）

- 删除工作空间外文件
- 修改系统配置
- 访问敏感目录（~/.ssh, ~/.aws 等）
- 执行 sudo/root 权限命令

---

## 微信消息检测规范

**原则**: 没有新消息时，不要更新 last-check.json 时间戳

**Why:** 用户明确要求只在检测到新消息时才更新时间戳，避免不必要的文件写入操作。

**How to apply:**
1. 使用 `bun run auto-process.ts check` 检测消息
2. 如果 `newMessages === 0`，直接返回，不执行任何写入操作
3. 只有检测到新消息并处理完成后，才由处理流程自动更新时间戳

---

## 微信消息回复格式规则

**原则**: 多行文本必须使用 reply-file 方式发送

**Why:** 用户明确要求多行内容要用 reply-file 方式回复，直接 reply 会导致格式问题。

**How to apply:**
1. 如果回复内容包含 `\n` 换行符，或超过 100 个字符，或包含列表/代码块
2. 先写入临时文件（如 `D:/claudecode/MyAICodes/just-for-weixin/tmp/msg.md`）
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
```

---

## MCP 服务器保活机制

**原则**: 确保有且只有一个 server.ts 进程运行

**Why:** server.ts 是 MCP 服务器，负责轮询微信消息。`auto-process.ts` 包含保活逻辑，会在 server.ts 未运行时自动启动它，并在有多个进程时自动清理。

**How to apply:**
1. `auto-process.ts` 的 `ensureMcpServer()` 函数会在以下场景被调用：
   - 默认命令（无参数）：处理新消息前
   - `check` 命令：不需要确保服务器运行
   - `send-text`、`send-text-file`、`send-file` 等命令：发送消息前
   - `reply`、`reply-file` 命令：发送回复前

2. 保活逻辑：
   - **0 个进程**：启动一个新的 server.ts 后台进程
   - **1 个进程**：不执行任何操作（正常状态）
   - **多个进程**：保留最后一个，终止其他所有

3. 检测逻辑：
   - 使用 `wmic process where "name='bun.exe' and CommandLine LIKE '%server.ts%'"` 检测进程
   - 排除 `auto-process.ts` 自身（避免误判）

**示例输出:**
```bash
# 场景 1：没有进程
[MCP] 服务器未运行，正在启动...
[MCP] 服务器已启动

# 场景 2：多个进程
[MCP] 检测到 2 个 server.ts 进程，保留最后一个 (PID: 12345)，终止其他进程...
[MCP] 已终止进程 67890
[MCP] 多进程清理完成

# 场景 3：正常（1 个进程）
（无输出，静默处理）
```

---

## 自动记忆强制规则 (P0)

**原则**: 所有微信消息的处理记录必须追加到 `D:\claudecode\MyAICodes\just-for-weixin\memory\weixin-history.md`，无一例外。

**Why:** 用户明确要求所有消息处理都要记录下来，作为历史记录和知识沉淀。

**How to apply:**
1. 每次微信消息处理完成后（发送回复后），立即追加记录到 weixin-history.md
2. 记录格式：
   ```markdown
   ### 消息 X: [简短主题]
   **消息**: [用户消息摘要，前 100 字]
   **处理**: [处理流程简述]
   **结果**: [处理结果摘要，前 200 字]
   **标签**: #[关键词 1] #[关键词 2] #[关键词 3]
   ```
3. 按日期分组，新日期创建新章节
4. 处理完成和记录追加是两个独立步骤，都要执行

**违规处理**: 如果发现忘记记录，立即补充追加。

---

## 文档存放规则

**规则**: 所有生成的文档（DOCX、PDF、Markdown 等）必须存放到 `D:\claudecode\MyAICodes\just-for-weixin\` 目录下。

**Why**: 用户明确要求统一文档存放位置，便于查找和管理，同时避免占用 C 盘空间。

**How to apply:**
1. 使用 docx 技能生成文档时，输出路径指定为 `D:/claudecode/MyAICodes/just-for-weixin/`
2. 临时文件也使用此目录下的 `/tmp` 子目录
3. IMA 知识库上传的文档除外（云端存储）

---

## Harness 流程处理准则

**原则**: 所有微信消息必须通过 Harness 流程处理：Plan → Work → Review → Reply

**最高优先级**: 每一步结果都必须返回给微信

**How to apply:**
1. Plan 阶段：发送计划概要
2. Work 阶段：每步执行结果都要发送（格式：`【Phase 2: Work - Step X/Y】...`）
3. Review 阶段：发送审查维度和结论
4. Reply 阶段：发送最终处理总结

---

## 文件存储位置规则

**规则**: 所有文件都写到 `D:\claudecode\MyAICodes\just-for-weixin\` 主目录，避免使用 C 盘。

**Why:** 用户明确要求避免占用 C 盘空间，便于统一管理和清理。

**How to apply:**
1. 临时文件使用 `D:/claudecode/MyAICodes/just-for-weixin/tmp/`
2. 生成的文档使用主目录
3. 记忆文件使用 `D:/claudecode/MyAICodes/just-for-weixin/memory/`
