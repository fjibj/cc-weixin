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

// 获取 server.ts 进程数量
async function getServerProcessCount(): Promise<{ count: number; pids: number[] }> {
  try {
    const { execSync } = require('child_process');
    // 检测条件：1) 进程名是 bun.exe 2) 命令行包含 server.ts
    const output = execSync('wmic process where "name=\'bun.exe\' and CommandLine LIKE \'%server.ts%\'" get ProcessId', { encoding: 'utf-8' });

    // 解析进程 ID（输出格式为多行，第一行是标题）
    const lines = output.trim().split('\n').slice(1); // 跳过标题行
    const pids = lines
      .map((line: string) => {
        const match = line.match(/(\d+)/);
        return match ? parseInt(match[1]) : 0;
      })
      .filter((pid: number) => pid > 0);

    return { count: pids.length, pids };
  } catch {
    return { count: 0, pids: [] };
  }
}

// 启动 MCP 服务器
async function startMcpServer(): Promise<void> {
  console.log('[MCP] 服务器未运行，正在启动...');

  const cwd = 'C:\\Users\\Administrator\\.claude\\plugins\\cache\\cc-weixin\\weixin\\0.1.0';

  // 直接启动 bun 进程，后台运行，不弹出 CMD 窗口
  const child = spawn('bun', ['server.ts'], {
    cwd,
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  });

  // 等待 3 秒让服务器启动
  await new Promise(resolve => setTimeout(resolve, 3000));
  console.log('[MCP] 服务器已启动');
}

// 检查 MCP 服务器是否运行（检测是否有且只有一个 server.ts 进程）
async function isMcpServerRunning(): Promise<boolean> {
  const { count } = await getServerProcessCount();
  return count === 1;
}

// 确保有且只有一个 MCP 服务器进程
export async function ensureMcpServer(): Promise<void> {
  const { count, pids } = await getServerProcessCount();

  if (count === 0) {
    // 没有进程，启动一个新的
    await startMcpServer();
  } else if (count > 1) {
    // 有多个进程，保留最后一个，终止其他所有
    console.error(`[MCP] 检测到 ${count} 个 server.ts 进程，保留最后一个 (PID: ${pids[pids.length - 1]})，终止其他进程...`);

    const { execSync } = require('child_process');
    for (let i = 0; i < pids.length - 1; i++) {
      try {
        execSync(`wmic process where "ProcessId=${pids[i]}" call terminate`, { encoding: 'utf-8' });
        console.error(`[MCP] 已终止进程 ${pids[i]}`);
      } catch (err: any) {
        console.error(`[MCP] 终止进程 ${pids[i]} 失败:`, err.message);
      }
    }

    // 等待 1 秒确保清理完成
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.error('[MCP] 多进程清理完成');
  }
  // count === 1 时无需操作
}

async function getLastCheckTime(): Promise<number> {
  try {
    const data = await readFile(LAST_CHECK_FILE, 'utf-8');
    const { lastTimestamp } = JSON.parse(data);
    // 确保返回有效的时间戳（大于0），否则使用队列中的最大时间戳
    if (typeof lastTimestamp === 'number' && lastTimestamp > 0) {
      return lastTimestamp;
    }
    console.error('[getLastCheckTime] 无效的时间戳:', lastTimestamp, '使用队列最大时间戳');
    return 0;
  } catch (error) {
    console.error('[getLastCheckTime] 读取失败:', error);
    return 0;
  }
}

async function saveLastCheckTime(timestamp: number) {
  await writeFile(LAST_CHECK_FILE, JSON.stringify({
    lastTimestamp: timestamp,
    checkedAt: new Date().toISOString()
  }, null, 2));
}

async function savePendingMessages(newMessages: Message[]) {
  try {
    // 读取现有的 pending 消息
    const existingData = await readFile(PENDING_FILE, 'utf-8');
    const { messages: existingMessages } = JSON.parse(existingData);

    // 合并新旧消息，避免重复（按 timestamp 去重）
    const existingTimestamps = new Set(existingMessages.map((m: Message) => m.timestamp));
    const uniqueNewMessages = newMessages.filter(m => !existingTimestamps.has(m.timestamp));

    const mergedMessages = [...existingMessages, ...uniqueNewMessages];

    await writeFile(PENDING_FILE, JSON.stringify({
      messages: mergedMessages,
      updatedAt: new Date().toISOString()
    }, null, 2));
  } catch {
    // 如果文件不存在或解析失败，直接写入新消息
    await writeFile(PENDING_FILE, JSON.stringify({
      messages: newMessages,
      updatedAt: new Date().toISOString()
    }, null, 2));
  }
}

