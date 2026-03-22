# 上游代码分析

> 记录对 `@tencent-weixin/openclaw-weixin@1.0.2` 的分析结论，作为本项目自主实现的参考依据

## 结论

**本项目不复制上游代码**，而是基于 API 协议文档（`docs/API-REFERENCE.md`）从零实现。

原因：
1. 上游代码深度依赖 `openclaw/plugin-sdk`，无法直接 npm 引用
2. 复制 + 适配 20 个文件会带来持续的 vendor 维护负担
3. 核心 API 调用都是标准 HTTP fetch，自主实现更简洁（9 个文件 vs 24 个文件）
4. 作为开源项目，统一代码风格更利于社区贡献

## 从上游获取的价值

本项目从 `@tencent-weixin/openclaw-weixin` 中获取的是**协议知识**，而非代码：

| 获取内容 | 记录位置 | 说明 |
|----------|----------|------|
| API endpoint 和请求/响应格式 | `docs/API-REFERENCE.md` | 5 个核心接口 + 2 个认证接口 |
| 消息结构（WeixinMessage 等） | `docs/API-REFERENCE.md` | 完整的 TypeScript 接口定义 |
| CDN 上传流程 | `docs/API-REFERENCE.md` | AES-128-ECB 加密 + 预签名上传 |
| QR 登录状态机 | `docs/API-REFERENCE.md` | get_bot_qrcode → get_qrcode_status 轮询 |
| 错误码含义 | `docs/API-REFERENCE.md` | errcode -14 = session expired |
| 请求头规范 | `docs/API-REFERENCE.md` | AuthorizationType, X-WECHAT-UIN 等 |

## 上游代码结构（供参考）

`@tencent-weixin/openclaw-weixin@1.0.2` 共 33 个 TypeScript 文件，按功能分类：

### 与 OpenClaw 框架耦合（不可复用）

| 文件 | 依赖 |
|------|------|
| `channel.ts` | `ChannelPlugin`, `OpenClawConfig` |
| `runtime.ts` | `PluginRuntime` |
| `monitor/monitor.ts` | `PluginRuntime`, `ChannelAccountSnapshot` |
| `messaging/process-message.ts` | `createTypingCallbacks`, `resolveSenderCommandAuthorization` 等 |
| `messaging/send.ts` | `stripMarkdown`, `ReplyPayload` |
| `auth/accounts.ts` | `normalizeAccountId`, `OpenClawConfig` |
| `auth/pairing.ts` | `withFileLock` |
| `api/api.ts` | 间接依赖 `accounts.ts` → `openclaw/plugin-sdk` |
| `auth/login-qr.ts` | 间接依赖 `accounts.ts` |

### 独立工具代码（无 openclaw 依赖）

| 文件 | 功能 |
|------|------|
| `api/types.ts` | 协议类型定义 |
| `api/session-guard.ts` | 会话超时管理 |
| `api/config-cache.ts` | typing ticket 缓存 |
| `cdn/aes-ecb.ts` | AES-128-ECB 加解密 |
| `cdn/cdn-url.ts` | CDN URL 构建 |
| `cdn/cdn-upload.ts` | CDN 上传 |
| `cdn/pic-decrypt.ts` | CDN 下载解密 |
| `cdn/upload.ts` | 文件上传管道 |
| `media/mime.ts` | MIME 映射 |
| `media/silk-transcode.ts` | SILK 转码 |
| `messaging/send-media.ts` | 媒体发送路由 |
| `messaging/error-notice.ts` | 错误通知 |
| `util/random.ts` | ID 生成 |
| `util/redact.ts` | 日志脱敏 |

虽然这 14 个文件技术上可以直接复制，但我们选择自主实现以保持代码统一性和长期可维护性。

## 许可证

- 上游：MIT License（Copyright 2026 Tencent Inc.）
- 本项目：MIT
- 本项目仅参考上游的 API 协议设计，不包含上游源代码
- `src/types.ts` 中的接口定义基于 API 协议规范编写，与上游 `api/types.ts` 存在结构相似性（协议接口的实现方式是确定的）
