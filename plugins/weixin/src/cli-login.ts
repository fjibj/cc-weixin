#!/usr/bin/env bun
/**
 * Standalone login script: bun src/cli-login.ts [clear]
 */

import { startLogin, waitForLogin } from "./login.js";
import { loadAccount, saveAccount, clearAccount, DEFAULT_BASE_URL } from "./accounts.js";

const arg = process.argv[2];

if (arg === "clear") {
  clearAccount();
  console.log("Account cleared.");
  process.exit(0);
}

// Check existing account
const existing = loadAccount();
if (existing) {
  console.log("Already connected:");
  console.log(`  User ID: ${existing.userId || "unknown"}`);
  console.log(`  Connected since: ${existing.savedAt}`);
  console.log('\nRun "bun src/cli-login.ts clear" to disconnect.');
  console.log("\nRestart Claude Code with:");
  console.log("  claude --dangerously-load-development-channels plugin:weixin@cc-weixin");
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
  console.log("\nRestart Claude Code with:");
  console.log("  claude --dangerously-load-development-channels plugin:weixin@cc-weixin");
} else {
  console.log(`\nLogin failed: ${result.message}`);
  process.exit(1);
}
