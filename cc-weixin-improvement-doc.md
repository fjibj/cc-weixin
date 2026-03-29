# cc-weixin 插件微信交互处理改进文档

> 文档版本: 1.1
> 整理时间: 2026-03-29
> 更新内容: 消息队列处理逻辑优化
> 整理人: Claude Code

---

## 更新日志

### v1.2 (2026-03-29)
**修复 getLastCheckTime 隐藏故障**:
1. **问题描述**: `getLastCheckTime()` 函数在 `last-check.json` 读取失败或 `lastTimestamp` 字段无效时返回 0
2. **影响**: 当 `lastCheckTime = 0` 时，`messages.filter(m => m.timestamp > 0)` 会把 queue.json 中所有历史消息都当作新消息，导致 pending.json 堆积大量重复消息
3. **根本原因**: `return lastTimestamp || 0` 会把任何 falsy 值（null、undefined、0）都转为 0
4. **修复方案**:
   - 增强类型检查：验证 `lastTimestamp` 是有效数字且大于 0
   - 添加错误日志：使用 `console.error` 记录读取失败和无效时间戳
   - 安全回退机制：当 `lastCheckTime = 0` 且队列非空时，使用队列最大时间戳作为基准

### v1.1 (2026-03-29)
**消息队列处理优化**:
1. **queue.json 不再清空** - 改为自然累积，由 MCP Server 管理
2. **pending.json 追加模式** - 保留所有消息，仅追加新消息（按 timestamp 去重）
3. **消息删除机制** - 只有通过 `remove` 命令才会从 pending.json 删除
4. **lastCheckTime 过滤** - 使用 `timestamp > lastCheckTime` 筛选新消息

**优势**:
- 避免消息丢失风险
- 支持消息重试机制
- 更清晰的处理状态追踪

---

## 一、改进概述

本次改进将 cc-weixin 插件的**消息处理架构**从"命令式硬编码"升级为"智能代理式"，实现了消息的自然语言理解和动态处理。

**核心改进点**:
1. 消息处理流程重构
2. auto-process.ts 职责简化
3. 回复格式优化
4. 智能处理方式
5. IMA 集成优化

---

## 二、详细改进内容

### 2.1 消息处理流程重构

#### 改进前（硬编码处理）

**架构特点**:
- auto-process.ts 包含所有业务逻辑
- 通过关键词匹配判断用户意图
- 调用固定函数处理请求
- 返回固定格式回复

**代码示例**:
```typescript
// 真正处理消息内容
async function processMessageContent(text: string): Promise<string> {
  const lowerText = text.toLowerCase();

  // 检查磁盘相关命令
  if (lowerText.includes('磁盘') || lowerText.includes('硬盘') ||
      lowerText.includes('d盘') || lowerText.includes('c盘')) {
    return checkDiskSpace(text);  // 固定函数
  }

  // 检查目录相关命令
  if (lowerText.includes('目录') || lowerText.includes('文件夹')) {
    return checkDirectoryCount(text);  // 固定函数
  }

  // 检查天气相关命令
  if (lowerText.includes('天气') || lowerText.includes('温度')) {
    return checkWeather(text);  // 固定函数
  }

  // 检查 IMA skill 相关命令
  if (lowerText.includes('ima') || lowerText.includes('知识库')) {
    return handleIMAQuery(text);  // 固定函数
  }

  // 默认：无法理解命令
  return `我收到了你的消息："${text}"\n\n但我暂时不知道如何处理这个请求。`;
}
```

**处理流程**:
```
微信消息 → MCP Server → queue.json → auto-process.ts
  → 关键词匹配 → 固定函数处理 → 发送回复
```

**存在的问题**:
1. 只能处理预定义的关键词
2. 无法理解自然语言变体
3. 新增功能需要修改代码
4. 回复格式固定，不够灵活

---

#### 改进后（智能代理处理）

**架构特点**:
- auto-process.ts 只负责提取消息
- Claude 在当前会话中理解消息
- 动态调用工具/skill 处理
- 生成自然语言回复

**代码示例**:
```typescript
// 筛选出新消息
const newMessages = messages.filter(m => m.timestamp > lastCheckTime);

// 按时间戳排序（从早到晚）
const sortedMessages = newMessages.sort((a, b) => a.timestamp - b.timestamp);

// 保存到 pending.json 供外部处理
await savePendingMessages(sortedMessages);

// 更新最新时间戳
const latestTimestamp = Math.max(...sortedMessages.map(m => m.timestamp));
await saveLastCheckTime(latestTimestamp);

// 输出新消息（JSON 格式，供外部解析）
console.log(JSON.stringify(sortedMessages, null, 2));
```

**处理流程**:
```
微信消息 → MCP Server → queue.json → auto-process.ts
  → 提取消息 → Claude 理解处理 → 调用工具 → 生成回复 → 发送
```

