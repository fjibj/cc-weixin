/**
 * Long-polling loop: getUpdates → callback.
 * Platform-agnostic: the onMessage callback handles platform-specific delivery.
 */

import { getUpdates } from "./api.js";
import { MessageType, MessageItemType } from "./types.js";
import type { WeixinMessage, MessageItem as WeixinMessageItem } from "./types.js";
import { downloadAndDecrypt } from "./media.js";
import { isAllowed, addPendingPairing } from "./pairing.js";
import { sendText } from "./send.js";
import { getStateDir } from "./accounts.js";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/** In-memory context token cache: userId → contextToken */
const contextTokens = new Map<string, string>();

export function getContextToken(userId: string): string | undefined {
  return contextTokens.get(userId);
}

// --- Cursor persistence ---

function cursorPath(): string {
  return join(getStateDir(), "cursor.txt");
}

function loadCursor(): string {
  const p = cursorPath();
  if (existsSync(p)) return readFileSync(p, "utf-8").trim();
  return "";
}

function saveCursor(cursor: string): void {
  writeFileSync(cursorPath(), cursor, "utf-8");
}

// --- Media download ---

async function downloadMedia(
  item: WeixinMessageItem,
  cdnBaseUrl: string,
): Promise<{ path: string; type: string } | null> {
  let encryptQueryParam: string | undefined;
  let aesKey: string | undefined;
  let ext = "";
  let mediaType = "";

  switch (item.type) {
    case MessageItemType.IMAGE:
      encryptQueryParam = item.image_item?.media?.encrypt_query_param;
      aesKey = item.image_item?.aeskey
        ? Buffer.from(item.image_item.aeskey, "hex").toString("base64")
        : item.image_item?.media?.aes_key;
      ext = ".jpg";
      mediaType = "image";
      break;
    case MessageItemType.VOICE:
      encryptQueryParam = item.voice_item?.media?.encrypt_query_param;
      aesKey = item.voice_item?.media?.aes_key;
      ext = ".silk";
      mediaType = "voice";
      break;
    case MessageItemType.FILE:
      encryptQueryParam = item.file_item?.media?.encrypt_query_param;
      aesKey = item.file_item?.media?.aes_key;
      ext = item.file_item?.file_name ? `.${item.file_item.file_name.split(".").pop()}` : "";
      mediaType = "file";
      break;
    case MessageItemType.VIDEO:
      encryptQueryParam = item.video_item?.media?.encrypt_query_param;
      aesKey = item.video_item?.media?.aes_key;
      ext = ".mp4";
      mediaType = "video";
      break;
    default:
      return null;
  }

  if (!encryptQueryParam || !aesKey) return null;

  try {
    const data = await downloadAndDecrypt({ encryptQueryParam, aesKey, cdnBaseUrl });
    const dir = join(tmpdir(), "weixin-media");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const fileName = item.file_item?.file_name || `${Date.now()}${ext}`;
    const filePath = join(dir, fileName);
    writeFileSync(filePath, data);
    return { path: filePath, type: mediaType };
  } catch (err) {
    process.stderr.write(`[weixin] Failed to download media: ${err}\n`);
    return null;
  }
}

// --- Parsed message (platform-agnostic) ---

export interface ParsedMessage {
  fromUserId: string;
  messageId: string;
  text: string;
  attachmentPath?: string;
  attachmentType?: string;
}

/** Callback type for delivering parsed messages to the host platform */
export type OnMessageCallback = (msg: ParsedMessage) => Promise<void>;

// --- Poll loop ---

