# CLAUDE.md - Project Configuration

## Project Overview
- **Name**: just-for-weixin
- **Type**: WeChat Integration Project
- **Language**: JavaScript/Node.js

## WeChat 消息处理流程 (Harness)

### 流程概述

所有微信消息必须通过 **Harness 流程**处理：Plan → Work → Review → Reply，而且每一步都必须回复

### 处理步骤
0.**启动消息获取MCP**
  -启动MCP，收取消息写入queue.json
  ```bash
  cd ~/.claude/plugins/cache/cc-weixin/weixin/0.1.0
  bun run server.ts
  ```

1. **检测消息**
   -创建定时任务，每分钟检测一次
   ```bash
   cd ~/.claude/plugins/cache/cc-weixin/weixin/0.1.0
   bun run auto-process.ts
   ```
   -输出（下面的步骤参考这里的"处理步骤"执行）：
   [auto-process] 发现X 条新消息，请在当前会话中使用 Harness 流程处理
   处理步骤如下：
   1. /harness-plan - 创建处理计划，并回复
   2. /harness-work - 执行计划，并回复
   3. /harness-review - 审查结果，并回复
   4. 使用 reply 命令发送最终回复

2. **创建计划** (启动`/harness-plan`)
   - 分析消息意图
   - 制定处理计划（Task列表）
   - **必须回复**：计划概要给微信

3. **执行计划** (启动`/harness-work --parallel 3`)
   - 执行计划中的每个 Task
   - **必须回复**：每步执行结果给微信
   - 格式：`【Phase 2: Work - Step X/Y】...`

4. **审查结果** (启动`/harness-review`)
   -- 审查处理结果
   - **必须回复**：审查维度和结论给微信
   - 格式：`【Phase 3: Review】...`

5. **发送回复**
   - 发送最终回复
   - **必须回复**：处理总结给微信用户
   - 格式：`【Phase 4: Reply - 处理完成】...`
	- 单行消息：`bun run auto-process.ts reply <chatId> <text> <contextToken>`
	- 多行消息：`bun run auto-process.ts reply-file <chatId> <filePath> <contextToken>`


### 消息检测

**原则**: 没有新消息时，不要更新 last-check.json 时间戳

**Why:** 用户明确要求只在检测到新消息时才更新时间戳，避免不必要的文件写入操作。

**How to apply:**
1. 使用 `bun run auto-process.ts check` 检测消息
2. 如果 `newMessages === 0`，直接返回，不执行任何写入操作
3. 只有检测到新消息并处理完成后，才由处理流程自动更新时间戳


### 消息回复
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

### 消息删除

处理完成后删除消息：
```bash
bun run auto-process.ts remove <timestamp>
```

---

## MCP 服务器保活机制

**原则**：确保有且只有一个 server.ts 进程运行

**Why:** server.ts 是 MCP 服务器，负责轮询微信消息。`auto-process.ts` 包含保活逻辑，会在 server.ts 未运行时自动启动它，并在有多个进程时自动清理。

**How to apply:**
1. `auto-process.ts` 的 `ensureMcpServer()` 函数会在以下场景被调用：
   - 默认命令（无参数）：处理新消息前
   - `check` 命令：不需要确保服务器运行
   - `send-text`、`send-text-file`、`send-file` 等命令：发送消息前
   - `reply`、`reply-file` 命令：发送回复前

2. 保活逻辑：
   - **0 个进程**：启动一个新的 server.ts 后台进程
   - **1 个进程**：不执行任何操作（正常状态）
   - **多个进程**：保留最后一个，终止其他所有

3. 检测逻辑：
   - 使用 `wmic process where "name='bun.exe' and CommandLine LIKE '%server.ts%'"` 检测进程
   - 排除 `auto-process.ts` 自身（避免误判）

**示例输出:**
```bash
# 场景 1：没有进程
[MCP] 服务器未运行，正在启动...
[MCP] 服务器已启动

# 场景 2：多个进程
[MCP] 检测到 2 个 server.ts 进程，保留最后一个 (PID: 12345)，终止其他进程...
[MCP] 已终止进程 67890
[MCP] 多进程清理完成

# 场景 3：正常（1 个进程）
（无输出，静默处理）
```

---

## IMA 知识库/笔记上传

### 凭证配置

**存储位置**：
```
~/.config/ima/client_id  # IMA Client ID
~/.config/ima/api_key    # IMA API Key
```

**获取方式**：
1. 访问 https://ima.qq.com/agent-interface
2. 创建应用获取 Client ID 和 API Key
3. 保存到上述文件路径