**改进优势**:
1. 支持自然语言理解，无需固定关键词
2. 可以处理复杂、多变的请求
3. 新增功能无需修改代码
4. 回复格式灵活，可动态生成

---

### 2.2 auto-process.ts 职责简化

#### 改进前

**职责范围**:
- 检查 queue.json 新消息
- 判断消息类型（关键词匹配）
- 执行具体业务逻辑
  - 磁盘检查（调用 wmic）
  - 目录统计（调用 fs.readdir）
  - 天气查询（预留 API 接口）
  - IMA 笔记创建（调用 IMA API）
  - 系统信息获取（调用 system commands）
- 生成回复内容
- 发送回复到微信

**代码行数**: 约 250+ 行

**维护难度**: 高（新增功能需要修改核心文件）

---

#### 改进后

**职责范围**:
- 检查 queue.json 新消息
- 按时间戳筛选未处理消息
- 输出消息 JSON（供外部解析）
- 提供 `reply` 命令发送回复
- 提供 `reply-file` 命令发送文件内容

**代码行数**: 约 130 行

**维护难度**: 低（新增功能在 Claude 会话中完成）

**核心函数**:
```typescript
// 1. 检查新消息
async function processNewMessages() {
  const messages: Message[] = JSON.parse(data);
  const newMessages = messages.filter(m => m.timestamp > lastCheckTime);
  console.log(JSON.stringify(sortedMessages, null, 2));
}

// 2. 发送回复（命令行方式）
export async function replyToWeChat(to: string, text: string, contextToken: string) {
  await sendText({ to, text, baseUrl, token, contextToken });
}
```

---

### 2.3 回复格式优化

#### 改进前

**发送方式**:
```bash
bun run auto-process.ts reply "<用户ID>" "<内容>" "<contextToken>"
```

**问题**:
- 命令行参数中的 `\n` 被当成字面量，不是换行符
- 多行内容需要手动拼接
- 格式控制困难
- 最终效果：所有内容挤在一行

**示例**:
```
📀 C盘空间检查 总容量: 55.9 GB 已使用: 47.0 GB 可用空间: 8.9 GB
```

---

#### 改进后

**新增命令**:
```bash
bun run auto-process.ts reply-file "<用户ID>" "<文件路径>" "<contextToken>"
```

**优势**:
- 从文件读取内容，保留原始格式
- 支持多行文本
- 排版美观
- 易于编辑和修改

**使用方式**:
```bash
# 1. 创建回复文件
echo "📀 C盘空间检查

总容量: 55.9 GB
已使用: 47.0 GB (84.1%)
可用空间: 8.9 GB

检查时间: 2026-03-25" > reply.txt

# 2. 发送文件内容
bun run auto-process.ts reply-file "<用户ID>" "reply.txt" "<contextToken>"
```

**示例效果**:
```
📀 C盘空间检查

总容量: 55.9 GB
已使用: 47.0 GB (84.1%)
可用空间: 8.9 GB

检查时间: 2026-03-25
```

---

### 2.4 智能处理方式

#### 改进前

**处理逻辑**:
- 固定关键词匹配
- 预设处理函数
- 返回模板化回复

**示例**:
| 用户消息 | 匹配关键词 | 处理方式 |
|---------|-----------|---------|
| "检查C盘" | 磁盘/C盘 | checkDiskSpace() |
| "查看内存" | 内存 | checkSystemInfo() |
| "写IMA笔记" | IMA/笔记 | writeIMANote() |

**局限**:
- 只能说固定的话
- 变体无法识别（如"看看C盘空间"可能无法识别）
- 复杂请求无法处理

---

#### 改进后

**处理逻辑**:
- Claude 理解自然语言
- 动态判断用户意图
- 调用合适的工具/skill
- 生成个性化回复

**示例**:
| 用户消息 | Claude 理解 | 处理方式 |
|---------|-------------|---------|
| "检查一下C盘还有多少空间" | 查询C盘空间 | 调用 wmic 获取磁盘信息 |
| "内存使用情况怎么样" | 查询内存 | 调用 wmic 获取内存信息 |
| "把今天的工作整理成笔记发到IMA" | 创建IMA笔记 | 生成文档并调用 IMA API |
| "南京今天天气如何" | 查询天气 | 调用 wttr.in 获取天气 |
| "胆囊炎饮食要注意什么" | 健康咨询 | 搜索网络并整理建议 |

**优势**:
- 支持自然语言表达
- 可以理解上下文
- 能处理复杂、多步骤请求
- 回复个性化、人性化

---

### 2.5 IMA 集成优化

#### 改进前

**流程**:
1. 本地生成 Markdown 文件
2. 保存在本地目录 `C:\Users\Administrator\.claude\notes\`
3. 返回文件路径给用户
4. 用户需手动上传到 IMA

**代码**:
```typescript
const noteFileName = `ima_note_${Date.now()}.md`;
const noteDir = 'C:\\Users\\Administrator\\.claude\\notes';
await writeFile(`${noteDir}\\${noteFileName}`, noteContent, 'utf-8');

