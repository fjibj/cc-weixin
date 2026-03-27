# cc-weixin v0.2.0 安装部署指南

## 📦 快速下载

**Release 下载地址**：https://github.com/fjibj/cc-weixin/releases/tag/v0.2.0

| 文件 | 说明 |
|------|------|
| `cc-weixin-v0.2.0.tar.gz` | 完整项目包 |

## 🚀 安装部署

### 方式一：快速安装（推荐）

```bash
# 1. 下载并解压
curl -L -o cc-weixin-v0.2.0.tar.gz https://github.com/fjibj/cc-weixin/releases/download/v0.2.0/cc-weixin-v0.2.0.tar.gz
tar -xzf cc-weixin-v0.2.0.tar.gz
cd cc-weixin/plugins/weixin

# 2. 安装依赖
bun install

# 3. 配置微信账号
bun run server.ts
# 按提示扫描二维码登录微信
```

### 方式二：通过 Claude Code 安装

```bash
# 在 Claude Code 中执行
/plugin marketplace add fjibj/cc-weixin
/plugin install weixin@cc-weixin
```

## ⚙️ 详细配置

### 1. 前置要求

- **Bun 运行时**：https://bun.sh
- **Claude Code**：https://claude.ai/code
- **微信版本**：iOS 8.0.70+ / Android 8.0.69+

### 2. 配置步骤

#### 步骤 1：启动 MCP Server

```bash
cd plugins/weixin
bun run server.ts
```

#### 步骤 2：配置 Claude Code

编辑 `~/.claude/settings.json`：

```json
{
  "mcpServers": {
    "weixin": {
      "command": "bun",
      "args": ["/path/to/cc-weixin/plugins/weixin/server.ts"]
    }
  }
}
```

#### 步骤 3：配对验证

首次从微信发送消息，收到配对码后在 Claude Code 中确认：

```
/weixin:access pair 123456
```

## 🔄 使用流程

### 自动消息处理

```bash
# 检查新消息
cd plugins/weixin
bun run auto-process.ts
```

**处理流程**：Plan → Work → Review → Reply

### 设置定时任务

**Linux/Mac**：
```bash
crontab -e
*/2 * * * * cd /path/to/cc-weixin/plugins/weixin && bun run auto-process.ts
```

## 📄 许可证

MIT License

**项目地址**：https://github.com/fjibj/cc-weixin
