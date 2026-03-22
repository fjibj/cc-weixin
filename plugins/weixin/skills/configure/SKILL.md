---
name: weixin-configure
description: Connect or disconnect your WeChat account via QR code scan
user-invocable: true
argument-hint: "[clear]"
---

# WeChat Configure

Manage your WeChat connection.

## Instructions

**IMPORTANT**: All commands must run from the **plugin root directory**, NOT from the skills directory. Use `${CLAUDE_PLUGIN_ROOT}` or detect the plugin root by finding `package.json`. Always install dependencies first.

```bash
# Step 1: cd to plugin root and install dependencies
cd /path/to/plugin/root && bun install --no-summary

# Step 2: Run the login script
bun src/cli-login.ts        # Connect (show QR code)
bun src/cli-login.ts clear  # Disconnect
```

Combine into a single command:
```bash
cd "${CLAUDE_PLUGIN_ROOT:-$(dirname $(dirname $0))}" && bun install --no-summary 2>/dev/null && bun src/cli-login.ts [clear]
```

If the user provides `clear` as an argument, append `clear` to the command.
Otherwise, run without arguments and wait for the script to complete.

The script handles everything: checking existing accounts, displaying the QR code, polling for scan result, and saving credentials.

The script automatically registers the weixin MCP server globally using `claude mcp add --scope user`, so `server:weixin` works from any directory.

After connecting, tell the user to restart Claude Code with:
```
claude --dangerously-load-development-channels server:weixin
```

**Do NOT mention** `claude --channels plugin:weixin@cc-weixin` — this requires an official allowlist and is not yet available.