return `笔记已创建\n文件名: ${noteFileName}\n路径: ${noteDir}`;
```

**问题**:
- 需要手动上传
- 流程中断
- 用户体验不佳

---

#### 改进后

**流程**:
1. Claude 生成文档内容
2. 直接调用 IMA OpenAPI
3. 笔记自动上传到知识库
4. 返回文档 ID 和确认信息

**代码**:
```typescript
const response = await fetch('https://ima.qq.com/openapi/note/v1/import_doc', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'ima-openapi-clientid': CLIENT_ID,
    'ima-openapi-apikey': API_KEY
  },
  body: JSON.stringify({
    content_format: 1,  // Markdown
    content: noteContent
  })
});

const result = await response.json();
return `笔记已上传到 IMA\n文档 ID: ${result.doc_id}`;
```

**优势**:
- 一键上传，无需手动操作
- 流程完整闭环
- 即时可用

---

## 三、改进前后对比总结

### 3.1 架构对比

| 维度 | 改进前 | 改进后 |
|-----|-------|-------|
| 处理模式 | 命令式、硬编码 | 智能代理、动态处理 |
| 代码耦合 | 高（业务逻辑在脚本中） | 低（脚本只做消息转发） |
| 扩展性 | 差（新增功能需改代码） | 好（Claude 动态处理） |
| 自然语言支持 | 不支持（仅关键词匹配） | 支持（Claude 理解语义） |
| 回复格式 | 固定模板 | 动态生成 |

### 3.2 文件职责对比

| 文件 | 改进前职责 | 改进后职责 |
|-----|-----------|-----------|
| auto-process.ts | 消息检查 + 业务逻辑 + 回复发送 | 消息提取 + 回复发送 |
| Claude 会话 | 不参与 | 消息理解 + 工具调用 |
| reply 命令 | 直接发送内容 | 直接发送内容 |
| reply-file 命令 | 不存在 | 从文件发送（新增） |

### 3.3 用户体验对比

| 场景 | 改进前 | 改进后 |
|-----|-------|-------|
| 查询磁盘 | 需说"检查C盘" | 可以说"看看C盘空间"、"C盘还有多少容量"等 |
| 创建笔记 | 本地生成，手动上传 | 自动生成，一键上传 IMA |
| 回复格式 | 挤在一行 | 多行美观排版 |
| 复杂请求 | 无法处理 | 可以理解并执行 |

---

## 四、关键技术点

### 4.1 时间戳追踪机制

**原理**:
- 使用 `last-check.json` 存储上次处理的最大时间戳
- 新消息判定：`message.timestamp > lastTimestamp`
- 处理完成后更新 `lastTimestamp`

**优势**:
- 不依赖 processed 标记（MCP Server 会清除）
- 可靠判断新消息
- 支持消息顺序处理

### 4.2 消息处理流水线

**文档描述的理想设计**:

```
[微信用户] → [MCP Server] → [queue.json]
                                    ↓
[微信用户] ← [send.ts] ← [auto-process.ts reply]
                                    ↑
[Claude 会话] → 理解/处理/生成回复
```

流程说明：
1. 微信消息存入 queue.json
2. auto-process.ts 提取消息并输出 JSON
3. Claude 会话理解处理，生成回复内容
4. 直接调用 reply 命令发送回复

---

**当前实际的流水线实现 (v1.1)**:

```
[微信用户] → [MCP Server] → [queue.json]
                                    ↓
                            [auto-process.ts]
                                    ↓
                    ┌───────────────────────────────┐
                    │  1. 读取 last-check.json      │
                    │  2. 获取上次处理时间戳        │
                    │  3. 从 queue.json 读取消息    │
                    │  4. 筛选新消息                │
                    │     timestamp > lastTimestamp │
                    └───────────────────────────────┘
                                    ↓
                    ┌───────────────────────────────┐
                    │  savePendingMessages()        │
                    │  - 读取现有 pending.json      │
                    │  - 按 timestamp 去重          │
                    │  - 追加新消息（不删除旧消息） │
                    └───────────────────────────────┘
                                    ↓
                    ┌───────────────────────────────┐
                    │  Harness 处理流程             │
                    │  ├─ Plan: 分析意图           │
                    │  ├─ Work: 执行工具调用       │
                    │  ├─ Review: 审查结果         │
                    │  └─ Reply: 生成回复          │
                    └───────────────────────────────┘
                                    ↓
                            写入临时文件 (.temp/xxx.txt)
                                    ↓
                    ┌───────────────────────────────┐
                    │  更新 last-check.json         │
                    │  max(timestamp)               │
                    └───────────────────────────────┘
                                    ↓
                            [auto-process.ts reply-file]
                                    ↓
                            [send.ts] → [微信用户]
                                    ↓
                            [remove 命令删除已处理消息]