### API 端点

**Base URL**：`https://ima.qq.com/openapi/wiki/v1/`

**Headers**：
```
ima-openapi-clientid: {CLIENT_ID}
ima-openapi-apikey: {API_KEY}
Content-Type: application/json
```

### 核心接口

#### 1. 搜索知识库列表
```bash
curl -X POST "https://ima.qq.com/openapi/wiki/v1/search_knowledge_base" \
  -H "ima-openapi-clientid: $CLIENT_ID" \
  -H "ima-openapi-apikey: $API_KEY" \
  -d '{"query": "", "limit": 50}'
```

#### 2. 在指定知识库中搜索
```bash
curl -X POST "https://ima.qq.com/openapi/wiki/v1/search_knowledge" \
  -H "ima-openapi-clientid: $CLIENT_ID" \
  -H "ima-openapi-apikey: $API_KEY" \
  -d '{
    "query": "搜索关键词",
    "knowledge_base_id": "知识库ID"
  }'
```

#### 3. 获取知识库内容列表
```bash
curl -X POST "https://ima.qq.com/openapi/wiki/v1/get_knowledge_list" \
  -H "ima-openapi-clientid: $CLIENT_ID" \
  -H "ima-openapi-apikey: $API_KEY" \
  -d '{
    "knowledge_base_id": "知识库ID",
    "cursor": "",
    "limit": 50
  }'
```

### 常用知识库

**【小 C 工作日记】**：`b7a2f763b7a2f763`

### 使用示例

**搜索知识库内容**：
```bash
IMA_CLIENT_ID=$(cat ~/.config/ima/client_id)
IMA_API_KEY=$(cat ~/.config/ima/api_key)

curl -s -X POST "https://ima.qq.com/openapi/wiki/v1/search_knowledge" \
  -H "ima-openapi-clientid: $IMA_CLIENT_ID" \
  -H "ima-openapi-apikey: $IMA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "工作日记",
    "knowledge_base_id": "b7a2f763b7a2f763"
  }'
```

### 返回字段说明

- `code`: 0 表示成功
- `msg`: 返回消息
- `data.info_list`: 搜索结果列表
  - `title`: 文档标题
  - `media_id`: 文档ID
  - `highlight_content`: 匹配内容摘要
  - `media_type`: 1=PDF, 2=网页, 6=微信文章

```typescript
// 1. 准备内容
const content = `# 工作日记 ${date}

## 今日工作
- 任务1
- 任务2
`;

// 2. 调用 IMA 工具上传
// 使用 ima:create_note 工具
// space_id: b7a2f763b7a2f763
```

---

## IMA Skill 目录结构

```
~/.claude/plugins/ima-skills/ima-skill/
├── SKILL.md              # 技能主文档（凭证配置、API 调用模板）
├── knowledge-base/         # 知识库模块
│   ├── SKILL.md          # 知识库使用指南（详细 API 说明）
│   ├── references/       # API 参考文档
│   └── scripts/          # 辅助脚本
│       ├── preflight-check.cjs   # 前置检查脚本（类型检测、大小校验）
│       └── cos-upload.cjs         # COS 上传脚本
└── notes/                # 笔记模块
    └── ...
```

---

## IMA 文件上传到知识库完整流程

### 前置条件
- 已配置 IMA 凭证（~/.config/ima/client_id 和 api_key）
- 已获取目标知识库 ID（通过 search_knowledge_base 查询）

### 完整步骤

#### 1. 文件预检（类型 + 大小检查）
```bash
# 检查文件类型和大小
node ~/.claude/plugins/ima-skills/ima-skill/knowledge-base/scripts/preflight-check.cjs \
  --file "/path/to/file.md"

# 返回示例：
# {"pass":true,"file_path":"...","file_name":"file.md","file_size":8850,"media_type":7,"content_type":"text/markdown"}
```

**支持的文件类型映射**:
| 扩展名 | media_type | content_type |
|--------|-----------|------------|
| .pdf | 1 | application/pdf |
| .doc/.docx | 3 | application/msword / ... |
| .ppt/.pptx | 4 | application/vnd.ms-powerpoint |
| .xls/.xlsx/.csv | 5 | application/vnd.ms-excel / text/csv |
| .md | 7 | text/markdown |
| .png/.jpg/.jpeg/.webp | 9 | image/png / image/jpeg |
| .txt | 13 | text/plain |
| .mp3/.m4a/.wav/.aac | 15 | audio/mpeg |

**不支持**: 视频文件（.mp4/.avi/.mov）、Bilibili/YouTube 链接、本地 HTML