async function processNewMessages() {
  try {
    // 确保 MCP 服务器运行
    await ensureMcpServer();

    const data = await readFile(QUEUE_FILE, 'utf-8');
    const messages: Message[] = JSON.parse(data);

    let lastCheckTime = await getLastCheckTime();

    // 安全检查：如果 lastCheckTime 为 0 或无效，使用队列中的最大时间戳
    if (lastCheckTime === 0 && messages.length > 0) {
      const maxQueueTimestamp = Math.max(...messages.map(m => m.timestamp));
      console.error(`[processNewMessages] lastCheckTime 为 0，使用队列最大时间戳: ${maxQueueTimestamp}`);
      lastCheckTime = maxQueueTimestamp;
      await saveLastCheckTime(maxQueueTimestamp);
    }

    // 筛选出新消息（严格大于 lastCheckTime）
    const newMessages = messages.filter(m => m.timestamp > lastCheckTime);

    if (newMessages.length === 0) {
      // 没有新消息，静默退出（不输出任何内容，避免 Claude-Mem 捕获）
      process.exit(0);
    }

    // 按时间戳排序（从早到晚）
    const sortedMessages = newMessages.sort((a, b) => a.timestamp - b.timestamp);

    // 保存到 pending.json 供外部处理（追加模式，保留所有现有消息）
    await savePendingMessages(sortedMessages);

    // 更新最新时间戳
    const latestTimestamp = Math.max(...sortedMessages.map(m => m.timestamp));
    await saveLastCheckTime(latestTimestamp);

    // 发送"正在处理"回复（自动确认）
    for (const msg of sortedMessages) {
      try {
        await replyToWeChat(msg.chatId, '消息已收到，正在处理中...', msg.contextToken);
        console.error(`[auto-process] 已发送确认回复给 ${msg.chatId}`);
      } catch (err) {
        console.error(`[auto-process] 发送回复失败:`, err);
      }
    }

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
    // 只检查，不处理（不需要确保 MCP 服务器运行）
    const data = await readFile(QUEUE_FILE, 'utf-8');
    const messages: Message[] = JSON.parse(data);
    const lastCheckTime = await getLastCheckTime();
    const newMessages = messages.filter(m => m.timestamp > lastCheckTime);

    // 如果没有新消息，静默退出（不输出任何内容）
    if (newMessages.length === 0) {
      process.exit(0);
    }

    // 有新消息时输出详情
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

  } else if (command === 'send-text') {
    // 发送单行文本
    await ensureMcpServer();
    const [, to, text, contextToken = ''] = args;
    if (!to || !text) {
      console.error('用法: bun run auto-process.ts send-text <chatId> <text> [contextToken]');
      process.exit(1);
    }
    await replyToWeChat(to, text, contextToken);
    console.log('文本已发送');

  } else if (command === 'send-text-file') {
    // 从文件发送多行文本
    await ensureMcpServer();
    const [, to, filePath, contextToken = ''] = args;
    if (!to || !filePath) {
      console.error('用法: bun run auto-process.ts send-text-file <chatId> <filePath> [contextToken]');
      process.exit(1);
    }
    const text = await readFile(filePath, 'utf-8');
    await replyToWeChat(to, text, contextToken);
    console.log('文本已发送');

  } else if (command === 'send-file' || command === 'send-image' || command === 'send-video') {
    // 发送文件/图片/视频
    await ensureMcpServer();
    const [, to, filePath, contextToken = ''] = args;
    if (!to || !filePath) {
      console.error(`用法: bun run auto-process.ts ${command} <chatId> <filePath> [contextToken]`);
      process.exit(1);
    }

    // 读取账号信息
    const { loadAccount } = await import('./src/accounts.js');
    const { sendMediaFile } = await import('./src/send.js');
    const { CDN_BASE_URL } = await import('./src/accounts.js');
    const account = loadAccount();
    if (!account) {
      console.error('未找到账号信息');
      process.exit(1);
    }

    await sendMediaFile({
      filePath,
      to,
      text: '',
      baseUrl: account.baseUrl,
      token: account.token,
      contextToken,
      cdnBaseUrl: CDN_BASE_URL
    });
    console.log('文件已发送');

  } else if (command === 'reply') {
    // 发送回复（保留旧命令兼容）
    // 确保 MCP 服务器运行
    await ensureMcpServer();
    const [, to, text, contextToken = ''] = args;
    if (!to || !text) {
      console.error('用法: bun run auto-process.ts reply <to> <text> [contextToken]');
      process.exit(1);
    }

    // 自动检测：如果包含换行符或超过100字符，使用 reply-file 方式
    // 先将字面量 \n 转换为真正的换行符
    const processedText = text.replace(/\\n/g, '\n');
    if (processedText.includes('\n') || processedText.length > 100) {
      console.error('[自动检测] 内容包含多行或超过100字符，自动使用 reply-file 方式');
      // 写入临时文件
      const tempFile = `C:\\Users\\Administrator\\.claude\\channels\\weixin\\temp_reply_${Date.now()}.txt`;
      await writeFile(tempFile, processedText, 'utf-8');
      await replyToWeChat(to, processedText, contextToken);
      // 删除临时文件
      try {
        await import('fs/promises').then(fs => fs.unlink(tempFile));
      } catch {
        // 忽略删除错误
      }
    } else {
      await replyToWeChat(to, processedText, contextToken);
    }
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

  }   else if (command === 'remove') {
    // 删除指定时间戳的消息（处理完一条删除一条）
    const [, timestampStr] = args;
    if (!timestampStr) {
      console.error('用法: bun run auto-process.ts remove <timestamp>');
      process.exit(1);
    }

    const timestampToRemove = parseInt(timestampStr);

    try {
      const pendingData = await readFile(PENDING_FILE, 'utf-8');
      const { messages } = JSON.parse(pendingData);

      // 过滤掉指定时间戳的消息
      const filteredMessages = messages.filter((m: Message) => m.timestamp !== timestampToRemove);

      if (filteredMessages.length === messages.length) {
        console.error(`未找到时间戳为 ${timestampToRemove} 的消息`);
        process.exit(1);
      }

      await writeFile(PENDING_FILE, JSON.stringify({
        messages: filteredMessages,
        updatedAt: new Date().toISOString()
      }, null, 2));

      console.log(`已删除时间戳为 ${timestampToRemove} 的消息`);
      console.log(`剩余 ${filteredMessages.length} 条未处理消息`);
    } catch (err: any) {
      console.error('删除消息失败:', err.message);
      process.exit(1);
    }
  }
  else {
    // 默认：检查消息并触发 Harness 处理流程
    await ensureMcpServer();

    // 先处理新消息
    await processNewMessages();

    // 读取 pending.json 中的消息
    const pendingData = await readFile(PENDING_FILE, 'utf-8');
    const { messages: pendingMessages } = JSON.parse(pendingData);

    if (!pendingMessages || pendingMessages.length === 0) {
      console.log('[]');
      return;
    }

    // 输出消息供当前会话处理（带特殊标记）
    console.log('=== WECHAT_MESSAGES_START ===');
    console.log(JSON.stringify(pendingMessages, null, 2));
    console.log('=== WECHAT_MESSAGES_END ===');
    console.error(`[auto-process] 发现 ${pendingMessages.length} 条新消息，请在当前会话中使用 Harness 流程处理`);
    console.error('处理步骤如下：');
    console.error('1. /harness-plan - 创建处理计划，并回复');
    console.error('2. /harness-work - 执行计划，并回复');
    console.error('3. /harness-review - 审查结果，并回复');
    console.error('4. 使用 reply 命令发送最终回复');
    console.error('');
    console.error('每条消息信息：');
    for (const msg of pendingMessages) {
      console.error(`- 消息: ${msg.text.substring(0, 50)}...`);
      console.error(`  chatId: ${msg.chatId}`);
      console.error(`  contextToken: ${msg.contextToken}`);
      console.error(`  timestamp: ${msg.timestamp}`);
    }
  }
}

main().catch(console.error);