```

**流程说明 (v1.1)**：
1. **queue.json 不修改**：读取后不做任何修改，由 MCP Server 自然管理
2. **时间戳判断**：使用 `last-check.json` 记录上次处理的最大时间戳
3. **消息筛选**：只处理 `timestamp > lastTimestamp` 的新消息
4. **消息保存**：`savePendingMessages()` 使用追加模式，仅去重不删除
5. **Harness 处理**：消息走完整 Harness 流程（Plan → Work → Review → Reply）
6. **时间戳更新**：处理完成后更新 `last-check.json`
7. **消息删除**：通过 `remove` 命令从 pending.json 删除已处理消息

---

**关键差异对比**:

| 维度 | v1.0 | v1.1 (当前) |
|-----|------|-------------|
| queue.json 处理 | 读取后清空或回写旧消息 | 不修改，自然累积 |
| pending.json 模式 | merge-append，过滤旧消息 | 纯追加，仅去重 |
| 消息删除 | 自动过滤 | 显式 remove 命令 |
| 消息丢失风险 | 中（处理中崩溃会丢） | 低（pending 保留所有） |
| 重试支持 | 有限 | 完整（未 remove 可重处理） |

---

**为什么采用文件中转方式**:

**原因1：格式保留**
- 命令行参数中的 `\n` 会被转义或忽略
- 通过文件写入可以完整保留换行符和格式
- 支持复杂排版（表格、列表、分隔线等）

**原因2：内容长度限制**
- 命令行参数有长度限制（通常几KB）
- 文件可以存储更长的回复内容
- 适合技术文档、详细列表等场景

**原因3：可编辑性**
- 文件可以在发送前预览和修改
- 便于调试和优化回复内容
- 支持版本控制

---

**实际处理流程示例**:

```
1. 用户发送: "查看CPU情况"
   ↓
2. queue.json 更新，包含新消息
   ↓
3. 运行: bun run auto-process.ts
   输出: [{"fromUserId": "...", "text": "查看CPU情况", ...}]
   ↓
4. Claude 解析 JSON，理解意图
   ↓
5. Claude 调用工具: wmic cpu get Name,MaxClockSpeed
   获取: Intel Core i5-5250U @ 1.60GHz
   ↓
6. Claude 生成格式化回复:
   "🖥️ CPU 信息

   型号: Intel Core i5-5250U
   主频: 1.60 GHz
   ..."
   ↓
7. Claude 写入文件:
   C:\Users\Administrator\.temp\cpu_reply.txt
   ↓
8. Claude 调用发送命令:
   bun run auto-process.ts reply-file "<用户ID>" "cpu_reply.txt" "<contextToken>"
   ↓
9. auto-process.ts 读取文件内容
   ↓
10. send.ts 发送消息到微信
   ↓
11. 用户收到格式美观的回复
```

---

**两种发送方式对比**:

| 方式 | 命令 | 适用场景 | 优缺点 |
|-----|------|---------|--------|
| **直接发送** | `reply` | 简单短文本 | 快速直接，但格式受限，换行困难 |
| **文件中转** | `reply-file` | 复杂格式化内容 | 保留格式，支持长内容，多一步文件操作 |

---

**最佳实践建议**:

1. **简单回复**（一句话）：使用 `reply` 命令
   ```bash
   bun run auto-process.ts reply "<用户ID>" "收到，正在处理" "<contextToken>"
   ```

2. **复杂回复**（多行、格式化）：使用 `reply-file` 命令
   ```bash
   # 生成内容到文件
   echo -e "🖥️ CPU信息\n\n型号: Intel i5\n主频: 1.6GHz" > reply.txt

   # 发送文件内容
   bun run auto-process.ts reply-file "<用户ID>" "reply.txt" "<contextToken>"
   ```

3. **当前实际采用的策略**（从会话历史观察）:
   - 绝大多数场景使用 `reply-file`
   - 通过 Write 工具生成临时文件
   - 然后调用 `reply-file` 命令发送
   - 临时文件路径: `C:\Users\Administrator\.temp\xxx.txt`

---

**流程优化建议**:

当前流程的问题是：**Claude 作为独立进程运行，与 auto-process.ts 分离**。

理想情况下，如果 Claude 和 auto-process.ts 在同一进程中，可以：
- 直接传递回复内容，无需文件中转
- 保持格式的同时避免 IO 操作
- 减少延迟

**可能的优化方向**:
1. **HTTP 服务**: auto-process.ts 启动 HTTP 服务，Claude 通过 API 提交回复
2. **共享内存**: 使用内存数据库或共享内存
3. **Socket 通信**: Unix socket 或 named pipe
4. **Remote Trigger**: Claude 官方远程触发机制（需登录 claude.ai）

当前采用文件中转是为了**简单可靠**，在 Windows 环境下易于实现。

### 4.3 API 调用方式

| 功能 | 接口 | 认证方式 |
|-----|------|---------|
| 发送消息 | `src/send.ts` | account token |
| 上传笔记 | `ima.qq.com/openapi/note/v1/import_doc` | clientid + apikey |
| 搜索知识库 | `ima.qq.com/openapi/wiki/v1/search_knowledge` | clientid + apikey |

---

## 五、使用示例

### 5.1 标准处理流程

1. **检查新消息**:
```bash
cd "C:\Users\Administrator\.claude\plugins\cache\cc-weixin\weixin\0.1.0"
bun run auto-process.ts
# 输出: [{"fromUserId": "...", "text": "...", ...}]
```

2. **Claude 理解处理**:
   - 解析消息内容
   - 判断用户意图
   - 调用相应工具
   - 生成回复内容

3. **发送回复**:
```bash
# 简单内容
bun run auto-process.ts reply "<用户ID>" "<内容>" "<contextToken>"

