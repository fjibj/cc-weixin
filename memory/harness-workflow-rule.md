---
name: Harness Workflow Rule
description: |
  微信消息处理的最高准则：所有消息必须使用完整 Harness 流程处理，
  并将 Plan/Work/Review/Reply 每一步的处理结果返回给微信用户。
type: feedback
---

# Harness 流程处理准则（最高优先级）

## 规则

**所有微信消息必须遵守以下流程**：

```
收到消息 → Phase 1: Plan → Phase 2: Work → Phase 3: Review → Phase 4: Reply
                ↓              ↓                ↓               ↓
           返回Plan结果    返回Work结果     返回Review结果   返回最终结果
```

## 各阶段输出要求

### Phase 1: Plan
- 分析消息意图
- 制定处理计划（Task列表）
- **必须返回**：计划概要给微信用户

### Phase 2: Work
- 执行计划中的每个 Task
- **必须返回**：每步执行结果给微信用户
- 格式：`【Phase 2: Work - Step X/Y】...`

### Phase 3: Review
- 审查处理结果
- **必须返回**：审查维度和结论给微信用户
- 格式：`【Phase 3: Review】...`

### Phase 4: Reply
- 发送最终回复
- **必须返回**：处理总结给微信用户
- 格式：`【Phase 4: Reply - 处理完成】...`

## 为什么

确保消息处理的透明度和可追溯性，让用户了解每一步的处理状态和结果。

## 如何应用

每次调用 auto-process.ts 发现新消息后：
1. 立即进入 Phase 1: Plan
2. 每阶段完成后发送微信回复
3. 最后使用 remove 命令删除已处理消息
