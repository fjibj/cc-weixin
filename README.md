# cc-weixin

> **C**ode **C**hannel — **W**ei**x**in（微信）

通过微信官方 iLink Bot API，将微信连接到 AI 编程工具。当前支持 Claude Code，后续计划支持 Codex 等更多平台。

<p align="center">
  <img src="docs/assets/wechat-chat.png" width="300" alt="微信聊天" />
  <img src="docs/assets/claude-code-terminal.png" width="500" alt="Claude Code 终端" />
</p>

**👉 [新手图文教程：如何用微信连接 Claude Code](https://mp.weixin.qq.com/s/745V4wfyihsm6irqT0PABQ)**

## 特性

- **官方 API**：使用微信 iLink Bot API，非逆向工程
- **完整媒体支持**：收发图片、视频、语音消息和文件
- **访问控制**：配对码 + 白名单，防止未授权访问
- **本地安全**：MCP Server 通过 stdio 本地运行，无暴露端口
- **平台解耦**：微信通信层与平台适配层分离，便于扩展到更多 AI 编程工具

## 支持平台

| 平台 | 状态 |
|------|------|
| Claude Code | ✅ 已支持 |
| Codex (OpenAI) | 🔜 计划中 |

## 最新改进 (v0.2.0)

本次更新包含以下重要改进：

### 1. Harness 自动化集成 (NEW)
- **自动 Harness 处理**: 微信消息自动走 Harness 流程 (Plan → Work → Review → Reply)
- **新增 auto-harness.ts**: 消息去重和 Harness 队列管理
- **改进 auto-process.ts**: 默认行为自动调用 Harness，无需额外参数
- **使用方式**: `bun run auto-process.ts` 自动触发 Harness 处理

### 2. 智能消息处理架构
- **改进前**: 硬编码关键词匹配，只能处理固定命令
- **改进后**: Claude 智能理解自然语言，动态处理请求
- **优势**: 支持复杂多变的用户请求，无需预定义关键词

### 3. 消息发送功能修复
- ✅ 修复 IMAGE 类型消息发送（解决"已过期"问题）
- ✅ 修复 FILE 类型消息发送（解决文件接收问题）
- ✅ 优化 CDN 文件上传加密处理

### 4. 新增回复方式
- `reply-file` 命令：从文件发送多行格式化消息
- 保留原有 `reply` 命令用于简单回复

### 5. IMA 知识库集成
- 支持自动上传笔记到 IMA 知识库
- 一键生成文档并上传

详见 [改进文档](cc-weixin-improvement-doc.md)

## 前置要求

- [Bun](https://bun.sh) 运行时
- [Claude Code](https://claude.ai/code)（需支持 channel 功能）
- 微信账号
  - iOS：微信 8.0.70 或更高版本
  - Android：微信 8.0.69 或更高版本

## 安装

在 Claude Code 中添加市场并安装插件：

```
/plugin marketplace add qufei1993/cc-weixin
/plugin install weixin@cc-weixin
```

## 配置

### 1. 连接微信账号

```
/weixin:configure
```

用微信扫描终端中显示的二维码。

### 2. 启动 Claude Code 并启用微信 channel

```bash
claude --dangerously-load-development-channels plugin:weixin@cc-weixin
```

### 3. 配对微信用户

首次从微信发送消息时，会收到一个 6 位配对码。在 Claude Code 中确认：

```
/weixin:access pair 123456
```

## 使用

连接后，从微信发送的消息将出现在 Claude Code 中。Claude 的回复会发送回微信。

### Harness 自动化处理

启用 Harness 后，微信消息自动走完整处理流程：

1. **Plan**: 分析消息意图，制定处理计划
2. **Work**: 执行任务（搜索、计算、文件操作等）
3. **Review**: 多维度审查（安全、性能、质量）
4. **Reply**: 发送详细回复到微信

```bash
# 手动触发消息处理（自动调用 Harness）
cd ~/.claude/plugins/cache/cc-weixin/weixin/0.1.0
bun run auto-process.ts
```

## 安全设计

- 使用微信官方 iLink Bot API
- 凭证文件 `chmod 0600` 保护
- 默认启用配对码访问控制
- 通过 stdio 本地运行，无网络端口暴露

## 许可证

MIT