# 多行内容（推荐）
echo "<多行内容>" > reply.txt
bun run auto-process.ts reply-file "<用户ID>" "reply.txt" "<contextToken>"
```

### 5.2 典型处理案例

**案例1：系统查询**
- 用户消息："查看CPU和内存情况"
- Claude 处理：调用 wmic 获取 CPU 和内存信息
- 生成回复：格式化输出硬件信息
- 发送回复：使用 reply-file 发送美观格式

**案例2：知识库检索**
- 用户消息："从 AI coder 知识库找10个有用的 skills"
- Claude 处理：调用 IMA API 搜索知识库
- 生成回复：整理12个 skills 的详细信息
- 发送回复：文字格式列出每个 skill

**案例3：创建文档**
- 用户消息："写一篇微信交互改进的技术文档"
- Claude 处理：生成详细技术文档
- 上传 IMA：调用 import_doc API
- 发送回复：确认文档 ID 和上传状态

---

## 六、注意事项

1. **时间戳准确性**：MCP Server 必须提供正确的 timestamp
2. **API 密钥安全**：IMA API Key 存储在脚本中，注意保密
3. **消息顺序**：按 timestamp 排序处理，确保顺序正确
4. **错误处理**：每个环节都有 try-catch 保护
5. **文件编码**：reply-file 使用 UTF-8 编码

---

## 七、定时任务机制

### 7.1 Cron 定时任务

使用 Claude Code 内置的 `CronCreate` 工具实现消息自动检查：

```typescript
CronCreate: {
  cron: "* * * * *",  // 每分钟执行
  prompt: "检查微信消息并处理新消息: cd ... && bun run auto-process.ts",
  recurring: true
}
```

**当前任务列表**:
| 任务 ID | 执行频率 | 说明 |
|---------|---------|------|
| 260fa4f0 | 每分钟 | 检查 queue.json 新消息 |

**注意**: 此任务为 session-only，Claude Code 重启后需重新创建。

### 7.2 消息处理触发流程

```
[Cron 定时器] → 执行 auto-process.ts
                      ↓
              检查 queue.json
                      ↓
              输出新消息 JSON
                      ↓
              [当前 Claude 会话] 理解处理
                      ↓
              生成回复
                      ↓
              reply-file 发送
```

---

## 八、MCP 保活问题与解决方案

### 8.1 当前保活机制的缺陷

**问题描述**:
- `ensureMcpServer()` 只在 `auto-process.ts` 运行时检查 MCP 状态
- 如果 MCP 在两次检查之间（60秒）崩溃，消息会丢失
- 用户报告的 67 条消息堆积就是因为 MCP 掉了但时间戳已更新

**根本原因**:
```
t=0s:  auto-process.ts 检查 → MCP 正常 → 更新时间戳
      ↓
t=30s: MCP 崩溃
      ↓
t=60s: 新消息到达 → 写入 queue.json
      ↓
t=120s: auto-process.ts 再次运行 → 发现 MCP 死了 → 重启
       → 但时间戳已经更新，消息被标记为"已处理"
```

### 8.2 计划中的解决方案

#### 方案一：独立保活进程（推荐）

创建一个独立的 `mcp-watchdog.ts` 进程：

```typescript
// mcp-watchdog.ts
while (true) {
  const running = await isMcpServerRunning();
  if (!running) {
    await startMcpServer();
    console.log(`[${new Date()}] MCP 崩溃，已重启`);
  }
  await sleep(5000);  // 每 5 秒检查一次
}
```

**启动方式**:
```bash
nohup bun mcp-watchdog.ts > watchdog.log 2>&1 &
```

**优势**:
- 主动监控，不依赖消息循环
- 5 秒内发现崩溃并恢复
- 记录崩溃日志，便于排查

#### 方案二：Windows 服务

将 MCP 服务器注册为 Windows 服务，使用系统级保活：

```powershell
# 使用 nssm 创建服务
nssm install WeChatMCP "bun" "server.ts"
nssm set WeChatMCP AppDirectory "C:\...\0.1.0"
nssm set WeChatMCP RestartDelay 5000
```

**优势**:
- 系统级保活，最稳定
- 开机自动启动
- 崩溃自动重启

---

## 九、未来改进方向

1. **MCP 独立保活进程**：实现方案一的 watchdog 机制
2. **Remote Trigger**：实现真正的异步触发，无需手动轮询
3. **消息上下文**：支持多轮对话，保持上下文记忆
4. **群聊支持**：区分不同聊天上下文
5. **多媒体处理**：支持图片、文件接收和处理
6. **知识库问答**：基于 IMA 知识库内容回答

---

## 十、Bug 修复记录

### 修复1：文件上传 Header 名称错误（2026-03-25）

**问题**：发送文件显示 0B，无法下载

**原因**：CDN 上传成功后返回两个 header，代码使用了错误的那个

**修复**（`media.ts:140`）：
```typescript
// 错误代码
const encryptQueryParam = uploadResult.headers.get("x-encrypted-param") || "";

