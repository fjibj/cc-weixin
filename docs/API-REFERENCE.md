# 微信 iLink Bot API 协议参考

> 整理自 `@tencent-weixin/openclaw-weixin` 源码和文档

## 概览

| 项目 | 值 |
|------|-----|
| 后端地址 | `https://ilinkai.weixin.qq.com` |
| CDN 地址 | `https://novac2c.cdn.weixin.qq.com/c2c` |
| 协议 | HTTP JSON (POST) |
| 认证 | Bearer token（通过扫码获取） |
| 加密 | AES-128-ECB（媒体文件传输） |
| 拉消息 | getUpdates 长轮询（类似 Telegram Bot API） |

---

## 通用请求头

| Header | 值 | 说明 |
|--------|-----|------|
| `Content-Type` | `application/json` | 固定 |
| `AuthorizationType` | `ilink_bot_token` | 固定 |
| `Authorization` | `Bearer <token>` | 扫码登录后获取 |
| `X-WECHAT-UIN` | 随机 uint32 的 base64 编码 | 每次请求随机生成 |
| `Content-Length` | 请求体 UTF-8 字节长度 | 标准 |

---

## 认证接口

### GET `/ilink/bot/get_bot_qrcode`

获取登录二维码。

**Query 参数：**
| 参数 | 值 | 说明 |
|------|-----|------|
| `bot_type` | `"3"` | OpenClaw 渠道类型 |

**响应：**
```json
{
  "qrcode": "<二维码标识符>",
  "qrcode_img_content": "<二维码图片内容 URL>"
}
```

### GET `/ilink/bot/get_qrcode_status`

长轮询等待扫码结果。

**Query 参数：**
| 参数 | 值 |
|------|-----|
| `qrcode` | `get_bot_qrcode` 返回的 qrcode 值 |

**请求头（额外）：**
| Header | 值 |
|--------|-----|
| `iLink-App-ClientVersion` | `"1"` |

**响应：**
```json
{
  "status": "wait" | "scaned" | "confirmed" | "expired",
  "bot_token": "<token>",              // confirmed 时返回
  "ilink_bot_id": "<bot ID>",          // confirmed 时返回
  "baseurl": "<API base URL>",         // confirmed 时返回
  "ilink_user_id": "<扫码用户 ID>"      // confirmed 时返回
}
```

**状态流转：** `wait` → `scaned` → `confirmed` 或 `wait` → `expired`

---

## 消息接口

### POST `/ilink/bot/getupdates`

长轮询获取新消息。服务端在有新消息或超时后返回。

**请求体：**
```json
{
  "get_updates_buf": "<上次响应返回的同步游标，首次传空字符串>",
  "base_info": { "channel_version": "0.1.0" }
}
```

