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
const PERMISSIONS_FILE = 'C:\\Users\\Administrator\\.claude\\channels\\weixin\\pending_permissions.json';
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

// 权限请求接口
interface PermissionRequest {
  requestId: string;      // 5位验证码
  chatId: string;         // 用户ID
  contextToken: string;   // 上下文token
  toolName: string;       // 请求的工具名
  description: string;    // 描述
  timestamp: number;      // 创建时间
  status: 'pending' | 'approved' | 'denied';  // 状态
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

    // 【权限系统】检查是否有权限回复
    let filteredMessages = newMessages;
    if (newMessages.length > 0) {
      const permissionTimestamps = await checkPermissionReplies(newMessages);
      // 过滤掉已处理的权限回复消息
      if (permissionTimestamps.size > 0) {
        filteredMessages = newMessages.filter(m => !permissionTimestamps.has(m.timestamp));
        console.error(`[权限系统] 已过滤 ${permissionTimestamps.size} 条权限回复消息`);
      }
    }

    if (filteredMessages.length === 0) {
      console.log('[]'); // 输出空数组表示没有新消息
      // 使用队列中最大时间戳更新，避免重复检查
      const maxTimestamp = Math.max(...messages.map(m => m.timestamp), lastCheckTime);
      await saveLastCheckTime(maxTimestamp);
      return;
    }

    // 按时间戳排序（从早到晚）
    const sortedMessages = filteredMessages.sort((a, b) => a.timestamp - b.timestamp);

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
    // 确保 MCP 服务器运行
    await ensureMcpServer();

    // 只检查，不处理
    const data = await readFile(QUEUE_FILE, 'utf-8');
    const messages: Message[] = JSON.parse(data);
    const lastCheckTime = await getLastCheckTime();
    const newMessages = messages.filter(m => m.timestamp > lastCheckTime);

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

  } else if (command === 'test-permission') {
    // 测试权限请求功能
    const [, to, contextToken = ''] = args;
    if (!to) {
      console.error('用法: bun run auto-process.ts test-permission <chatId> [contextToken]');
      process.exit(1);
    }
    const requestId = await sendPermissionRequest(
      to,
      contextToken,
      'Bash',
      '执行系统命令测试'
    );
    console.log(`测试权限请求已发送: ${requestId}`);

  }  else if (command === 'remove') {
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
    console.error('处理步骤：');
    console.error('1. /harness-plan - 创建处理计划');
    console.error('2. /harness-work - 执行计划');
    console.error('3. /harness-review - 审查结果');
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

// --- Permission System (方案A': 基于定时任务架构) ---

// 生成5位验证码（小写字母，不含l）
function generateRequestId(): string {
  const chars = 'abcdefghijkmnopqrstuvwxyz';  // 不含 l
  let result = '';
  for (let i = 0; i < 5; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// 加载待处理权限列表
async function loadPermissions(): Promise<PermissionRequest[]> {
  try {
    const data = await readFile(PERMISSIONS_FILE, 'utf-8');
    return JSON.parse(data).permissions || [];
  } catch {
    return [];
  }
}

// 保存权限列表
async function savePermissions(permissions: PermissionRequest[]) {
  await writeFile(PERMISSIONS_FILE, JSON.stringify({
    permissions,
    updatedAt: new Date().toISOString()
  }, null, 2));
}

// 发送权限请求到微信
async function sendPermissionRequest(
  chatId: string,
  contextToken: string,
  toolName: string,
  description: string
): Promise<string> {
  const requestId = generateRequestId();

  // 发送权限请求消息
  const message =
    `🔐 Claude 请求权限：${toolName}\n` +
    `${description}\n\n` +
    `回复 "yes ${requestId}" 批准\n` +
    `回复 "no ${requestId}" 拒绝`;

  await sendText({
    to: chatId,
    text: message,
    baseUrl: account.baseUrl,
    token: account.token,
    contextToken
  });

  // 保存权限请求
  const permissions = await loadPermissions();
  permissions.push({
    requestId,
    chatId,
    contextToken,
    toolName,
    description,
    timestamp: Date.now(),
    status: 'pending'
  });
  await savePermissions(permissions);

  console.error(`[权限系统] 已发送权限请求 ${requestId} 到 ${chatId}`);
  return requestId;
}

// 检查权限回复
async function checkPermissionReplies(messages: Message[]): Promise<Set<number>> {
  const permissions = await loadPermissions();
  const PERMISSION_REPLY_RE = /^\s*(y|yes|n|no)\s+([a-km-z]{5})\s*$/i;
  const processedTimestamps = new Set<number>();

  for (const msg of messages) {
    const match = PERMISSION_REPLY_RE.exec(msg.text);
    if (!match) continue;

    const [, action, requestId] = match;
    const permission = permissions.find(p =>
      p.requestId === requestId.toLowerCase() &&
      p.status === 'pending'
    );

    if (!permission) {
      console.error(`[权限系统] 未找到权限请求 ${requestId}`);
      continue;
    }

    // 更新权限状态
    permission.status = action.toLowerCase().startsWith('y') ? 'approved' : 'denied';
    await savePermissions(permissions);

    // 发送确认消息
    const confirmText = action.toLowerCase().startsWith('y')
      ? `✅ 已批准权限请求 ${requestId}`
      : `❌ 已拒绝权限请求 ${requestId}`;

    await replyToWeChat(msg.chatId, confirmText, msg.contextToken);
    console.error(`[权限系统] 权限请求 ${requestId} 已${permission.status === 'approved' ? '批准' : '拒绝'}`);

    // 标记该消息为已处理
    processedTimestamps.add(msg.timestamp);
  }

  return processedTimestamps;
}

// 检查特定权限是否已批准
async function isPermissionApproved(requestId: string): Promise<boolean | null> {
  const permissions = await loadPermissions();
  const permission = permissions.find(p => p.requestId === requestId);
  if (!permission) return null;
  return permission.status === 'approved';
}

main().catch(console.error);