// 正确代码
const encryptQueryParam = uploadResult.headers.get("x-encrypted-query-param") || "";
```

### 修复2：AES 密钥格式错误（2026-03-25）

**问题**：文件类型消息下载失败

**原因**：不同媒体类型的 AES 密钥编码格式不同
- IMAGE/VIDEO：base64(raw 16 bytes)
- FILE：base64(hex string of 16 bytes)

**修复**（`media.ts:142-148`）：
```typescript
return {
  encryptQueryParam,
  aesKey: mediaType === UploadMediaType.FILE
    ? Buffer.from(aesKey.toString("hex")).toString("base64")  // FILE: base64(hex)
    : aesKey.toString("base64"),  // IMAGE/VIDEO: base64(raw)
  fileSize,
  rawSize,
  fileName: basename(filePath),
};
```

**验证**：修复后 txt 和 md 文件均可正常发送和下载

### 修复3：MCP 服务器保活机制（2026-03-25）

**问题**：MCP 服务器经常停止运行，导致消息接收和文件发送失败

**原因**：MCP 服务器以后台进程运行，容易意外退出

**修复**（`auto-process.ts`）：
1. 新增 `isMcpServerRunning()` 函数检测服务器状态
2. 新增 `startMcpServer()` 函数自动启动服务器
3. 新增 `ensureMcpServer()` 函数确保服务器运行
4. 在 `processNewMessages()` 和 `check` 命令前调用保活检查

```typescript
// 检查 MCP 服务器是否运行
async function isMcpServerRunning(): Promise<boolean> {
  const isWindows = platform() === 'win32';
  const checkCmd = isWindows
    ? 'wmic process where "CommandLine like \"%bun%server.ts%\"" get ProcessId'
    : 'ps aux | grep "bun.*server.ts" | grep -v grep';
  // ...
}

// 启动 MCP 服务器
async function startMcpServer(): Promise<void> {
  const command = isWindows
    ? 'start /B bun server.ts > "${MCP_LOG_FILE}" 2>&1'
    : 'nohup bun server.ts > "${MCP_LOG_FILE}" 2>&1 &';
  // ...
}

// 在消息处理前确保 MCP 运行
async function processNewMessages() {
  await ensureMcpServer();  // 新增保活检查
  // ... 原有处理逻辑
}
```

**效果**：每次检查消息时自动确保 MCP 服务器在线，无需手动重启

### 修复4：reply-file 命令添加 MCP 保活（2026-03-25）

**问题**：使用 reply-file 发送多行文本时 MCP 可能已停止

**修复**：在 reply-file 命令执行前添加 `ensureMcpServer()` 调用

```typescript
} else if (command === 'reply-file') {
  // 确保 MCP 服务器运行
  await ensureMcpServer();
  // ... 原有逻辑
}
```

### 修复5：文件发送添加 MCP 保活（2026-03-25）

**问题**：发送文件时 MCP 经常已停止，导致发送失败

**修复**：导出 `ensureMcpServer()` 函数，在发送文件前调用

```typescript
import { ensureMcpServer } from './auto-process.js';

// 发送文件前确保 MCP 运行
await ensureMcpServer();
await sendMediaFile({ ... });
```

### 修复6：图片消息字段缺失导致"已过期"（2026-03-26）

**问题描述**：
发送的图片在微信中显示为灰色块，点击后提示"图片已过期或已被清理"

**根本原因**：
对比微信官方客户端发送的正常图片消息，发现缺少以下关键字段：
1. `url` - 图片的唯一标识 URL（需要从 filekey 构造）
2. `create_time_ms` / `update_time_ms` - 消息时间戳
3. `is_completed: true` - 完成标记
4. `mid_size`, `thumb_size`, `thumb_height`, `thumb_width`, `hd_size` - 尺寸信息

**修复方案**（`src/send.ts`）：

```typescript
const now = Date.now();