#### 2. 检查文件名重复
```bash
KB_ID="your_knowledge_base_id"
curl -s -X POST "https://ima.qq.com/openapi/wiki/v1/check_repeated_names" \
  -H "ima-openapi-clientid: $IMA_CLIENT_ID" \
  -H "ima-openapi-apikey: $IMA_API_KEY" \
  -d "{
    \"params\": [{\"name\": \"file.md\", \"media_type\": 7}],
    \"knowledge_base_id\": \"$KB_ID\"
  }"
```

#### 3. 创建媒体（获取 COS 凭证）
```bash
curl -s -X POST "https://ima.qq.com/openapi/wiki/v1/create_media" \
  -H "ima-openapi-clientid: $IMA_CLIENT_ID" \
  -H "ima-openapi-apikey: $IMA_API_KEY" \
  -d "{
    \"file_name\": \"file.md\",
    \"file_size\": 8850,
    \"content_type\": \"text/markdown\",
    \"knowledge_base_id\": \"$KB_ID\",
    \"file_ext\": \"md\"
  }"

# 返回 media_id 和 cos_credential（含临时密钥）
```

#### 4. 上传文件到 COS
```bash
# 使用 COS 上传脚本
node ~/.claude/plugins/ima-skills/ima-skill/knowledge-base/scripts/cos-upload.cjs \
  --file "/path/to/file.md" \
  --secret-id "<cos_credential.secret_id>" \
  --secret-key "<cos_credential.secret_key>" \
  --token "<cos_credential.token>" \
  --bucket "<cos_credential.bucket_name>" \
  --region "<cos_credential.region>" \
  --cos-key "<cos_credential.cos_key>" \
  --content-type "text/markdown" \
  --start-time "<cos_credential.start_time>" \
  --expired-time "<cos_credential.expired_time>"
```

#### 5. 添加到知识库
```bash
curl -s -X POST "https://ima.qq.com/openapi/wiki/v1/add_knowledge" \
  -H "ima-openapi-clientid: $IMA_CLIENT_ID" \
  -H "ima-openapi-apikey: $IMA_API_KEY" \
  -d "{
    \"media_type\": 7,
    \"media_id\": \"<media_id>\",
    \"title\": \"file.md\",
    \"knowledge_base_id\": \"$KB_ID\",
    \"file_info\": {
      \"cos_key\": \"<cos_key>\",
      \"file_size\": 8850,
      \"file_name\": \"file.md\"
    }
  }"
```

#### 6. 验证上传
```bash
# 搜索验证
curl -s -X POST "https://ima.qq.com/openapi/wiki/v1/search_knowledge" \
  -H "ima-openapi-clientid: $IMA_CLIENT_ID" \
  -H "ima-openapi-apikey: $IMA_API_KEY" \
  -d "{
    \"query\": \"file\",
    \"knowledge_base_id\": \"$KB_ID\"
  }"
```

---

## Markdown 转 DOCX 文档生成方法

### Anthropic Document 四件套 (docx-js)

**用途**: 将 Markdown 报告转换为专业排版的 DOCX 格式文档

**安装依赖**:
```bash
npm install docx
```

**核心步骤**:

1. **创建 JavaScript 转换脚本** (`create-report-docx.js`):
   - 使用 `docx` 库的 `Document`, `Packer`, `Paragraph`, `TextRun`, `ImageRun` 等组件
   - 解析 Markdown 内容并转换为 DOCX 段落
   - 插入图片使用 `ImageRun` 配合 `type: "png"` 参数

2. **关键配置**:
```javascript
const { Document, Packer, Paragraph, TextRun, ImageRun, 
        Header, Footer, AlignmentType, HeadingLevel, PageNumber } = require('docx');

const doc = new Document({
  styles: {
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", ... },
      { id: "Heading2", name: "Heading 2", ... }
    ]
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },  // US Letter
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
      }
    },
    headers: { default: new Header(...) },
    footers: { default: new Footer(...) },
    children: [/* paragraphs */]
  }]
});

const buffer = await Packer.toBuffer(doc);
fs.writeFileSync('output.docx', buffer);
```

3. **运行生成**:
```bash
node create-report-docx.js
```

**成功标志**: 生成 `.docx` 文件，可用 Word 直接打开，包含完整格式和图片

**参考实现**: `~/.claude/channels/weixin/create-report-docx.js`

**Why**: 用户要求使用 Anthropic Document 四件套生成 Word 文档，此方法成功生成 515KB 的专业报告文档

