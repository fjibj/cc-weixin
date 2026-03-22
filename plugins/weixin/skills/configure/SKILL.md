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

The script automatically registers the weixin MCP server in the current project's `.mcp.json` file. This is required for `server:weixin` channel to work.

After connecting, tell the user to restart Claude Code **from the same directory** with:
```
claude --dangerously-load-development-channels server:weixin
```

If the user wants to use weixin channel in a different project, they need to run `/weixin:configure` again from that project directory to register the MCP server there.

**Do NOT mention** `claude --channels plugin:weixin@cc-weixin` — this requires an official allowlist and is not yet available.
