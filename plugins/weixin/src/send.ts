/**
 * Send messages to WeChat users.
 */

import { randomUUID } from "node:crypto";
import { sendMessage } from "./api.js";
import { MessageType, MessageState, MessageItemType } from "./types.js";
import { uploadFile, guessMediaType } from "./media.js";
import type { MessageItem, CDNMedia } from "./types.js";

/** Convert markdown to plain text (WeChat doesn't support markdown) */
export function markdownToPlainText(text: string): string {
  return (
    text
      // Code blocks → content only
      .replace(/```[\s\S]*?\n([\s\S]*?)```/g, "$1")
      // Inline code
      .replace(/`([^`]+)`/g, "$1")
      // Bold/italic
      .replace(/\*\*\*(.+?)\*\*\*/g, "$1")
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/\*(.+?)\*/g, "$1")
      .replace(/___(.+?)___/g, "$1")
      .replace(/__(.+?)__/g, "$1")
      .replace(/_(.+?)_/g, "$1")
      // Strikethrough
      .replace(/~~(.+?)~~/g, "$1")
      // Headers → text
      .replace(/^#{1,6}\s+/gm, "")
      // Links → text (URL)
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
      // Images → [image: alt]
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, "[$1]")
      // Blockquotes
      .replace(/^>\s+/gm, "")
      // Horizontal rules
      .replace(/^[-*_]{3,}$/gm, "---")
      // Unordered lists
      .replace(/^[\s]*[-*+]\s+/gm, "- ")
      // Ordered lists (preserve)
      .replace(/^[\s]*(\d+)\.\s+/gm, "$1. ")
      // Clean up extra blank lines
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

/** Send a text message */
export async function sendText(params: {
  to: string;
  text: string;
  baseUrl: string;
  token: string;
  contextToken: string;
}): Promise<{ messageId: string }> {
  const { to, text, baseUrl, token, contextToken } = params;
  const clientId = randomUUID();
  const plainText = markdownToPlainText(text);

  await sendMessage(baseUrl, token, {
    to_user_id: to,
    from_user_id: "",
    client_id: clientId,
    message_type: MessageType.BOT,
    message_state: MessageState.FINISH,
    context_token: contextToken,
    item_list: [{ type: MessageItemType.TEXT, text_item: { text: plainText } }],
  });

  return { messageId: clientId };
}

/** Send a media file */
export async function sendMediaFile(params: {
  filePath: string;
  to: string;
  text: string;
  baseUrl: string;
  token: string;
  contextToken: string;
  cdnBaseUrl: string;
}): Promise<{ messageId: string }> {
  const { filePath, to, text, baseUrl, token, contextToken, cdnBaseUrl } = params;
  const clientId = randomUUID();
  const mediaType = guessMediaType(filePath);

  // Upload file to CDN
  const uploaded = await uploadFile({
    filePath,
    toUserId: to,
    mediaType,
    apiBaseUrl: baseUrl,
    token,
    cdnBaseUrl,
  });

  const cdnMedia: CDNMedia = {
    encrypt_query_param: uploaded.encryptQueryParam,
    aes_key: uploaded.aesKey,
  };

  // Build item list
  const items: MessageItem[] = [];

  // Add text if present
  if (text) {
    items.push({
      type: MessageItemType.TEXT,
      text_item: { text: markdownToPlainText(text) },
    });
  }

  // Add media item based on type
  // 临时强制作为 FILE 发送，用于测试 FILE 类型是否仍然工作
  const forceFileType = false;
  const now = Date.now();
  switch (mediaType) {
    case 1: // IMAGE
      if (forceFileType) {
        // 强制作为 FILE 发送 - FILE 类型需要 aesKey 为 base64(hex string) 格式
        const fileAesKey = Buffer.from(Buffer.from(uploaded.aesKey, "base64").toString("hex")).toString("base64");
        items.push({
          type: MessageItemType.FILE,
          file_item: {
            media: {
              encrypt_query_param: uploaded.encryptQueryParam,
              aes_key: fileAesKey,
            },
            file_name: uploaded.fileName,
            file_size: uploaded.rawSize,
          } as any,
        });
      } else {
        // aeskey 字段需要 hex 格式
        // media.aes_key 需要是 hex 字符串的 base64 编码（不是 raw bytes 的 base64）
        const aesKeyHex = Buffer.from(uploaded.aesKey, "base64").toString("hex");
        const aesKeyBase64OfHex = Buffer.from(aesKeyHex).toString("base64");

        // 生成 url 字段 - 从 filekey 构造
        const filekeyUuid = uploaded.filekey?.replace(/(\w{8})(\w{4})(\w{4})(\w{4})(\w{12})/, '$1-$2-$3-$4-$5') || '';
        const urlHeader = '3057020100044b30490201000204c055793902032df6cd0204909865b4020469c487410424';
        const urlFooter = '0204051838010201000405004c54a100';
        const imageUrl = urlHeader + filekeyUuid.replace(/-/g, '') + urlFooter;

        items.push({
          type: MessageItemType.IMAGE,
          create_time_ms: now,
          update_time_ms: now,
          is_completed: true,
          image_item: {
            url: imageUrl,
            aeskey: aesKeyHex,  // hex 格式
            media: {
              encrypt_query_param: uploaded.encryptQueryParam,
              aes_key: aesKeyBase64OfHex,  // hex 字符串的 base64
            },
            mid_size: uploaded.rawSize,
            thumb_size: 10205,
            thumb_height: 210,
            thumb_width: 157,
            hd_size: uploaded.rawSize,
          },
        });
      }
      break;
    case 2: // VIDEO
      items.push({
        type: MessageItemType.VIDEO,
        video_item: { media: cdnMedia, video_size: uploaded.rawSize },
      });
      break;
    default: // FILE
      // FILE 类型直接使用 uploaded 的值，不经过 cdnMedia 转换
      items.push({
        type: MessageItemType.FILE,
        file_item: {
          media: {
            encrypt_query_param: uploaded.encryptQueryParam,
            aes_key: uploaded.aesKey,  // FILE 类型已经在上传时转换为 base64(hex string)
          },
          file_name: uploaded.fileName,
          len: String(uploaded.rawSize),  // FileItem 使用 len 字段，不是 file_size
        } as any,
      });
      break;
  }

  await sendMessage(baseUrl, token, {
    to_user_id: to,
    from_user_id: "",
    client_id: clientId,
    message_type: MessageType.BOT,
    message_state: MessageState.FINISH,
    context_token: contextToken,
    item_list: items,
  });

  return { messageId: clientId };
}
