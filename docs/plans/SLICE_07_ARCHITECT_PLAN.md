下面是 Slice 07 的 Architect Plan Packet。

  ▎ 工作流约束（请先确认）：本 packet 仅做计划——不写代码、不 commit、不 push、不 reset、不 
  ▎ branch。所有路径已用绝对路径标注，便于直接交给 Codex 执行。本 slice 改动 
  ▎ reaper/packs/core/verify.lua，因此 live smoke 前必须完全退出并重开 REAPER，然后重新 Run 
  ▎ start_bridge.lua。

  ---
  候选排序（高→低）
  
  A. 继续 H2 字段 verify（剩余 7 模板的下一步）⭐ 推荐

  - Slice 06 把字段 verify 落到 4 个 in-place mutator（item_pitch / item_move / item_rate /
  track_rename）。Plan §H2 把字段后置校验定义为护城河；继续推 H2 是把"可验证内核"的覆盖率从
  36%（4/11）拉到 45%（5/11）。
  - 复用 Slice 06 的 check_fields() 基础设施，零新错误码，零工具面变化（满足 I1/I3/I7）。
  - 风险最低：与 Slice 06 同构，单 mutator 单切片，可静态测、可 live smoke。
  - 收益直接：把"在场更多 mutator 上、verify 不只是结构"的故事讲实。

  B. H4 idempotency token（重复调用 / timeout / BRIDGE_NOT_RUNNING 恢复语义）

  - 价值清晰（消除超时双 apply 歧义），但先要把产品决策钉死："逻辑操作 = ?"由谁出 key？key 与 LAST_RESULT
  同生命周期还是更短/更长？timeout 命中后回放语义？BRIDGE_NOT_RUNNING 命中后 agent 是否仍要 get_state
  复核？
  - 这些决策本身就是一份 packet。先放 Slice 08+ 做，避免把内核硬化拉成产品讨论。

  C. H6 scaffold

  - Plan/Execution 都明示 H6 依赖 H2 字段 verify"基本铺满"。当前 H2 字段 verify 只覆盖
  4/11，生成器现在写就会被迫吐出"verify 钩子带空 fields"占位，反向劣化模板默认契约。等 H2 字段 verify 
  覆盖到 ≥9/11 再做 H6。

  D. H3 read scope（v0.2 cursor / fields / 新 scope）

  - Plan/ROADMAP 都把 cursor、fields 投影、新 scope（items / fx-params / envelopes）放进 v0.2。Slice
  01/02 已经把 H3 readonly 关到 v0.1
  的合理止血点。现在追加属于"过早扩面"，违反"广度商品化前先硬化"的纪律。

  E. H7 socket 传输

  - 纯性能优化，无能力解锁。任意时刻可并行做，但不解开任何护城河。Slice 07 不上。

  结论：Slice 07 继续 H2 字段 verify，最小的下一刀 = item_trim（新增 1 个模板的字段
  verify，并引入"optional field"语义以服务后续 7 模板）。

  ---
  Architect Plan Packet — Slice 07
  
  GOAL

  把 Slice 06 的字段 verify 从 4 个模板扩到 5 个 —— 新纳入 item_trim，同时为整个剩余 7
  模板的扩张铺好基础设施：在 FieldCheckDescriptor 上引入 optional?: boolean，让"参数缺省 → 该字段跳过
  verify"成为一等公民。item_trim 是天然的首例（length 必填、start_offset 可选），且涉及 take + item 两个
  scope，验证 Slice 06 的 scope 表对单模板多字段的覆盖也成立。

  ┌───────────┬───────┬─────────────┬─────────────────────┬──────────┐
  │   模板    │ scope │    field    │     param 推导      │ optional │
  ├───────────┼───────┼─────────────┼─────────────────────┼──────────┤
  │ item_trim │ item  │ D_LENGTH    │ params.length       │ no       │
  ├───────────┼───────┼─────────────┼─────────────────────┼──────────┤                 
  │ item_trim │ take  │ D_STARTOFFS │ params.start_offset │ yes      │
  └───────────┴───────┴─────────────┴─────────────────────┴──────────┘

  bridge 在结构 verify 通过之后、finalize_template 之前，按 expectedDelta.fields[] 逐条读回；某条
  optional:true 且 params[paramPath] == nil 时 跳过（视为 ok），其余规则与 Slice 06 完全一致。

  NON-GOALS

  - 不动 5 工具面（I1）。
  - 不改 call_template 成功信封（I3）：失败信封仅在 error.details.fields[] 上扩张（保留 Slice 06 形状）。
  - 不引入新错误码、不重命名、不动 errs.* 接线（Slice 05 不变）。
  - 不放开 Slice 06 的 D5：fields 仍禁止与 creates / maybeCreates / deletes 共存。item_trim 是
  in-place，所以无需放开。track_create / item_duplicate / media_import / region_create 的字段 verify 留
  Slice 08+。
  - 不动 item_fade 的三态 nullable 语义（要求 optional 区分"absent"与"null"之外的额外语义，留 Slice 08+
  探）。
  - 不动 render_region（继续 Slice 04 起的 carve-out：无 expectedDelta、跳过任何 verify）。
  - 不动 LAST_RESULT 桶结构、entity_buckets、refs.lua。
  - 不动 get_state schema / include / fields / cursor。
  - 不做 H4 idempotency token、H6 scaffold、H7 socket。
  - 不动 recipes/、scripts/setup.mjs、install.*、setup-out/。
  - 不动 docs/CROSS_MAC_SMOKE.md、docs/ARCHITECTURE.md、docs/KERNEL_DESIGN.md、docs/INSTALL.md
  等非内核硬化文档。

  USER-FACING BEHAVIOR
  
  - 4 个 Slice 06 happy envelope 逐字节不变。
  - item_trim happy envelope 逐字节不变（仍是锁定的 { template, changed_count, changed_ids, truncated 
  }）。新增 wire 行为只在两种新路径上可见：
    a. 故意字段 mismatch：item_trim 同 Slice 06 风格返回 VERIFY_FAILED + recoverable:false +
  details.fields[] + 恢复短语；LAST_RESULT 不更新。
    b. list_templates metadata：item_trim 的 expectedDelta.fields[] 现在含 2 条，第二条带
  optional:true。其他 10 个模板字节稳定（含 Slice 06 的 4 个）。
  - read-only 路径（ping / get_state / list_templates）继续不触碰 LAST_RESULT（I7）。

  FILES LIKELY TO CHANGE

  TypeScript（写）
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/packages/core/src/registry.ts
    - FieldCheckDescriptor 新增可选 optional?: boolean。
    - validateExpectedDeltaFields 接受/校验 optional（必须是 true/false/缺省；其他类型立刻抛）。
    - toMetadata 透传 optional（缺省即省略，遵守 Slice 03 placeholder 省略策略）。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/packages/mcp-server/src/templates/item-trim.ts
    - descriptor 加 expectedDelta = { count: 1, fields: [ ... ] }，含 2 条 fields：
        - { field:"D_LENGTH", scope:"item", paramPath:"length", tolerance:1e-6 }
      - { field:"D_STARTOFFS", scope:"take", paramPath:"start_offset", tolerance:1e-6, optional:true }
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/packages/mcp-server/src/tools/call-template.ts
    - toWireExpectedDelta 在 fields 映射里透传 optional（snake_case 保持同名 optional，wire
  字节最小化）。

  Lua（写）
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/reaper/packs/core/verify.lua
    - M.check_fields 在 for 循环里：当 params[paramPath] == nil 且 field.optional == 
  true，直接跳过该字段；其他情况维持 Slice 06 行为（含未注入 expected_value 时 mismatch）。
    - 不改 FIELD_READERS 表（不新增 scope）。 
    - 不改 M.check（结构 verify 完全不动）。

  Scripts（写）
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/scripts/manifest-alignment.mjs
    - 静态规则扩展：optional 若存在必须是 boolean；不允许整条 fields 上所有字段都标
  optional:true（避免「全员可选 → verify 永远跳过」的暗坑）。 

  Tests（写）
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/packages/core/src/__tests__/registry.test.ts —
  +3：合法 optional:true；非法 optional:"yes"（拒）；非法整条 fields 全 optional:true（拒）。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/packages/mcp-server/src/tools/__tests__/call-template.
  test.ts — +2：item_trim 带 start_offset 时 wire expected_delta.fields 含两条且第二条
  optional:true；不带 start_offset 时 wire 依然含两条（descriptor 是稳定的），Lua 端跳过由 verify.lua
  决定。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/packages/mcp-server/src/tools/__tests__/list-templates
  .test.ts — +2：item_trim metadata fields 含 optional:true 第二条；其他 10 模板 metadata 字节稳定。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/scripts/__tests__/manifest-alignment.test.mjs —
  +2：non-boolean optional 拒绝；全 optional 拒绝。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/scripts/__tests__/lua-structure.test.mjs —
  +2：verify.lua check_fields 含 optional 跳过分支（grep 形态守护）；streetlight_bridge.lua 调用顺序仍是
  check_counts → check_fields → finalize_template（Slice 06 锁定形态不退化）。

  Docs（写）
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/docs/plans/SLICE_07_ARCHITECT_PLAN.md — 本 packet
  落盘。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/docs/HANDOFF.md — live edge 切到 Slice 07；Slice 06
  全部 decisions 保留；append Slice 07 decisions（D1–D4 见下）。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/docs/PROGRESS.md — Slice 07 段（scope / what changed /
  verification baseline 占位 / live smoke evidence 占位）。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/docs/TEMPLATE_SPEC.md — "Field-level Verification
  (Slice 06)" 子节末追加 "Optional fields (Slice 07)"，明示语义 + item_trim 例。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/docs/RESPONSE_BUDGET.md — VERIFY_FAILED details (Slice
  04+06) 段追加：details.fields[] 单次仍 ≤ 256 字节×条数；item_trim 同时失败两条时 ≤ 512 字节增量。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/docs/plans/KERNEL_HARDENING_PLAN.md § H2 — 注："Slice
  07 把字段 verify 扩到 item_trim，并引入 optional 字段语义；余下 6 模板留 Slice 08+。"
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/docs/plans/KERNEL_HARDENING_EXECUTION.md § H2 — 同上 +
  §0.2 重载协议条目追加："Slice 07 改 verify.lua check_fields 主路径，必须 full quit/reopen REAPER。"

  Files NOT touched（明确禁碰）

  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/packages/core/src/errors.ts、result.ts、risk.ts、types
  .ts、refs.ts、queue.ts
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/packages/mcp-server/src/transport/file-queue.ts（wire
  已透传 expected_delta 整体，无需改）
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/packages/mcp-server/src/index.ts、tools/{get-state,lis
  t-templates,list-recipes,ping}.ts
  - 10 个非 item_trim 模板 TS 文件
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/reaper/streetlight_bridge.lua（bridge
  调用顺序不动；只有 verify.lua 内部行为变）
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/reaper/packs/core/{manifest,refs,undo,error_codes}.lua
  、templates/*.lua、lib/*.lua
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/scripts/error-codes.mjs、scripts/setup.mjs、install.*
  、setup-out/、recipes/*.yaml

  CONTRACT / SCHEMA / ERROR-CODE CHANGES

  TS — FieldCheckDescriptor v3（向后兼容扩展）

  // packages/core/src/registry.ts
  export interface FieldCheckDescriptor {
    field: string;                      // REAPER attr name
    scope: "take" | "item" | "track";
    paramPath: string;                  // dot-free key in params
    tolerance?: number;                 // non-negative finite; absent → strict equality
    optional?: boolean;                 // ← Slice 07: 缺省 = 必读；true = 当 params[paramPath]==nil 
  时跳过
  }

  validateExpectedDeltaFields 追加：                                                   
  - optional 若存在必须严格 boolean，否则拒。
  - 整条 fields[] 中至少要有 1 条非 optional（防止"全员跳过"暗坑），否则拒。
  - 与 Slice 06 D5 共存：fields 仍不允许与 creates/maybeCreates/deletes 同时存在。

  Wire 协议（snake_case，wire 字节最小化）

  jsonc
  "expected_delta": {
    "count": 1,
    "fields": [
      { "field":"D_LENGTH",    "scope":"item", "param_path":"length",       "tolerance":1e-6 },
      { "field":"D_STARTOFFS", "scope":"take", "param_path":"start_offset", "tolerance":1e-6, "optional":
  true }
    ]
  }

  - 字段名 optional 在 TS 与 wire 同名（无 camelCase↔snake_case 翻译），减少漂移面。
  - Slice 06 已有的 param_path、tolerance 不变。

  Lua check_fields 行为差异（仅一处）

  -- 伪代码
  local expected_value = type(params) == "table" and params[key] or nil
  if expected_value == nil and field.optional == true then
    -- skip this field; treat as ok
  else
    -- existing Slice 06 behavior
  end

  VERIFY_FAILED 错误码：不动。details.fields[] 形状不动；上限按字段条数线性增长（Slice 07 单模板最多 2 条
  ⇒ ≤ 512 字节增量）。

  list_templates 元数据：item_trim 的 expectedDelta.fields[1].optional = true；其余字段省略，遵守 Slice
  03 omit-when-absent 策略。

  DECISIONS FOR USER

  #: D1
  决策项: Slice 07 收哪些模板？               
  选项: (a) 仅 item_trim；(b) item_trim + item_fade（要求新增 null vs absent 三态语义）；(c) item_trim +
    放宽 Slice 06 D5 收 track_create maybeCreates
  推荐: (a) — 一刀小、不动 D5、不触三态
  ────────────────────────────────────────
  #: D2 
  决策项: "optional 字段当 params 缺省时" 语义
  选项: (a) 跳过，记为 ok；(b) 视为 expected=0；(c) 视为 expected=nil（继续 mismatch）               
  推荐: (a) — (b) 会把"用户没传"和"用户传 0"合并语义；(c) 等同于不引入 optional
  ────────────────────────────────────────
  #: D3 
  决策项: optional 在 TS / wire / Lua 三处的命名
  选项: (a) 全部叫 optional；(b) wire 用 optional，TS/Lua 也保持同名
  推荐: (a) — 与 (b) 等价；明文记录避免后续漂移
  ────────────────────────────────────────                          
  #: D4
  决策项: D_STARTOFFS 的容差
  选项: (a) 1e-6（与 D_LENGTH 等价）；(b) 1e-4（给 REAPER 内部 source-seconds 归一化更多空间）
  推荐: (a)；若 live smoke 翻车再回退 (b) —— 保留 fallback
  ────────────────────────────────────────
  #: D5
  决策项: 是否允许整条 fields 中所有字段都 optional:true
  选项: (a) 静态拒绝；(b) 允许（但 "no-op verify" 是暗坑）
  推荐: (a) — 防止误把 verify 全部跳过

  RISKS & REGRESSION NOTES

  字段读取的 scope 坑（Plan §H2 已警告）
  - D_LENGTH 是 item 属性；D_STARTOFFS 是 take 属性。verify.lua 的 FIELD_READERS 已经分清 scope，但本
  slice 第一次在同一个模板内用两个不同 scope，要求 Slice 06 的 scope 表对"changed_ids[0] 既映射到 item
  又映射到 take"健壮。
  - 缓解：verify.lua 现有逻辑对每个 field 独立 reader.resolve(guid) → handle，再 reader.read(handle, 
  field.field)；同一 GUID 在 item scope 解出 MediaItem、在 take scope 解出 MediaItem 再 GetActiveTake —
  两次解析独立。无需新代码。 
  - live smoke 第 6 步必须明确做"带 start_offset 的 item_trim 同时 verify 两条字段"。

  handler 执行顺序 vs verify 时机
  - item_trim handler 现行规则："如果 start_offset 提供则必须先取 take，否则空 MIDI item 会在 D_LENGTH
  已写之后才报 TAKE_NOT_FOUND"。这是已锁定的"错误→零改动"契约（见 EXECUTION §0.3）。
  - 本 slice 不动 handler。verify 在 handler 之后跑，仍是 with_undo 块外 / finalize_template 之前。
  - 失败回归点：如果 D_STARTOFFS 在 REAPER 内部被 clamp（例如负数），field verify 会 mismatch。第一次
  smoke 用 start_offset:0.25 这种安全值，不测边界。边界探测留 Slice 09+。

  LAST_RESULT 不被字段 verify 失败污染
  - 与 Slice 06 同口径：item_trim 故意 mismatch → VERIFY_FAILED → LAST_RESULT.items 不更新；紧接
  item_pitch last_result:item:0 仍指向上一个成功 mutation 的 item GUID。
  - live smoke 第 7 步必查。

  wire 字节稳定
  - 4 个 Slice 06 模板 wire 字节不变（fields[] 不动；optional 不出现）。
  - 6 个未纳入模板 wire 字节不变（expected_delta 完全不含 fields）。
  - item_trim wire 在 Slice 07 之后 fields[] 含 2 条，第二条带 optional:true。这是预期的 wire
  diff，唯一。

  error-code constants 不退化
  - 失败路径仍走 errs.VERIFY_FAILED。
  - Slice 05 audit 已经 grep reaper/packs/core/**/*.lua，verify.lua 在路径内；新增 optional
  分支不引入字面量。
  - npm run check:error-codes-fresh 必须保持 22 codes。

  REAPER bridge boot 必须 full quit/reopen
  - 本 slice 改 verify.lua 的 check_fields 主路径。Slice 05+06 的 dofile 链在 bridge 启动时一次性加载；只
  Re-Run start_bridge.lua 在某些情况下旧 chunk 的 reaper.defer 还在用旧 check_fields。必须全退 REAPER
  进程，重开，再 Load+Run。
  - 验证 generation = 1 且 console 含 loaded error_codes (22 codes)。

  回归覆盖必查项
  - Slice 06 的 4 个 happy envelope 字节稳定（item_pitch / item_move / item_rate / track_rename）。
  - Slice 04 的结构 verify 失败仍优先于字段 verify（强制 expected_delta={count:1, creates:true} on
  item_pitch 走结构失败，不进字段 verify）。
  - Slice 05 errs.* 接线不退化（item_pitch selected:99 → ITEM_NOT_FOUND；region_create name:"a/b" →
  REGION_NAME_INVALID）。
  - Slice 02 get_state(tracks, include:["fx"]) 仍工作；get_state(render, include:["fx"]) 仍
  PARAMS_INVALID；get_state(render) 仍 SCOPE_NOT_IMPLEMENTED。
  - Slice 01 readonly scope 不污染 LAST_RESULT。
  - render_region 仍跳过任何 verify；changed_ids 仍是绝对路径。

  IMPLEMENTATION SEQUENCE

  按依赖顺序（每步独立绿测后再走下一步）：

  1. TS schema 扩展 — /Users/Zhuanz/Documents/streetlight-reaper-mcp/packages/core/src/registry.ts
    - 加 optional?: boolean 到 FieldCheckDescriptor。
    - 扩展 validateExpectedDeltaFields：boolean 类型校验 + 至少 1 条非 optional 校验。
    - 扩展 toMetadata：透传 optional，缺省省略。
    - 先在 /Users/Zhuanz/Documents/streetlight-reaper-mcp/packages/core/src/__tests__/registry.test.ts
  加新测试（合法 / 非法 boolean / 全 optional 拒），再写实现（TDD）。
  2. item_trim descriptor —
  /Users/Zhuanz/Documents/streetlight-reaper-mcp/packages/mcp-server/src/templates/item-trim.ts
    - 加 expectedDelta = { count:1, fields:[ {D_LENGTH,...}, {D_STARTOFFS,...,optional:true} ] }。
  3. wire 透传 —
  /Users/Zhuanz/Documents/streetlight-reaper-mcp/packages/mcp-server/src/tools/call-template.ts
    - toWireExpectedDelta 在 fields 映射里加 ...(field.optional !== undefined ? { optional: 
  field.optional } : {})。
    - 在 /Users/Zhuanz/Documents/streetlight-reaper-mcp/packages/mcp-server/src/tools/__tests__/call-temp
  late.test.ts 加 2 个测试断言 wire payload。
  4. list_templates 富化 — /Users/Zhuanz/Documents/streetlight-reaper-mcp/packages/mcp-server/src/tools/_
  _tests__/list-templates.test.ts
    - 加 2 个测试：item_trim metadata expectedDelta.fields[1].optional === true；其余模板 metadata 无
  optional 出现。
  5. 静态守护 — /Users/Zhuanz/Documents/streetlight-reaper-mcp/scripts/manifest-alignment.mjs +
  /Users/Zhuanz/Documents/streetlight-reaper-mcp/scripts/__tests__/manifest-alignment.test.mjs
    - 扩展规则 + 测试覆盖 2 条新规则。
  6. Lua verify.lua 增强 — /Users/Zhuanz/Documents/streetlight-reaper-mcp/reaper/packs/core/verify.lua
    - 在 M.check_fields 的循环里加 optional 跳过分支。
    - 不改 M.check、不动 FIELD_READERS、不动 streetlight_bridge.lua 调用顺序。
  7. lua-structure 守护 —
  /Users/Zhuanz/Documents/streetlight-reaper-mcp/scripts/__tests__/lua-structure.test.mjs
    - +2 grep 守护（optional skip 分支存在；bridge 调用顺序仍是
  check_counts→check_fields→finalize_template）。
  8. 静态闸 — 见下 STATIC VERIFICATION。
  9. REAPER full quit/reopen → ReaScript: Load → Run — 验证 generation = 1 + loaded error_codes (22 
  codes)。
  10. Live smoke — 见下 LIVE SMOKE PLAN。
  11. Docs 同步 — HANDOFF / PROGRESS / TEMPLATE_SPEC / RESPONSE_BUDGET /
  KERNEL_HARDENING_{PLAN,EXECUTION} / 本 packet。

  STATIC VERIFICATION
  
  绝对路径命令（直接 copy 给 Codex）：

  cd /Users/Zhuanz/Documents/streetlight-reaper-mcp
  npm test
  npm run build
  npm run check:manifest
  npm run check:error-codes-fresh
  git -C /Users/Zhuanz/Documents/streetlight-reaper-mcp diff --check

  通过判据：
  - npm test → 基线 254 + 新增 8–13 之间（≈ 262–267）全绿；若 < 254 视为回归。
  - npm run build → 0 报错（pre-existing TS6310 噪声可忽略）。
  - npm run check:manifest → Streetlight manifest alignment ok (11 templates).
  - npm run check:error-codes-fresh → Streetlight error codes fresh (22 codes). + zero forbidden literal
  usage.
  - git diff --check → 无空白错误。

  LIVE SMOKE PLAN
  
  前置（必须）：用户完全退出 REAPER 进程（不只是关项目），重开 → Actions → Show action list → ReaScript:
  Load… → 选 start_bridge.lua → Run。console 必须有：

  [streetlight] loaded error_codes (22 codes)
  bridge ready (generation 1) — loaded error_codes (22 codes) — templates: …

  generation ≠ 1 或 22 codes 行缺失 → 不通过，回到前置。本 slice 改 verify.lua check_fields
  主路径，Re-Run 不够，必须 full quit/reopen。

  Smoke 步骤（保持 Slice 04/05/06 的"成功路径 + 故意 mismatch + Slice 06 回归"三轨）：

  1. S0 reachability：ping → bridge:connected，reaper_version=7.71/macOS-arm64。
  2. S1 list_templates：11 模板返回；断言 item_trim metadata expectedDelta.fields 含 2 条且第二条
  optional:true；4 个 Slice 06 模板 metadata 字节稳定；其余 6 个仍无 fields。
  3. S2 item_trim happy（length 单字段）：在已有 item 上跑 item_trim length:1.0，不传 start_offset → 成功
  envelope；REAPER 属性对话框 Length = 1.000，Start in source = 0（未动）。verify 端 D_LENGTH
  验过；D_STARTOFFS 因 optional+absent 跳过。
  4. S3 item_trim happy（length + start_offset）：item_trim last_result:item:0 length:1.0 
  start_offset:0.25 → 成功 envelope；属性对话框 Length=1.000、Take start offset=0.250。verify
  端两条均验过。
  5. S4 Slice 06 happy 回归：抽 1–2 个 Slice 06 模板做 happy（如 item_pitch semitones:-3 + item_move 
  position:5.0），确认 envelope 字节稳定。
  6. S5 字段 mismatch 强制路径（raw queue）：直接往 queue 投 item_trim，但 expected_delta.fields[0].field
  改成不存在的 attr（如 D_LENGTHX），handler 仍正常写 D_LENGTH。结果应为：bridge 读 D_LENGTHX 失败 →
  fields verify 失败 → VERIFY_FAILED, recoverable:false，details.fields[0].ok=false，message 含 Slice 04
  恢复短语字面量。
  7. S6 LAST_RESULT 未污染验证：紧接 S5，发 item_pitch last_result:item:0 semitones:0，应仍指向上一个成功
  mutation 的 item GUID（即 S3 或 S4 的 item），不指向 S5 的 raw item_trim。
  8. S7 optional skip 验证（raw queue）：raw 发 item_trim length:0.5 但人为去掉 wire 中
  params.start_offset → bridge 内部 params.start_offset == nil + field.optional == true ⇒
  第二条字段跳过；整体 envelope = success。验证 verify.lua 跳过逻辑确实生效。
  9. S8 结构 mismatch 仍优先（Slice 04 回归）：raw 发 item_trim length:1.0 + expected_delta={count:1, 
  creates:true, fields:[…]} → 结构 verify 失败优先返回，details 不含 fields。
  10. S9 error-code constants 回归：item_trim selected:99 → ITEM_NOT_FOUND；region_create name:"a/b" →
  REGION_NAME_INVALID。
  11. S10 get_state include 回归：get_state(tracks, include:["fx"]) 仍 OK；get_state(render, 
  include:["fx"]) 仍 PARAMS_INVALID；get_state(render) 仍 SCOPE_NOT_IMPLEMENTED。
  12. S11 render_region carve-out：render_region happy 路径仍工作，仍跳过 verify，仍只返绝对路径。

  清理：smoke 中创建的 track / item / region 留在 REAPER 项目里由用户手动 Cmd+Z / 删除（沿用 Slice
  04/05/06 惯例）；任何临时 render dir 必须删干净。

  通过判据：S0–S11 全绿，且：
  - item_trim 两个 happy envelope 与 Slice 06 之前字节同构（仅 template 名不同）。
  - S5 details 含 fields[0]，结构与本 packet CONTRACT 段一致。 
  - S7 optional skip 路径 envelope 是 success，未走 VERIFY_FAILED。
  - S8 details 不含 fields（向后兼容验证）。
  - S9/S10/S11 wire code 与 Slice 06 之前完全一致。
  - 任何 path 退化为 INTERNAL_ERROR / 错误码字面量泄漏 → 不通过，回滚迁移并复盘。

  ---
  给用户的拍板请求

  请就 D1–D5 拍板（推荐 (a)/(a)/(a)/(a)/(a)），其余按本 packet 推进。Codex 执行；reviewer 只读复核；smoke
  通过后由你决定是否 commit——本 packet 不替你 commit、不 push、不 reset、不 branch。

  若想换方向：
  - H4 idempotency token：请先告知"逻辑操作 = ?"、key 生命周期、timeout/BRIDGE_NOT_RUNNING
  命中回放语义这三处决策，我会替换为 H4 packet（决策成本显著更高）。
  - H6 scaffold：建议至少先把 H2 字段 verify 推到 ≥9/11 模板再启动，否则 scaffold 吐出的 verify
  钩子是半残的（默认契约劣化）。 
  - H3 cursor / 新 scope：v0.2 范畴，会绕过本阶段"广度商品化前先硬化"的纪律，建议保留到 v0.1 release
  之后。
  - H7 socket：纯性能，与 Slice 07 不冲突，可并行；只要不动 5 工具面 / 信封形态（I1/I3）我可以另起一份
  packet。