**How to apply**:
1. 安装 docx 包: `npm install docx`
2. 创建转换脚本，参考已有实现
3. 运行脚本生成 DOCX
4. 验证文件大小和内容完整性

---

### 架构图生成与插入

**场景**: 为技术报告生成专业架构图并插入 Word 文档

#### 方法 1: Python matplotlib 生成（推荐）

**安装依赖**:
```bash
pip install matplotlib numpy
```

**关键代码模板**:
```python
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import FancyBboxPatch

# 设置中文字体（关键！避免中文显示为方块）
plt.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei', 'SimSun']
plt.rcParams['axes.unicode_minus'] = False

def create_architecture_diagram(system_name, layers, output_file):
    """生成分层架构图
    layers: [(层名称, [组件1, 组件2, ...]), ...]
    """
    fig, ax = plt.subplots(1, 1, figsize=(16, 12))  # 大尺寸保证清晰度
    ax.set_xlim(0, 16)
    ax.set_ylim(0, 12)
    ax.axis('off')

    colors = ['#BBDEFB', '#FFE0B2', '#C8E6C9', '#F8BBD9', '#E1BEE7']
    
    # 标题
    ax.text(8, 11.2, f'{system_name}', fontsize=24, fontweight='bold',
            ha='center', va='center')

    layer_height = 1.8
    start_y = 9.0
    box_width = 14.0

    for i, (layer_name, components) in enumerate(layers):
        y = start_y - i * 2.0
        color = colors[i % len(colors)]

        # 层背景
        rect = FancyBboxPatch((1.0, y-0.8), box_width, 1.6,
                              boxstyle="round,pad=0.08",
                              facecolor=color, edgecolor='#333333', linewidth=2.5)
        ax.add_patch(rect)

        # 层标签
        ax.text(1.8, y, layer_name, fontsize=16, fontweight='bold',
                va='center', ha='left')

        # 组件
        comp_width = 10.5 / len(components)
        for j, comp in enumerate(components):
            x = 4.0 + j * comp_width + comp_width/2
            comp_rect = FancyBboxPatch((4.0 + j * comp_width, y-0.5),
                                       comp_width-0.3, 1.0,
                                       boxstyle="round,pad=0.03",
                                       facecolor='white', edgecolor='#555555', linewidth=1.5)
            ax.add_patch(comp_rect)
            ax.text(x, y, comp, fontsize=11, va='center', ha='center')

    # 层间箭头
    for i in range(len(layers) - 1):
        y1 = start_y - i * 2.0 - 0.8
        y2 = start_y - (i + 1) * 2.0 + 0.8
        ax.annotate('', xy=(8, y2), xytext=(8, y1),
                   arrowprops=dict(arrowstyle='->', lw=2.5, color='#1976D2'))

    plt.tight_layout()
    # 高DPI保证清晰度
    plt.savefig(output_file, dpi=200, bbox_inches='tight',
                facecolor='white', edgecolor='none', pad_inches=0.3)
    plt.close()

# 使用示例
layers = [
    ("输入层", ["用户查询", "文档上传"]),
    ("处理层", ["OCR引擎", "文档分块", "Embedding"]),
    ("存储层", ["向量数据库", "GraphRAG"]),
    ("检索层", ["向量检索", "关键词检索", "图遍历"]),
    ("输出层", ["Agent编排", "LLM API", "生成回答"])
]
create_architecture_diagram("RAGFlow 系统架构", layers, "ragflow_arch.png")
```

**关键要点**:
| 参数 | 推荐值 | 说明 |
|------|--------|------|
| figsize | (16, 12) | 大尺寸保证细节清晰 |
| dpi | 200 | 高分辨率，打印清晰 |
| font | SimHei | 中文字体，避免方块 |
| bbox_inches | 'tight' | 自动裁剪空白边距 |

#### 方法 2: Mermaid + 转换工具

**适用**: 已有 Mermaid 定义文件 (.mmd)

**限制**: Mermaid CLI (mmdc) 需要安装 Chrome/Chromium，Windows 环境可能遇到依赖问题

