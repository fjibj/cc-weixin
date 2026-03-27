import { sendText } from './src/send.js';
import { loadAccount } from './src/accounts.js';
import { readFile, writeFile } from 'fs/promises';
import { spawn } from 'child_process';
import { platform } from 'os';

const account = loadAccount();
if (!account) {
  console.log('No account');
  process.exit(1);
}

const QUEUE_FILE = 'C:\\Users\\Administrator\\.claude\\channels\\weixin\\queue.json';
const LAST_CHECK_FILE = 'C:\\Users\\Administrator\\.claude\\channels\\weixin\\last-check.json';
const PENDING_FILE = 'C:\\Users\\Administrator\\.claude\\channels\\weixin\\pending.json';
const MCP_LOG_FILE = 'C:\\Users\\Administrator\\.claude\\channels\\weixin\\mcp-server.log';

interface Message {
  fromUserId: string;
  text: string;
  chatId: string;
  contextToken: string;
  timestamp: number;
  // 图片/媒体支持
  attachmentPath?: string;
  attachmentType?: string;
}

// 检查 MCP 服务器是否运行
async function isMcpServerRunning(): Promise<boolean> {
  try {
    const isWindows = platform() === 'win32';
    const checkCmd = isWindows
      ? 'wmic process where "CommandLine like \"%bun%server.ts%\"" get ProcessId 2>nul'
      : 'ps aux | grep "bun.*server.ts" | grep -v grep';

    const result = await new Promise<string>((resolve) => {
      const child = spawn(checkCmd, { shell: true });
      let output = '';
      child.stdout.on('data', (data) => output += data.toString());
      child.on('close', () => resolve(output));
    });

    return result.trim().length > 0 && !result.includes('No Instance');
  } catch {
    return false;
  }
}

// 启动 MCP 服务器
async function startMcpServer(): Promise<void> {
  console.log('[MCP] 服务器未运行，正在启动...');

  const isWindows = platform() === 'win32';
  const cwd = 'C:\\Users\\Administrator\\.claude\\plugins\\cache\\cc-weixin\\weixin\\0.1.0';

  // 使用 nohup 或 start 命令让进程在后台持续运行
  const command = isWindows
    ? `start /B bun server.ts > "${MCP_LOG_FILE}" 2>&1`
    : `nohup bun server.ts > "${MCP_LOG_FILE}" 2>&1 &`;

  spawn(command, {
    shell: true,
    cwd,
    detached: true,
    windowsHide: false
  });

  // 等待 3 秒让服务器启动
  await new Promise(resolve => setTimeout(resolve, 3000));
  console.log('[MCP] 服务器已启动');
}

// 确保 MCP 服务器运行
export async function ensureMcpServer(): Promise<void> {
  const running = await isMcpServerRunning();
  if (!running) {
    await startMcpServer();
  }
}

async function getLastCheckTime(): Promise<number> {
  try {
    const data = await readFile(LAST_CHECK_FILE, 'utf-8');
    const { lastTimestamp } = JSON.parse(data);
    return lastTimestamp || 0;
  } catch {
    return 0;
  }
}

async function saveLastCheckTime(timestamp: number) {
  await writeFile(LAST_CHECK_FILE, JSON.stringify({
    lastTimestamp: timestamp,
    checkedAt: new Date().toISOString()
  }, null, 2));
}

async function savePendingMessages(messages: Message[]) {
  await writeFile(PENDING_FILE, JSON.stringify({
    messages,
    updatedAt: new Date().toISOString()
  }, null, 2));
}

async function processNewMessages() {
  try {
    // 确保 MCP 服务器运行
    await ensureMcpServer();

    const data = await readFile(QUEUE_FILE, 'utf-8');
    const messages: Message[] = JSON.parse(data);
    const lastCheckTime = await getLastCheckTime();

    // 筛选出新消息（大于等于，确保不遗漏相同时间戳的消息）
    const newMessages = messages.filter(m => m.timestamp >= lastCheckTime);

    if (newMessages.length === 0) {
      console.log('[]'); // 输出空数组表示没有新消息
      return;
    }

    // 按时间戳排序（从早到晚）
    const sortedMessages = newMessages.sort((a, b) => a.timestamp - b.timestamp);

    // 保存到 pending.json 供外部处理
    await savePendingMessages(sortedMessages);

    // 更新最新时间戳
    const latestTimestamp = Math.max(...sortedMessages.map(m => m.timestamp));
    await saveLastCheckTime(latestTimestamp);

    // 输出新消息（JSON 格式，供外部解析）
    console.log(JSON.stringify(sortedMessages, null, 2));

  } catch (error) {
    console.error('检查消息失败:', error);
    process.exit(1);
  }
}