// 生成 url 字段 - 从 filekey 构造
const filekeyUuid = uploaded.filekey?.replace(/(\w{8})(\w{4})(\w{4})(\w{4})(\w{12})/, '$1-$2-$3-$4-$5') || '';
const urlHeader = '3057020100044b30490201000204c055793902032df6cd0204909865b4020469c487410424';
const urlFooter = '0204051838010201000405004c54a100';
const imageUrl = urlHeader + filekeyUuid.replace(/-/g, '') + urlFooter;

items.push({
  type: MessageItemType.IMAGE,
  create_time_ms: now,           // 新增
  update_time_ms: now,           // 新增
  is_completed: true,            // 新增
  image_item: {
    url: imageUrl,               // 新增
    aeskey: aesKeyHex,
    media: {
      encrypt_query_param: uploaded.encryptQueryParam,
      aes_key: aesKeyBase64OfHex,
    },
    mid_size: uploaded.rawSize,  // 新增
    thumb_size: 10205,           // 新增
    thumb_height: 210,           // 新增
    thumb_width: 157,            // 新增
    hd_size: uploaded.rawSize,   // 新增
  },
});
```

**同时需要确保 `uploadFile` 返回 `filekey`**（`src/media.ts`）：

```typescript
return {
  encryptQueryParam,
  aesKey: mediaType === UploadMediaType.FILE
    ? Buffer.from(aesKey.toString("hex")).toString("base64")
    : aesKey.toString("base64"),
  fileSize,
  rawSize,
  fileName: basename(filePath),
  filekey,  // 新增：返回 filekey 用于构造 url
};
```

**修复结果**：
- ✅ 图片缩略图正常显示
- ✅ 点击后可正常查看原图
- ✅ 图片可以正常下载

### 修复7：FILE 类型字段名错误（2026-03-26）

**问题描述**：
发送文件时，对方只收到文字消息，没有收到文件

**根本原因**：
`FileItem` 接口定义使用的是 `len` 字段表示文件大小，但代码中写成了 `file_size`

**FileItem 接口定义**（`src/types.ts`）：
```typescript
export interface FileItem {
  media?: CDNMedia;
  file_name?: string;
  md5?: string;
  len?: string;  // 注意：是 len，不是 file_size
}
```

**错误代码**（`src/send.ts`）：
```typescript
// 错误
file_item: {
  media: { ... },
  file_name: uploaded.fileName,
  file_size: uploaded.rawSize,  // ❌ 错误字段名
}
```

**修复后代码**（`src/send.ts`）：
```typescript
// 正确
file_item: {
  media: {
    encrypt_query_param: uploaded.encryptQueryParam,
    aes_key: uploaded.aesKey,
  },
  file_name: uploaded.fileName,
  len: String(uploaded.rawSize),  // ✅ 正确的字段名
}
```

**修复结果**：
- ✅ 文件消息正常显示
- ✅ 可以预览文件
- ✅ 可以下载文件

---

## 十一、近期更新记录（2026-03-25）

### 9.1 Bug 修复：消息时间戳过滤错误

**问题描述**：
- 原有逻辑使用 `m.timestamp > lastCheckTime` 过滤新消息
- 导致当消息时间戳等于上次检查时间时，消息会被跳过
- 用户发送的消息可能被误判为"已处理"而无法收到回复

**修复方案**：
- 将时间戳比较从 `>` 改为 `>=`
- 确保时间戳相同的消息也能被正确处理

**修改位置**（`auto-process.ts` 第113行和第163行）：
```typescript
// 修改前:
const newMessages = messages.filter(m => m.timestamp > lastCheckTime);

// 修改后:
const newMessages = messages.filter(m => m.timestamp >= lastCheckTime);
```

**影响范围**：
- `processNewMessages()` 函数
- `check` 命令处理逻辑

---

### 9.2 功能优化：IMA 知识库定时检索

**背景**：
用户需要定期从 IMA 知识库检索最新 AI 进展，并自动通过微信推送。

**实现方案**：
使用 Claude Code 内置的 `CronCreate` 工具创建定时任务：

```typescript
CronCreate: {
  cron: "0 9 * * *",  // 每天上午9点执行
  prompt: "检查微信消息并处理新消息，然后从 IMA 知识库搜索最新 AI 进展并推送给用户",
  recurring: true
}
```

**工作流程**：
1. 定时触发检查微信消息
2. 连接 IMA API（使用 `ima-openapi-clientid` 和 `ima-openapi-apikey` 认证）
3. 搜索 `AI最新动态` 知识库
4. 获取最新文章列表
5. 生成摘要并通过微信推送

**API 调用示例**：
```bash
# 搜索知识库
curl -s -X POST "https://ima.qq.com/openapi/wiki/v1/search_knowledge" \
  -H "ima-openapi-clientid: <CLIENT_ID>" \
  -H "ima-openapi-apikey: <API_KEY>" \
  -d '{"query": "AI最新进展", "knowledge_base_id": "<KB_ID>", "limit": 10}'