export async function startPollLoop(params: {
  baseUrl: string;
  cdnBaseUrl: string;
  token: string;
  onMessage: OnMessageCallback;
  abortSignal: AbortSignal;
}): Promise<void> {
  const { baseUrl, cdnBaseUrl, token, onMessage, abortSignal } = params;

  let cursor = loadCursor();
  let consecutiveErrors = 0;

  process.stderr.write("[weixin] Starting message poll loop...\n");

  while (!abortSignal.aborted) {
    try {
      const resp = await getUpdates(baseUrl, token, cursor, abortSignal);

      // Check for session expired
      if (resp.errcode === -14) {
        process.stderr.write("[weixin] Session expired (errcode -14). Pausing for 30s...\n");
        await new Promise((r) => setTimeout(r, 30000));
        continue;
      }

      if (resp.ret !== 0 && resp.ret !== undefined) {
        throw new Error(`getUpdates error: ret=${resp.ret} errcode=${resp.errcode} ${resp.errmsg}`);
      }

      consecutiveErrors = 0;

      // Update cursor
      if (resp.get_updates_buf) {
        cursor = resp.get_updates_buf;
        saveCursor(cursor);
      }

      // Process messages
      if (resp.msgs && resp.msgs.length > 0) {
        for (const msg of resp.msgs) {
          await processMessage(msg, { baseUrl, cdnBaseUrl, token, onMessage });
        }
      }
    } catch (err: unknown) {
      if (abortSignal.aborted) break;

      consecutiveErrors++;
      process.stderr.write(
        `[weixin] Poll error (${consecutiveErrors}): ${err instanceof Error ? err.message : err}\n`,
      );

      if (consecutiveErrors >= 3) {
        process.stderr.write("[weixin] Too many consecutive errors, backing off 30s...\n");
        await new Promise((r) => setTimeout(r, 30000));
        consecutiveErrors = 0;
      } else {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }

  process.stderr.write("[weixin] Poll loop stopped.\n");
}

// --- Message processing ---

async function processMessage(
  msg: WeixinMessage,
  ctx: { baseUrl: string; cdnBaseUrl: string; token: string; onMessage: OnMessageCallback },
): Promise<void> {
  if (msg.message_type !== MessageType.USER) return;

  const fromUserId = msg.from_user_id;
  if (!fromUserId) return;

  // Cache context token
  if (msg.context_token) {
    contextTokens.set(fromUserId, msg.context_token);
  }

  // Access control
  if (!isAllowed(fromUserId)) {
    const code = addPendingPairing(fromUserId);
    try {
      await sendText({
        to: fromUserId,
        text: `Your pairing code is: ${code}\n\nAsk the operator to confirm:\n/weixin-access pair ${code}`,
        baseUrl: ctx.baseUrl,
        token: ctx.token,
        contextToken: msg.context_token || "",
      });
    } catch (err) {
      process.stderr.write(`[weixin] Failed to send pairing code: ${err}\n`);
    }
    return;
  }

  // Extract message content
  let textContent = "";
  let mediaPath: string | undefined;
  let mediaType: string | undefined;

  if (msg.item_list) {
    for (const item of msg.item_list) {
      if (item.type === MessageItemType.TEXT && item.text_item?.text) {
        textContent += (textContent ? "\n" : "") + item.text_item.text;
      } else if (
        item.type === MessageItemType.IMAGE ||
        item.type === MessageItemType.VOICE ||
        item.type === MessageItemType.FILE ||
        item.type === MessageItemType.VIDEO
      ) {
        const downloaded = await downloadMedia(item, ctx.cdnBaseUrl);
        if (downloaded) {
          mediaPath = downloaded.path;
          mediaType = downloaded.type;
        }
        if (item.type === MessageItemType.VOICE && item.voice_item?.text) {
          textContent += (textContent ? "\n" : "") + `[Voice transcription]: ${item.voice_item.text}`;
        }
      }
    }
  }

  if (!textContent && !mediaPath) return;

  // Deliver to host platform via callback
  await ctx.onMessage({
    fromUserId,
    messageId: String(msg.message_id || ""),
    text: textContent || "(media attachment)",
    attachmentPath: mediaPath,
    attachmentType: mediaType,
  });
}
