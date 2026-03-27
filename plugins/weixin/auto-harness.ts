#!/usr/bin/env bun
/**
 * Auto-Harness: 自动用 Harness 流程处理微信消息
 * 由 auto-process.ts 调用
 */

import { readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const PENDING_FILE = join(homedir(), ".claude", "channels", "weixin", "pending.json");
const PROCESSED_FILE = join(homedir(), ".claude", "channels", "weixin", "harness-processed.json");

interface Message {
  fromUserId: string;
  text: string;
  chatId: string;
  contextToken: string;
  timestamp: number;
  attachmentPath?: string;
  attachmentType?: string;
}

// 记录已处理的消息ID（使用timestamp作为ID）
async function getProcessedIds(): Promise<Set<number>> {
  try {
    if (existsSync(PROCESSED_FILE)) {
      const data = await readFile(PROCESSED_FILE, "utf-8");
      const { ids } = JSON.parse(data);
      return new Set(ids || []);
    }
  } catch {
    // ignore
  }
  return new Set();
}

async function saveProcessedId(timestamp: number) {
  const ids = await getProcessedIds();
  ids.add(timestamp);
  await writeFile(PROCESSED_FILE, JSON.stringify({
    ids: Array.from(ids),
    updatedAt: new Date().toISOString()
  }, null, 2));
}

async function main() {
  try {
    // 读取 pending.json
    if (!existsSync(PENDING_FILE)) {
      console.error("[auto-harness] No pending file");
      process.exit(0);
    }

    const data = await readFile(PENDING_FILE, "utf-8");
    const { messages } = JSON.parse(data);

    if (!messages || messages.length === 0) {
      console.error("[auto-harness] No pending messages");
      process.exit(0);
    }

    const processedIds = await getProcessedIds();
    const newMessages = messages.filter((m: Message) => !processedIds.has(m.timestamp));

    if (newMessages.length === 0) {
      console.error("[auto-harness] No new messages to process");
      process.exit(0);
    }

    console.error(`[auto-harness] Processing ${newMessages.length} message(s) with Harness`);

    // 标记为已处理
    for (const msg of newMessages) {
      await saveProcessedId(msg.timestamp);
    }

    // 输出消息供外部处理
    console.log(JSON.stringify(newMessages, null, 2));

  } catch (err) {
    console.error("[auto-harness] Error:", err);
    process.exit(1);
  }
}

main();