**响应体：**
```json
{
  "ret": 0,
  "errcode": 0,
  "errmsg": "",
  "msgs": [WeixinMessage, ...],
  "get_updates_buf": "<新游标>",
  "longpolling_timeout_ms": 35000
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `ret` | `number` | 返回码，`0` = 成功 |
| `errcode` | `number?` | 错误码（`-14` = 会话超时） |
| `msgs` | `WeixinMessage[]` | 消息列表 |
| `get_updates_buf` | `string` | 新游标，下次请求回传 |
| `longpolling_timeout_ms` | `number?` | 建议的下次轮询超时（ms） |

### POST `/ilink/bot/sendmessage`

发送消息。

**请求体：**
```json
{
  "msg": {
    "to_user_id": "<目标用户 ID>",
    "from_user_id": "",
    "client_id": "<客户端生成的唯一 ID>",
    "message_type": 2,
    "message_state": 2,
    "context_token": "<从 getUpdates 获取>",
    "item_list": [
      { "type": 1, "text_item": { "text": "消息内容" } }
    ]
  },
  "base_info": { "channel_version": "0.1.0" }
}
```

### POST `/ilink/bot/getconfig`

获取账号配置（typing ticket 等）。

**请求体：**
```json
{
  "ilink_user_id": "<用户 ID>",
  "context_token": "<可选>",
  "base_info": { "channel_version": "0.1.0" }
}
```

**响应体：**
```json
{
  "ret": 0,
  "typing_ticket": "<base64 编码>"
}
```

### POST `/ilink/bot/sendtyping`

发送/取消输入状态指示。

**请求体：**
```json
{
  "ilink_user_id": "<用户 ID>",
  "typing_ticket": "<从 getconfig 获取>",
  "status": 1,
  "base_info": { "channel_version": "0.1.0" }
}
```

| status | 说明 |
|--------|------|
| `1` | 正在输入 |
| `2` | 取消输入 |

---

## CDN 媒体接口

### POST `/ilink/bot/getuploadurl`

获取 CDN 上传预签名 URL。

**请求体：**
```json
{
  "filekey": "<随机 hex 标识>",
  "media_type": 1,
  "to_user_id": "<目标用户 ID>",
  "rawsize": 12345,
  "rawfilemd5": "<明文 MD5 hex>",
  "filesize": 12352,
  "no_need_thumb": true,
  "aeskey": "<AES key hex>",
  "base_info": { "channel_version": "0.1.0" }
}
```

| 字段 | 说明 |
|------|------|
| `media_type` | `1`=IMAGE, `2`=VIDEO, `3`=FILE, `4`=VOICE |
| `rawsize` | 原文件明文大小（字节） |
| `filesize` | AES-128-ECB 加密后密文大小 |
| `no_need_thumb` | 是否需要缩略图 |

**响应体：**
```json
{
  "upload_param": "<原图上传参数>",
  "thumb_upload_param": "<缩略图上传参数>"
}
```

---

## 消息结构

### WeixinMessage

```typescript
interface WeixinMessage {
  seq?: number;              // 序列号
  message_id?: number;       // 消息 ID
  from_user_id?: string;     // 发送者 ID
  to_user_id?: string;       // 接收者 ID
  client_id?: string;        // 客户端 ID
  create_time_ms?: number;   // 创建时间戳（ms）
  session_id?: string;       // 会话 ID
  message_type?: number;     // 1=USER, 2=BOT
  message_state?: number;    // 0=NEW, 1=GENERATING, 2=FINISH
  item_list?: MessageItem[]; // 消息内容列表
  context_token?: string;    // 会话上下文令牌（回复时必须回传）
}
```

### MessageItem

```typescript
interface MessageItem {
  type?: number;             // 1=TEXT, 2=IMAGE, 3=VOICE, 4=FILE, 5=VIDEO
  text_item?: { text: string };
  image_item?: ImageItem;
  voice_item?: VoiceItem;
  file_item?: FileItem;
  video_item?: VideoItem;
  ref_msg?: RefMessage;      // 引用消息
}
```

### CDNMedia（所有媒体类型共用）

```typescript
interface CDNMedia {
  encrypt_query_param?: string;  // CDN 下载/上传加密参数
  aes_key?: string;              // base64 编码的 AES-128 密钥
  encrypt_type?: number;         // 0=只加密fileid, 1=打包信息
}
```

---

## CDN 上传流程

1. 生成随机 16 字节 AES key 和 16 字节 filekey
2. 读取文件 → 计算明文 MD5 和 AES-128-ECB 密文大小
3. 调用 `getuploadurl` 获取 `upload_param`
4. 用 AES key 加密文件内容（AES-128-ECB, PKCS7 padding）
5. POST 密文到 CDN URL（`Content-Type: application/octet-stream`）
6. CDN 返回 `x-encrypted-param` header → 用于构造 `CDNMedia.encrypt_query_param`
7. 将 CDNMedia 放入 MessageItem 发送

---

## 错误码

| errcode | 说明 | 处理方式 |
|---------|------|----------|
| `0` | 成功 | 正常处理 |
| `-14` | 会话超时 | 暂停请求，等待恢复 |
| 其他 | 未知错误 | 重试（指数退避） |
