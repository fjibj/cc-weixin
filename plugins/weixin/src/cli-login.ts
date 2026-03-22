#!/usr/bin/env bun
/**
 * Standalone login script: bun src/cli-login.ts [clear]
 */

import { startLogin, waitForLogin } from "./login.js";
import { loadAccount, saveAccount, clearAccount, DEFAULT_BASE_URL } from "./accounts.js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { homedir } from "node:os";
import { readdirSync } from "node:fs";

const arg = process.argv[2];

if (arg === "clear") {
  clearAccount();
  console.log("Account cleared.");
  process.exit(0);
}

/**
 * Resolve the plugin directory (cache or local dev).
 */
function resolvePluginDir(): string {
  const cacheBase = join(homedir(), ".claude", "plugins", "cache", "cc-weixin", "weixin");
  if (existsSync(cacheBase)) {
    try {
      const versions = readdirSync(cacheBase).sort();
      if (versions.length > 0) {
        return join(cacheBase, versions[versions.length - 1]);
      }
    } catch {}
  }
  return resolve(dirname(import.meta.dir), ".");
}

/**
 * Register weixin MCP server in the project's .mcp.json.
 * `server:weixin` only checks the current directory's .mcp.json,
 * so this must be called from the user's working directory via the skill.
 */
function registerMcpServer(): void {
  const pluginDir = resolvePluginDir();

  // Write to current working directory's .mcp.json (for server:weixin channel)
  const projectMcpFile = join(process.cwd(), ".mcp.json");
  let projectConfig: { mcpServers: Record<string, unknown> } = { mcpServers: {} };

  if (existsSync(projectMcpFile)) {
    try {
      projectConfig = JSON.parse(readFileSync(projectMcpFile, "utf-8"));
      projectConfig.mcpServers = projectConfig.mcpServers || {};
    } catch {}
  }

  projectConfig.mcpServers.weixin = {
    command: "bash",
    args: ["-c", `cd "${pluginDir}" && exec bun server.ts`],
  };

  writeFileSync(projectMcpFile, JSON.stringify(projectConfig, null, 2), "utf-8");
  console.log(`\nMCP server registered: ${projectMcpFile}`);
  console.log(`  Plugin directory: ${pluginDir}`);
}

// Check existing account
const existing = loadAccount();
if (existing) {
  console.log("Already connected:");
  console.log(`  User ID: ${existing.userId || "unknown"}`);
  console.log(`  Connected since: ${existing.savedAt}`);
  console.log('\nRun "bun src/cli-login.ts clear" to disconnect.');
  registerMcpServer();
  console.log("\nRestart Claude Code with:");
  console.log("  claude --dangerously-load-development-channels server:weixin");
  process.exit(0);
}

// Start login
console.log("Starting WeChat QR login...\n");
const qr = await startLogin(DEFAULT_BASE_URL);
console.log(`\nScan the QR code above with WeChat, or open this URL:\n${qr.qrcodeUrl}\n`);

const result = await waitForLogin({
  qrcodeId: qr.qrcodeId,
  apiBaseUrl: DEFAULT_BASE_URL,
});

if (result.connected && result.token) {
  saveAccount({
    token: result.token,
    baseUrl: result.baseUrl || DEFAULT_BASE_URL,
    userId: result.userId,
    savedAt: new Date().toISOString(),
  });
  console.log("\nConnected successfully!");
  console.log(`  User ID: ${result.userId}`);
  console.log(`  Base URL: ${result.baseUrl || DEFAULT_BASE_URL}`);
  registerMcpServer();
  console.log("\nRestart Claude Code with:");
  console.log("  claude --dangerously-load-development-channels server:weixin");
} else {
  console.log(`\nLogin failed: ${result.message}`);
  process.exit(1);
}