// 发送回复（由外部调用）
export async function replyToWeChat(to: string, text: string, contextToken: string) {
  await sendText({
    to,
    text,
    baseUrl: account.baseUrl,
    token: account.token,
    contextToken
  });
}

// 主函数
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'check') {
    // 确保 MCP 服务器运行
    await ensureMcpServer();

    // 只检查，不处理
    const data = await readFile(QUEUE_FILE, 'utf-8');
    const messages: Message[] = JSON.parse(data);
    const lastCheckTime = await getLastCheckTime();
    const newMessages = messages.filter(m => m.timestamp >= lastCheckTime);

    console.log(JSON.stringify({
      lastTimestamp: lastCheckTime,
      totalMessages: messages.length,
      newMessages: newMessages.length,
      messages: newMessages
    }, null, 2));

  } else if (command === 'reset') {
    // 重置时间戳
    await saveLastCheckTime(0);
    console.log('时间戳已重置为 0');

  } else if (command === 'reply') {
    // 发送回复
    const [, to, text, contextToken = ''] = args;
    if (!to || !text) {
      console.error('用法: bun run auto-process.ts reply <to> <text> [contextToken]');
      process.exit(1);
    }
    await replyToWeChat(to, text, contextToken);
    console.log('回复已发送');

  } else if (command === 'reply-file') {
    // 从文件读取回复内容（支持多行）
    // 确保 MCP 服务器运行
    await ensureMcpServer();

    const [, to, filePath, contextToken = ''] = args;
    if (!to || !filePath) {
      console.error('用法: bun run auto-process.ts reply-file <to> <filePath> [contextToken]');
      process.exit(1);
    }
    const text = await readFile(filePath, 'utf-8');
    await replyToWeChat(to, text, contextToken);
    console.log('回复已发送');

  } else if (command === 'harness') {
    // 使用 Harness 流程处理消息
    await ensureMcpServer();

    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    try {
      // 先检查并保存新消息到 pending.json
      await processNewMessages();

      // 调用 auto-harness.ts 处理
      const harnessCmd = `cd "${process.cwd()}" && bun run auto-harness.ts`;
      const { stdout, stderr } = await execAsync(harnessCmd, { timeout: 30000 });

      if (stderr) {
        console.error('[Harness] stderr:', stderr);
      }

      if (stdout) {
        try {
          const messages = JSON.parse(stdout);
          if (messages.length > 0) {
            console.log(`[Harness] ${messages.length} message(s) queued for processing`);
            // 输出消息供 cron 捕获并触发 Harness
            console.log(JSON.stringify({
              type: 'harness_queue',
              messages: messages
            }));
          }
        } catch {
          console.log('[Harness] Output:', stdout);
        }
      }
    } catch (err: any) {
      console.error('[Harness] Error:', err.message);
      process.exit(1);
    }

  } else {
    // 默认：检查消息并自动调用 Harness 处理
    await ensureMcpServer();

    // 先处理新消息
    await processNewMessages();

    // 自动调用 Harness 处理
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);


    try {
      const harnessCmd = `cd "${process.cwd()}" && bun run auto-harness.ts`;
      const { stdout, stderr } = await execAsync(harnessCmd, { timeout: 30000 });

      if (stderr) {
        console.error('[Harness] stderr:', stderr);
      }

      if (stdout) {
        try {
          const messages = JSON.parse(stdout);
          if (messages.length > 0) {
            console.log(`[Harness] ${messages.length} message(s) processed`);
          }
        } catch {
          // ignore parse error
        }
      }
    } catch (err: any) {
      console.error('[Harness] Error:', err.message);
    }
  }
}

main().catch(console.error);