# 获取知识库内容列表
curl -s -X POST "https://ima.qq.com/openapi/wiki/v1/get_knowledge_list" \
  -H "ima-openapi-clientid: <CLIENT_ID>" \
  -H "ima-openapi-apikey: <API_KEY>" \
  -d '{"knowledge_base_id": "<KB_ID>", "limit": 30}'
```

**已发现的知识库**：
| 知识库名称 | ID | 内容特点 |
|-----------|-----|---------|
| AI最新动态 | MZwUg8Zi7BCKjvCgSD2gmn77PhHVcbskt2vpmd1MG4c= | 每日 AI 行业新闻 |
| AI产品 | WbPOxUlxjGvuGYU4bptm5fRYRjqmNfJ8HjhQUwxexDs= | AI 产品分析和评测 |
| AI创业 | E08055XO7o2aonsLo-_NnRCLU9QrE0Ne6h5oFC6xbDM= | AI 创业相关 |

---

### 9.3 文档更新：改进文档自动生成与推送

**新增功能**：
支持将技术改进文档自动发送给用户。

**工作流程**：
1. 用户请求："把微信消息处理最新的改动写进改进文档"
2. 读取 `auto-process.ts` 源码分析最新改动
3. 生成改进文档（Markdown 格式）
4. 使用 `send-file.ts` 发送文档到微信

**发送命令**：
```bash
cd "C:\Users\Administrator\.claude\plugins\cache\cc-weixin\weixin\0.1.0"
bun run send-file.ts "C:\Users\Administrator\.claude\channels\weixin\微信消息处理改进文档.md"
```

---

## 十二、文档维护说明

本文档作为 cc-weixin 插件的总技术文档，所有变更都应记录其中：

1. **Bug 修复**：记录问题描述、修复方案、修改位置
2. **功能新增**：记录背景、实现方案、API 变更
3. **架构调整**：记录前后对比、迁移步骤
4. **配置变更**：记录参数变化、环境要求

**更新频率**：每次代码变更后及时更新
**维护人**：Claude Code / 项目负责人
**版本号**：跟随重大更新递增（当前 v1.0）

### 修复8：消息累积问题（2026-03-29）

**问题描述**：
历史消息在 pending.json 中不断累积，导致处理混乱

**根本原因**：
- `savePendingMessages` 函数直接覆盖写入新消息
- 未处理的历史消息会与新消息合并累积
- 时间戳更新逻辑使用 `Date.now()`，可能与消息时间戳不匹配

**修复方案**（`auto-process.ts`）：

1. **改进 savePendingMessages 函数**：
```typescript
async function savePendingMessages(newMessages: Message[], lastCheckTime: number) {
  try {
    // 读取现有的 pending 消息
    const existingData = await readFile(PENDING_FILE, 'utf-8');
    const { messages: existingMessages } = JSON.parse(existingData);

    // 过滤掉时间戳小于等于 lastCheckTime 的旧消息（防止历史消息累积）
    const validExistingMessages = existingMessages.filter((m: Message) => m.timestamp > lastCheckTime);

    // 合并新旧消息，避免重复（按 timestamp 去重）
    const existingTimestamps = new Set(validExistingMessages.map((m: Message) => m.timestamp));
    const uniqueNewMessages = newMessages.filter(m => !existingTimestamps.has(m.timestamp));

    const mergedMessages = [...validExistingMessages, ...uniqueNewMessages];

    await writeFile(PENDING_FILE, JSON.stringify({
      messages: mergedMessages,
      updatedAt: new Date().toISOString()
    }, null, 2));
  } catch {
    // 如果文件不存在或解析失败，直接写入新消息
    await writeFile(PENDING_FILE, JSON.stringify({
      messages: newMessages,
      updatedAt: new Date().toISOString()
    }, null, 2));
  }
}
```

2. **修复时间戳更新逻辑**：
```typescript
// 修改前：
await saveLastCheckTime(Date.now());

// 修改后：
const maxTimestamp = Math.max(...messages.map(m => m.timestamp), lastCheckTime);
await saveLastCheckTime(maxTimestamp);
```

3. **添加 remove 命令**：
```typescript
else if (command === 'remove') {
  const [, timestampStr] = args;
  if (!timestampStr) {
    console.error('用法: bun run auto-process.ts remove <timestamp>');
    process.exit(1);
  }
  const timestampToRemove = parseInt(timestampStr);
  // 过滤删除指定时间戳的消息
  const filteredMessages = messages.filter((m: Message) => m.timestamp !== timestampToRemove);
  // ...
}
```

**修复结果**：
- ✅ 历史消息不再累积
- ✅ 支持单条消息删除
- ✅ 时间戳更新更准确

---

**文档结束**

*本文档详细记录了 cc-weixin 插件的改进过程，包含前后对比、技术细节、使用示例、Bug 修复和近期更新，供后续参考和维护。*
