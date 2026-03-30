---
name: 微信消息回复格式规则
description: 多行文本必须使用 reply-file 方式发送
 type: feedback
---

## 规则

**多行文本（超过一行或包含换行符）必须使用 `reply-file` 方式发送，不能用 `reply`**

**Why:** 用户明确要求多行内容要用 reply-file 方式回复，直接 reply 会导致格式问题。

**How to apply:**
1. 如果回复内容包含 `\n` 换行符，或超过 100 个字符，或包含列表/代码块
2. 先写入临时文件（如 `/tmp/msg.md`）
3. 使用 `bun run auto-process.ts reply-file <chatId> <filePath> [contextToken]`
4. 发送后删除临时文件

**示例:**
```bash
# 多行内容写入文件
echo "第一行\n第二行\n第三行" > /tmp/msg.txt

# 使用 reply-file 发送
bun run auto-process.ts reply-file "chatId" "/tmp/msg.txt" "contextToken"
```

**单条消息（单行，短文本）可用 reply:**
```bash
bun run auto-process.ts reply "chatId" "简短回复" "contextToken"
```
