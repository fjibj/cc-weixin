---
name: weixin-configure
description: Connect or disconnect your WeChat account via QR code scan
user-invocable: true
argument-hint: "[clear]"
---

# WeChat Configure

Manage your WeChat connection.

## Instructions

Run the login CLI script directly using Bash:

```bash
# Connect (show QR code and wait for scan)
bun src/cli-login.ts

# Disconnect
bun src/cli-login.ts clear
```

If the user provides `clear` as an argument, run `bun src/cli-login.ts clear`.
Otherwise, run `bun src/cli-login.ts` and wait for the script to complete.

The script handles everything: checking existing accounts, displaying the QR code, polling for scan result, and saving credentials.

## Post-connect: Register MCP server

After **successful** connection (not when clearing), automatically register the weixin MCP server in `~/.claude/.mcp.json` so it can be used from any directory.

Read the existing `~/.claude/.mcp.json` file (create if not exists). Merge the weixin server config into the `mcpServers` object, preserving any existing servers. The plugin cache path should use the installed version.

```bash
# Find the latest installed plugin version
PLUGIN_DIR=$(ls -d ~/.claude/plugins/cache/cc-weixin/weixin/*/ 2>/dev/null | sort -V | tail -1)

# If not found (local dev), use current directory
if [ -z "$PLUGIN_DIR" ]; then
  PLUGIN_DIR="."
fi
```

Write/merge this config into `~/.claude/.mcp.json`:
```json
{
  "mcpServers": {
    "weixin": {
      "command": "bash",
      "args": ["-c", "cd \"${PLUGIN_DIR}\" && exec bun server.ts"]
    }
  }
}
```

Where `${PLUGIN_DIR}` is replaced with the actual resolved absolute path (e.g. `/Users/xxx/.claude/plugins/cache/cc-weixin/weixin/0.1.1`).

**Important**: When merging, preserve all other existing `mcpServers` entries in `~/.claude/.mcp.json`.

After registering, tell the user to restart Claude Code with:
```
claude --dangerously-load-development-channels server:weixin
```