**替代方案**: 使用 Mermaid Live Editor (https://mermaid.live/) 手动导出 PNG

#### 图片插入 DOCX

**使用 ImageRun 插入**:
```javascript
const { ImageRun } = require('docx');
const fs = require('fs');

// 读取图片
const imageBuffer = fs.readFileSync('diagrams/architecture.png');

// 插入图片（带尺寸控制）
new Paragraph({
  children: [
    new ImageRun({
      data: imageBuffer,
      type: "png",
      transformation: {
        width: 550,  // 宽度（像素）
        height: 367  // 高度（像素），保持比例
      }
    })
  ],
  spacing: { before: 200, after: 200 }
})
```

**布局优化建议**:
1. **避免强制分页**: 去掉 `pageBreakBefore: true`
2. **紧凑段落间距**: `spacing: { before: 200, after: 200 }`（约0.2英寸）
3. **图片环绕文字**: 使用 `alignment: AlignmentType.CENTER` 居中

**常见问题解决**:

| 问题 | 原因 | 解决 |
|------|------|------|
| 中文显示为方块 | matplotlib 默认字体不支持中文 | 设置 `plt.rcParams['font.sans-serif'] = ['SimHei']` |
| 图片太小 | figsize 或 transformation 尺寸不足 | figsize=(16,12), width=550+ |
| 图片模糊 | DPI 过低 | 保存时设置 `dpi=200` |
| 文字被截断 | bbox_inches 设置不当 | 使用 `bbox_inches='tight', pad_inches=0.3` |
| 文档空白过多 | pageBreakBefore 和 spacing 过大 | 去掉分页，减少 spacing 值 |

---

## LSP Configuration (Language Server Protocol)

### 启用 LSP 功能
本项目启用 LSP 支持以优化代码分析和减少 Token 消耗：

1. **代码补全**: 使用本地语言服务器提供智能代码补全
2. **语义分析**: 本地分析代码结构，减少模型重复分析
3. **错误检测**: 实时语法和类型检查
4. **代码导航**: 跳转到定义、查找引用

### Token 节省策略

根据知识库文章《Claude Code装了LSP后，Token消耗直接降了40%》，配置以下优化：

#### 1. 本地代码分析优先
- 语法分析由 LSP 本地完成
- 代码结构分析本地缓存
- 类型推断本地执行

#### 2. 智能上下文管理
- 只传递必要的代码片段给模型
- 使用符号引用代替完整代码
- 本地维护代码索引

#### 3. 增量更新
- 仅分析变更的代码部分
- 复用之前的分析结果
- 避免重复分析未改动代码


## Development Guidelines

### Code Style
- 使用 ES6+ 语法
- 异步操作使用 async/await
- 错误处理使用 try/catch

### LSP Optimized Workflow
1. **编辑时**: LSP 提供本地代码补全和错误检查
2. **保存时**: LSP 进行完整语法分析
3. **提问时**: 只传递必要的上下文给 Claude

## Commands

### LSP 相关命令
- `/lsp-restart` - 重启语言服务器
- `/lsp-status` - 查看 LSP 状态
- `/lsp-log` - 查看 LSP 日志

## Token Saving Metrics

目标：通过 LSP 配置实现以下 Token 节省：
- 代码编辑场景：节省 40% Token
- 代码分析场景：节省 30% Token
- 问题诊断场景：节省 50% Token

## References

- [Claude Code LSP 优化文章](https://ima.qq.com)
- [Language Server Protocol Specification](https://microsoft.github.io/language-server-protocol/)

---

## 自动记忆强制规则

**原则**: 所有微信消息的处理记录必须添加到 `D:\claudecode\MyAICodes\just-for-weixin\memory\weixin-history.md`末尾，无一例外。

**Why:** 用户明确要求所有消息处理都要记录下来，作为历史记录和知识沉淀。

**How to apply:**
1. 每次微信消息处理完成后（发送回复后），立即追加记录到 weixin-history.md
2. 记录格式：
   ```markdown
   ### 消息 X: [简短主题]
   **消息**: [用户消息摘要，前 100 字]
   **处理**: [处理流程简述]
   **结果**: [处理结果摘要，前 200 字]
   **标签**: #[关键词 1] #[关键词 2] #[关键词 3]
   ```
3. 按日期分组，新日期创建新章节
4. 处理完成和记录追加是两个独立步骤，都要执行

**违规处理**: 如果发现忘记记录，立即补充追加。

---

## 文档存放规则

**规则**: 所有生成的文档（DOCX、PDF、Markdown 等）必须存放到 `D:\claudecode\MyAICodes\just-for-weixin\` 目录下。

**Why**: 用户明确要求统一文档存放位置，便于查找和管理，同时避免占用 C 盘空间。

**How to apply:**
1. 使用 docx 技能生成文档时，输出路径指定为 `D:/claudecode/MyAICodes/just-for-weixin/`
2. 临时文件也使用此目录下的 `/tmp` 子目录
3. IMA 知识库上传的文档除外（云端存储）

---