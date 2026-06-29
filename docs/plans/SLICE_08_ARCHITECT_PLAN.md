
⏺ 下面是 Slice 08 的 Architect Plan Packet。

  ▎ 工作流约束（先确认）：本 packet 仅做计划——不写代码、不 commit、不 push、不 reset、不
  branch。所有路径用绝对路径。本 slice 改 reaper/packs/core/verify.lua 的 check_fields 主路径，因此 live
  smoke 必须完全退出并重开 REAPER，然后重新 Run start_bridge.lua（generation 必须 = 1）。

  ---
  候选排序（高→低）
  
  A. 继续 H2 字段 verify — item_fade ⭐ 推荐

  - Slice 06 落了 4 个 in-place mutator；Slice 07 把 item_trim 引入并落下 optional?: boolean。当前覆盖率
  5/11。
  - 剩余 6 个未覆盖模板里，5 个会创建实体（item_duplicate / track_create / media_import /
  region_create），全部被 Slice 06 锁定的 D5（fields 与 creates / maybeCreates / deletes 互斥）拦住；只有
  item_fade 是纯 in-place，是不动 D5 就能往前推的唯一一刀。
  - item_fade 解锁一个真正新的语义：三态参数 absent / json.null / number。Step 4c 已经把 wire/null 的
  round-trip 做实（123/123 测试时即把"显式 null 不被 MCP 静默丢"做成 load-bearing）；Slice 08 要把 verify
  端补齐——把"用户传 null = 把字段清成 0"映射到字段后置校验。这是 Slice 09+ 起拆 D5 之前必须先解锁的
  verify 表达力，否则 D5 放宽后 media_import / track_create 这些 null-or-number 形态根本没法验。
  - 收益：H2 覆盖从 5/11 → 6/11；同时为剩余 5 个 creates-类模板（Slice 09+）铺好"null-coerce +
  multi-field-optional"基础设施。
  - 风险最低：单模板、同 scope（item）、复用 Slice 06/07 全部 verify 路径，只在 check_fields 里加一个
  null-coerce 分支。

  B. item_duplicate / media_import / region_create 中的任一 creates-类

  - 都要先放宽 Slice 06 D5；并需要把 verify 端的"新建实体 GUID 即 changed_ids[0]"映射钉死（实际 Slice 06
  已铺好，但 D5 拦住了静态校验路径）。
  - 这是 Slice 09 的主题，不是 08：先做 item_fade 把"null 语义"和"全 optional 合法性"解锁，再统一拆
  D5，否则 Slice 09 会同时面对"放 D5"和"加 null 语义"两个变量，故障定位贵。

  C. track_create (maybeCreates:true)

  - 同 B，叠加 maybeCreates 路径下"reuse_existing 走 0-change 成功"的边界——changed_ids[0]
  仍指向命中已存在的 track，verify 仍可读 P_NAME。但同样需先拆 D5。Slice 09+。

  D. H4 idempotency token

  - 需先钉三处产品决策（逻辑操作的 key 由谁出 / key 与 LAST_RESULT 同生命周期还是更短/更长 /
  BRIDGE_NOT_RUNNING 命中后的回放语义）。本身就是一份 packet。Slice 08 不上。

  E. H6 scaffold

  - Plan/Execution 明示依赖"H2 字段 verify 基本铺满"。当前 5/11，Slice 08 推到 6/11 仍远不够；H6
  现在做会强迫吐"空 fields verify 占位"，反向劣化默认契约。最早 Slice 10+。

  F. H3 cursor / 新 scope / H7 socket

  - H3 cursor / 新 scope = v0.2 范畴；H7 socket = 纯性能。都不解锁护城河，Slice 08 不上。

  结论：Slice 08 = item_fade 字段 verify + nullable 语义引入。这是不动 D5、最小风险、解锁后续 5 个
  creates-类模板必需基础设施的唯一路径。

  ---
  Architect Plan Packet — Slice 08

  1. GOAL

  把 Slice 07 的字段 verify 从 5 个模板扩到 6 个，新纳入 item_fade，同时为 Slice 09+ 拆 D5 后批量收剩余 5
  个 creates-类模板铺好关键基础设施：在 FieldCheckDescriptor 上引入 nullable?: boolean，并定义 verify
  端的 null-coerce 语义：

  ┌───────────┬───────┬──────────────┬─────────────────┬──────────┬──────────┐
  │   模板    │ scope │    field     │   param 推导    │ optional │ nullable │
  ├───────────┼───────┼──────────────┼─────────────────┼──────────┼──────────┤
  │ item_fade │ item  │ D_FADEINLEN  │ params.fade_in  │ yes      │ yes      │
  ├───────────┼───────┼──────────────┼─────────────────┼──────────┼──────────┤
  │ item_fade │ item  │ D_FADEOUTLEN │ params.fade_out │ yes      │ yes      │
  └───────────┴───────┴──────────────┴─────────────────┴──────────┴──────────┘

  verify.lua 在结构 verify 通过之后、finalize_template 之前，按 expectedDelta.fields[]
  逐条读回；解析规则：

  1. params[paramPath] == nil 且 field.optional == true → 跳过（Slice 07 行为，不变）。
  2. params[paramPath] == ctx.json.null（同一 sentinel）且 field.nullable == true → expected = 0（清 fade
  的语义）。
  3. params[paramPath] == nil 且 field.optional ~= true → mismatch（Slice 06 行为，不变）。
  4. params[paramPath] == ctx.json.null 但 field.nullable ~= true → mismatch（防止误用；强制声明）。
  5. 其余 → expected = params[paramPath]（Slice 06 行为，不变）。

  同时放宽 Slice 07 D5（all-optional 拒绝规则）：当 fields[] 内所有字段同时声明 optional:true AND 
  nullable:true（即"全员是 selective-setter + null-clears"形态），静态允许。这正是 item_fade
  的形态；其它"全 optional 但无 nullable"的情况仍拒（防"verify 永远 no-op"的暗坑）。

  H2 覆盖率：5/11 → 6/11。

  ---
  2. NON-GOALS

  - 不动 5 工具面（I1）。
  - 不动 call_template 成功信封（I3）：失败信封仅在 error.details.fields[] 上扩张（保留 Slice 06/07
  形状）。
  - 不引入新错误码、不重命名、不动 errs.* 接线（Slice 05 不变）。
  - 不放开 Slice 06 D5 的 fields-vs-creates 互斥；剩余 5 个 creates-类模板（item_duplicate / track_create
  / media_import / region_create）的字段 verify 留 Slice 09+。
  - 不动 item_trim 的 Slice 07 形态（保持 2 条字段、第二条 optional:true）。
  - 不动 render_region（继续 Slice 04 起的 carve-out：无 expectedDelta、跳过任何 verify）。
  - 不动 LAST_RESULT 桶结构、entity_buckets、refs.lua。
  - 不动 get_state schema / include / fields / cursor。
  - 不动 item.lua 的 item_fade handler 本体（三态 absent/null/number 已在 Step 4c 完成；本 slice 只动
  verify 端）。
  - 不做 H4 idempotency token、H6 scaffold、H7 socket。
  - 不动 recipes/、scripts/setup.mjs、install.*、setup-out/。
  - 不动 docs/CROSS_MAC_SMOKE.md、docs/ARCHITECTURE.md、docs/KERNEL_DESIGN.md、docs/INSTALL.md
  等非内核硬化文档。

  ---
  3. USER-FACING BEHAVIOR
  
  - Slice 06 的 4 happy envelope + Slice 07 的 2 happy envelope 逐字节不变。
  - item_fade happy envelope 逐字节不变（仍是锁定 { template, changed_count, changed_ids, truncated 
  }）。新增 wire 行为只在三种新路径上可见：

  - a. 故意字段 mismatch（错的 D_FADEINLEN 或人为把 expected 改成不可能值）：同 Slice 06/07 风格返回
  VERIFY_FAILED + recoverable:false + details.fields[] + 恢复短语；LAST_RESULT 不更新。

  - b. list_templates metadata：item_fade 的 expectedDelta.fields[] 现在含 2 条，两条均带 optional:true 
  与 nullable:true；其他 10 个模板字节稳定（含 Slice 06 的 4 个 + Slice 07 的 item_trim）。

  - c. null-coerce 路径：call_template item_fade fade_in:null fade_out:0.5 后 verify 端把 fade_in 的
  expected 视为 0、fade_out 视为 0.5；两条都通过 → success envelope 不变；D_FADEINLEN=0 在属性对话框是"无
  fade in"。
  - read-only 路径（ping / get_state / list_templates / list_recipes）继续不触碰 LAST_RESULT（I7）。

  ---
  4. FILES LIKELY TO CHANGE
  
  TypeScript（写）

  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/packages/core/src/registry.ts
    - FieldCheckDescriptor 新增可选 nullable?: boolean。
    - validateExpectedDeltaFields：
        - nullable 若存在必须严格 boolean；其他类型立刻抛。
      - 放宽 Slice 07 D5："至少 1 条非 optional"规则修订为："若所有字段均
  optional:true，则要求所有字段同时 nullable:true"；否则拒。其它现状（duplicate (scope,field)、负
  tolerance、dotted paramPath、与 creates/maybeCreates/deletes 共存）一律不动。
    - toMetadata 透传 nullable（缺省即省略，遵守 Slice 03 omit-when-absent 策略）。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/packages/mcp-server/src/templates/item-fade.ts
    - descriptor 加 expectedDelta = { count: 1, fields: [ ... ] }，含 2 条：
        - { field:"D_FADEINLEN",  scope:"item", paramPath:"fade_in",  tolerance:1e-6, optional:true, 
  nullable:true }
      - { field:"D_FADEOUTLEN", scope:"item", paramPath:"fade_out", tolerance:1e-6, optional:true, 
  nullable:true }
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/packages/mcp-server/src/tools/call-template.ts
    - toWireExpectedDelta 在 fields 映射里透传 nullable（snake_case 与 wire 字面同名
  nullable，最小化漂移面）。

  Lua（写）
  
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/reaper/packs/core/verify.lua
    - M.check_fields 循环里新增null-coerce 分支（伪代码见 §6）。
    - 不改 FIELD_READERS 表（不新增 scope；fade 字段两条都是 item scope）。
    - 不改 M.check（结构 verify 完全不动）。
    - 不动 M.check_fields 的 optional 跳过分支（Slice 07 形态）。

  Scripts（写）

  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/scripts/manifest-alignment.mjs
    - 静态规则扩展：与 registry.ts 同口径——nullable 若存在必须 boolean；all-optional
  放宽规则同步实现一份（避免 manifest CLI 与 vitest 校验偏离）。

  Tests（写）

  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/packages/core/src/__tests__/registry.test.ts
    - +4：合法 nullable:true；非法 nullable:"yes"（拒）；all-optional +
  all-nullable（接受）；all-optional 但缺 nullable（拒，回归 Slice 07 D5 兜底）。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/packages/mcp-server/src/tools/__tests__/call-template.
  test.ts
    - +3：
        - item_fade fade_in:0.25 fade_out:0.5 → wire expected_delta.fields[] 含 2 条且均带 optional:true,
  nullable:true。
      - item_fade fade_in:null → wire payload 内 params.fade_in === null（沿用 Step 4c load-bearing
  测试形态），且 wire expected_delta.fields 仍稳定。
      - item_fade {} → 仍合法（descriptor 稳定），verify 跳过两条由 Lua 决定。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/packages/mcp-server/src/tools/__tests__/list-templates
  .test.ts
    - +2：item_fade metadata expectedDelta.fields[] 含 2 条，均带 optional:true, nullable:true；其他 10
  模板 metadata 字节稳定（含 Slice 07 的 item_trim：第二条 optional:true 但无 nullable）。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/scripts/__tests__/manifest-alignment.test.mjs
    - +3：non-boolean nullable 拒；all-optional + all-nullable 接受；all-optional 缺 nullable 拒。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/scripts/__tests__/lua-structure.test.mjs
    - +2：verify.lua check_fields 含 nullable null-coerce 分支（grep 守护，禁止它退化为同 optional
  一条线）；streetlight_bridge.lua 调用顺序仍是 check_counts → check_fields → finalize_template（Slice
  06/07 锁定形态不退化）。

  Docs（写）

  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/docs/plans/SLICE_08_ARCHITECT_PLAN.md — 本 packet
  落盘。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/docs/HANDOFF.md — live edge 切到 Slice 08；Slice 07
  全部 decisions 保留；append Slice 08 decisions（D1–D5 见 §7）。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/docs/PROGRESS.md — Slice 08 段（scope / what changed /
  verification baseline 占位 / live smoke evidence 占位）。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/docs/TEMPLATE_SPEC.md — "Optional fields (Slice 07)"
  子节后追加 "Nullable fields (Slice 08)"，明示 json.null → 0 语义 + item_fade 例 + 与 optional
  的正交关系。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/docs/RESPONSE_BUDGET.md — VERIFY_FAILED details
  段追加：单 item_fade 同时两条字段失败时 details.fields[] ≤ 512 字节增量（与 item_trim 同口径）。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/docs/plans/KERNEL_HARDENING_PLAN.md § H2 — 注："Slice
  08 把字段 verify 扩到 item_fade，引入 nullable 字段语义（json.null → coerce 0）；剩余 5 个
  creates-类模板留 Slice 09+，需先放宽 D5。"
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/docs/plans/KERNEL_HARDENING_EXECUTION.md § H2 + §0.2
  重载协议 — 追加："Slice 08 改 verify.lua check_fields 主路径（新增 null-coerce 分支），必须 full
  quit/reopen REAPER。"

  Files NOT touched（明确禁碰）
  
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/packages/core/src/errors.ts、result.ts、risk.ts、types
  .ts、refs.ts、queue.ts
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/packages/mcp-server/src/transport/file-queue.ts（wire
  已透传 expected_delta 整体，无需改）
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/packages/mcp-server/src/index.ts、tools/{get-state,lis
  t-templates,list-recipes,ping}.ts
  - 10 个非 item_fade 模板 TS 文件（含 Slice 07 的 item_trim：本 slice 不重整 optional 与 nullable
  的关系）
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/reaper/streetlight_bridge.lua（bridge
  调用顺序不动；只有 verify.lua 内部行为变）
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/reaper/packs/core/{manifest,refs,undo,error_codes}.lua
  、templates/*.lua（含 item.lua 的 item_fade handler 本体，三态语义已在 Step 4c 落定）、lib/*.lua
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/scripts/error-codes.mjs、scripts/setup.mjs、install.*
  、setup-out/、recipes/*.yaml
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/render_region 模板（继续 carve-out）

  ---
  5. CONTRACT / SCHEMA / ERROR-CODE CHANGES
  
  TS — FieldCheckDescriptor v4（向后兼容扩展）

  // packages/core/src/registry.ts
  export interface FieldCheckDescriptor {
    field: string;                      // REAPER attr name
    scope: "take" | "item" | "track";
    paramPath: string;                  // dot-free key in params
    tolerance?: number;                 // non-negative finite; absent → strict equality
    optional?: boolean;                 // Slice 07: 缺省 = 必读；true = 当 params[paramPath]==nil 时跳过
    nullable?: boolean;                 // ← Slice 08: 缺省 = 拒 null；true = 当 params[paramPath]===null
  时 expected=0
  }

  validateExpectedDeltaFields 追加：

  - nullable 若存在必须严格 boolean，否则拒。
  - "至少 1 条非 optional" 规则修订为："若 fields[] 全部 optional:true，则 fields[] 必须全部
  nullable:true；否则拒"——防止"verify 全员 no-op"暗坑。
  - 与 Slice 06 D5 共存：fields 仍不允许与 creates/maybeCreates/deletes 同时存在（Slice 08 不放开）。

  Wire 协议（snake_case，字面同名，wire 字节最小化）

  jsonc
  "expected_delta": {
    "count": 1,
    "fields": [
      { "field":"D_FADEINLEN",  "scope":"item", "param_path":"fade_in",  "tolerance":1e-6,
  "optional":true, "nullable":true },
      { "field":"D_FADEOUTLEN", "scope":"item", "param_path":"fade_out", "tolerance":1e-6,
  "optional":true, "nullable":true }
    ]
  }

  - TS / wire / Lua 三处 nullable 同名，零翻译表。
  - Slice 06/07 已有的 param_path / tolerance / optional 不变。

  Lua check_fields 行为差异（仅新增 1 段）

  -- 伪代码（Slice 08 新增段位置：optional 跳过分支之后）
  local raw = type(params) == "table" and params[key] or nil
  local expected_value

  if raw == nil and field.optional == true then
    -- Slice 07: skip
    goto continue
  elseif raw == nil and not field.optional then
    -- Slice 06: mismatch (param required but missing)
    -- ...record mismatch and continue...
  elseif raw == ctx.json.null then
    if field.nullable == true then
      expected_value = 0  -- ← Slice 08 null-coerce
    else
      -- Slice 06 strict: null but field doesn't declare nullable → mismatch
      -- ...record mismatch and continue...
    end
  else
    expected_value = raw  -- Slice 06 normal path
  end

  -- read actual via FIELD_READERS[scope]; compare with tolerance; etc.

  注意：ctx.json.null 是 Slice 04a 落下的 sentinel object（reaper/packs/core/lib/json.lua 维护），不是
  Lua nil。这是 Step 4c 把"三态语义"做实的关键点，本 slice 直接复用，不引入新 sentinel。

  VERIFY_FAILED 错误码：不动。details.fields[] 形状不动；上限按字段条数线性增长（Slice 08 单模板最多 2 条
  ⇒ ≤ 512 字节增量，与 Slice 07 同口径）。

  list_templates 元数据：item_fade 的 expectedDelta.fields[].optional = true + .nullable = 
  true；缺省字段省略，遵守 Slice 03 omit-when-absent 策略。

  ---
  6. DECISIONS FOR USER

  ┌─────┬──────────────────┬───────────────────────────────────────────┬─────────────────────────────┐
  │  #  │      决策项      │                   选项                    │            推荐             │
  ├─────┼──────────────────┼───────────────────────────────────────────┼─────────────────────────────┤
    P_NAME）；(c) 仅放宽 D5 收 track_create，item_fade 留 Slice 09
  推荐: (a) — 一刀小、不动 D5、把 null 语义先单独验证；放 D5 + null 语义同切片故障定位贵
  ────────────────────────────────────────
  #: D2 
  决策项: nullable:true 命中 json.null 时 verify expected 取值
  选项: (a) hardcode 为 0（fade 清场即 0）；(b) 增字段 nullCoerceTo: number 显式声明；(c) 不引入     
    nullable，让 item_fade 单独走 v0.2
  推荐: (a) — item_fade 是 v0.1 唯一 nullable 用例；若 Slice 09+ 出现非 0 coerce 需求再加 nullCoerceTo
    字段
  ────────────────────────────────────────
  #: D3 
  决策项: nullable 在 TS / wire / Lua 三处的命名
  选项: (a) 全部叫 nullable；(b) 取更具体名 null_to_zero               
  推荐: (a) — 与 Slice 07 optional 同口径；若未来 (D2) 改成 nullCoerceTo 显式取值，nullable 仍是开关 
  ────────────────────────────────────────
  #: D4 
  决策项: Slice 07 "至少 1 条非 optional" 规则如何处理
  选项: (a) 放宽：all-optional 合法 iff all-nullable（item_fade 形态）；(b) 完全废除规则；(c)        
  不动规则、给             
    item_fade 例外白名单
  推荐: (a) — 保留暗坑防护（all-optional 必须显式声明 nullable，把"selective + null-clears"的意图写在
    descriptor 上）
  ────────────────────────────────────────
  #: D5
  决策项: D_FADEINLEN / D_FADEOUTLEN 容差
  选项: (a) 1e-6（与 Slice 06/07 等价）；(b) 1e-4（给 REAPER 内部 fade-clamp 更多空间）
  推荐: (a)；若 live smoke 翻车（边界 fade 长度被 REAPER 内部夹取）再回退 (b)，保留 fallback

  ---
  7. RISKS & REGRESSION NOTES

  json.null sentinel identity（Slice 08 最大风险点）

  - ctx.json.null 是 reaper/packs/core/lib/json.lua 内部维护的 unique table。bridge 在解码 wire payload
  时把 JSON null 解析为这个 sentinel；handler 与 verify 端必须共享同一个 sentinel 才能用 raw == 
  ctx.json.null 比较成功。
  - 缓解：verify.lua 已经通过 ctx 接收 json 注入（同 handler）。Slice 08 的 check_fields 调用约定要求
  bridge 把 ctx.json 传入（已有），不引入新 sentinel。实施时务必验证 verify.lua 用的就是 bridge 
  注入的同一 ctx.json.null，而不是新 dofile 出来的副本——否则两个 table 永不相等，nullable
  分支永远走不到，行为退化为"null → mismatch"。
  - 静态守护：lua-structure.test.mjs 的 grep 守护必须断言 check_fields 引用 ctx.json.null（或等价的
  sentinel 传参），不允许 verify.lua 内部 require/dofile json 取副本。

  与 Slice 07 optional 的正交性

  - optional 控"参数 absent 时是否合法"；nullable 控"参数显式 null 时 expected 是否变 0"。两者完全正交。
  - item_fade 两条字段都 optional+nullable：absent → 跳过；null → expected=0；number → expected=number。
  - item_trim 的第二条仍是 optional 无 nullable：absent → 跳过；null → mismatch（因 nullable 缺省 = 拒
  null）。这是预期行为：item_trim start_offset 不接受 null（schema 也不允许）。
  - 静态守护：registry 与 manifest-alignment 必须能拒"声明 nullable:true 但 Zod schema 不允许
  null"的描述符——但这需要 cross-package introspection；本 slice 先不做（reviewer 兜底），列入 Slice 10+
  scaffold/H6 时一并解决。

  字段读取的 scope 一致性

  - D_FADEINLEN / D_FADEOUTLEN 都是 item 属性（与 item_trim 的 D_LENGTH 同 scope）。verify.lua
  FIELD_READERS 表对 scope:"item" 已经在 Slice 06 落实，本 slice 无需新代码。
  - 不像 Slice 07 同模板同时跨 item + take，Slice 08 是单 scope，scope 表压力为 0。

  handler 执行顺序 vs verify 时机

  - item_fade handler（已在 Step 4c 落定）：absent → 不调用 SetMediaItemInfo_Value；json.null → 写
  0；number → 写值。
  - 本 slice 不动 handler。verify 在 handler 之后跑，仍是 with_undo 块外 / finalize_template 之前。
  - 边界回归点：当 fade_in:0 和 fade_in:null 都写 D_FADEINLEN=0，REAPER 端不可分。verify 把两者统一处理为
  expected=0，这正是契约。Step 4c 已把"clear (null) vs leave alone (absent)"的区别留在 handler；verify
  端不重复区分。

  LAST_RESULT 不被字段 verify 失败污染

  - 与 Slice 06/07 同口径：item_fade 故意 mismatch → VERIFY_FAILED → LAST_RESULT.items 不更新；紧接
  item_pitch last_result:item:0 仍指向上一个成功 mutation 的 item GUID。
  - live smoke 第 7 步必查。

  wire 字节稳定

  - Slice 06 的 4 模板 wire 字节不变（fields[] 不动；nullable 不出现）。
  - Slice 07 的 item_trim wire 字节不变（保留 2 条字段；第二条仍 optional:true、无 nullable）。
  - 5 个未纳入模板 wire 字节不变（expected_delta 完全不含 fields）。
  - item_fade wire 在 Slice 08 之后 fields[] 含 2 条，两条都带 optional:true + nullable:true。这是预期的
  wire diff，唯一。
  - list_templates metadata 差异同 wire（Slice 03 omit-when-absent 策略：未声明的字段全部省略）。

  render_region carve-out

  - 仍跳过任何 verify；changed_ids 仍是绝对路径。本 slice 不会让 carve-out 渗漏（render_region 没有
  expectedDelta，根本不进 check_fields）。
  - live smoke 第 11 步必查。

  locked envelope（I3）不被污染

  - 成功信封形态完全不变（{ template, changed_count, changed_ids, truncated }）。
  - 失败信封 error.details.fields[] 形状与 Slice 06/07 相同；新增的 nullable 元信息不进失败
  details（details 只记录 {scope, field, expected, actual, ok}）。

  error-code constants 不退化

  - 失败路径仍走 errs.VERIFY_FAILED。
  - Slice 05 audit 已 grep reaper/packs/core/**/*.lua，verify.lua 在路径内；新增 null-coerce
  分支不引入字面量（不会写 code = "VERIFY_FAILED" 这类）。
  - npm run check:error-codes-fresh 必须保持 22 codes。

  REAPER bridge boot 必须 full quit/reopen

  - 本 slice 改 verify.lua check_fields 主路径。Slice 05+06 的 dofile 链在 bridge 启动时一次性加载；只
  Re-Run start_bridge.lua 在某些情况下旧 chunk 的 reaper.defer 还在用旧 check_fields。必须全退 REAPER 
  进程，重开，再 Load+Run。
  - 验证 generation = 1 且 console 含 loaded error_codes (22 codes)。

  回归覆盖必查项

  - Slice 06 的 4 happy envelope 字节稳定（item_pitch / item_move / item_rate / track_rename）。
  - Slice 07 的 item_trim 两个 happy envelope 字节稳定（长度单字段 + 长度 + start_offset）。
  - Slice 07 item_trim 的 optional 跳过路径仍工作（不传 start_offset → 第二条 skip）。
  - Slice 04 的结构 verify 失败仍优先于字段 verify（强制 expected_delta={count:1, creates:true} on
  item_fade 走结构失败，不进字段 verify）。
  - Slice 05 errs.* 接线不退化（item_fade selected:99 → ITEM_NOT_FOUND；region_create name:"a/b" →
  REGION_NAME_INVALID）。
  - Slice 02 get_state(tracks, include:["fx"]) 仍工作；get_state(render, include:["fx"]) 仍
  PARAMS_INVALID；get_state(render) 仍 SCOPE_NOT_IMPLEMENTED。
  - Slice 01 readonly scope 不污染 LAST_RESULT。
  - render_region 仍跳过任何 verify；changed_ids 仍是绝对路径。
  - Step 4c null round-trip 不退化：MCP 端不静默丢 fade_in:null；wire payload 内 params.fade_in === 
  null（与 Step 4c load-bearing 测试同口径）。

  ---
  8. IMPLEMENTATION SEQUENCE

  按依赖顺序（每步独立绿测后再走下一步）：

  1. TS schema 扩展 — /Users/Zhuanz/Documents/streetlight-reaper-mcp/packages/core/src/registry.ts
    - 加 nullable?: boolean 到 FieldCheckDescriptor。
    - 扩展 validateExpectedDeltaFields：boolean 类型校验 + all-optional 放宽规则。
    - 扩展 toMetadata：透传 nullable，缺省省略。
    - TDD：先在
  /Users/Zhuanz/Documents/streetlight-reaper-mcp/packages/core/src/__tests__/registry.test.ts 加 4
  个新测试（合法 / 非法 boolean / all-optional+all-nullable 接受 / all-optional 缺 nullable
  拒），再写实现。
  2. item_fade descriptor —
  /Users/Zhuanz/Documents/streetlight-reaper-mcp/packages/mcp-server/src/templates/item-fade.ts
    - 加 expectedDelta = { count:1, fields:[ {D_FADEINLEN, …, optional:true, nullable:true}, 
  {D_FADEOUTLEN, …, optional:true, nullable:true} ] }。
  3. wire 透传 —
  /Users/Zhuanz/Documents/streetlight-reaper-mcp/packages/mcp-server/src/tools/call-template.ts
    - toWireExpectedDelta 在 fields 映射里加 ...(field.nullable !== undefined ? { nullable: 
  field.nullable } : {})（与 Slice 07 optional 对称）。
    - 在 /Users/Zhuanz/Documents/streetlight-reaper-mcp/packages/mcp-server/src/tools/__tests__/call-temp
  late.test.ts 加 3 个测试（happy 数值、null round-trip 与 wire 稳定、空 params 仍合法）。
  4. list_templates 富化 — /Users/Zhuanz/Documents/streetlight-reaper-mcp/packages/mcp-server/src/tools/_
  _tests__/list-templates.test.ts
    - 加 2 个测试：item_fade metadata fields 两条均含 optional:true + nullable:true；其余 10 个模板（含
  item_trim）metadata 不含 nullable。
  5. 静态守护 — /Users/Zhuanz/Documents/streetlight-reaper-mcp/scripts/manifest-alignment.mjs +
  /Users/Zhuanz/Documents/streetlight-reaper-mcp/scripts/__tests__/manifest-alignment.test.mjs
    - 扩展规则 + 测试覆盖 3 条新规则（同 #1 TDD 集合）。
  6. Lua verify.lua 增强 — /Users/Zhuanz/Documents/streetlight-reaper-mcp/reaper/packs/core/verify.lua
    - 在 M.check_fields 的循环里加 null-coerce 分支（伪代码见 §5）。
    - 关键：通过 ctx.json.null 比较，不引入新 sentinel；不调 require/dofile 取 json 副本。
    - 不改 M.check、不动 FIELD_READERS、不动 streetlight_bridge.lua 调用顺序。
  7. lua-structure 守护 —
  /Users/Zhuanz/Documents/streetlight-reaper-mcp/scripts/__tests__/lua-structure.test.mjs
    - +2 grep 守护：
        - check_fields 含 nullable null-coerce 分支（grep nullable + json.null）。
      - bridge 调用顺序仍 check_counts → check_fields → finalize_template。
  8. 静态闸 — 见 §9 STATIC VERIFICATION。
  9. REAPER full quit/reopen → ReaScript: Load → Run — 验证 generation = 1 + loaded error_codes (22 
  codes) 行。
  10. Live smoke — 见 §10 LIVE SMOKE PLAN。
  11. Docs 同步 — HANDOFF / PROGRESS / TEMPLATE_SPEC / RESPONSE_BUDGET /
  KERNEL_HARDENING_{PLAN,EXECUTION} / 本 packet。

  ---
  9. STATIC VERIFICATION

  绝对路径命令（直接 copy 给 Codex）：

  cd /Users/Zhuanz/Documents/streetlight-reaper-mcp
  npm test
  npm run build
  npm run check:manifest
  npm run check:error-codes-fresh
  git -C /Users/Zhuanz/Documents/streetlight-reaper-mcp diff --check

  通过判据：

  - npm test → 基线 257 + 新增 11–14 之间（≈ 268–271）全绿；若 < 257 视为回归。
  - npm run build → 0 报错（pre-existing TS6310 噪声可忽略）。
  - npm run check:manifest → Streetlight manifest alignment ok (11 templates).
  - npm run check:error-codes-fresh → Streetlight error codes fresh (22 codes). + zero forbidden literal
  usage。
  - git diff --check → 无空白错误。

  ---
  10. LIVE SMOKE PLAN

  前置（必须）：用户完全退出 REAPER 进程（不只是关项目），重开 → Actions → Show action list → ReaScript:
  Load… → 选 start_bridge.lua → Run。console 必须有：

  [streetlight] loaded error_codes (22 codes)
  bridge ready (generation 1) — loaded error_codes (22 codes) — templates: …

  generation ≠ 1 或 22 codes 行缺失 → 不通过，回到前置。本 slice 改 verify.lua check_fields
  主路径，Re-Run 不够，必须 full quit/reopen。

  Smoke 步骤（保持 Slice 04/05/06/07 的"成功路径 + 故意 mismatch + 多 slice 回归"三轨）：

  1. S0 reachability：ping → bridge:connected，reaper_version=7.71/macOS-arm64。
  2. S1 list_templates：11 模板返回；断言：
    - item_fade metadata expectedDelta.fields[] 含 2 条，且两条都带 optional:true + nullable:true。
    - item_trim metadata 仍为 Slice 07 形态（2 条字段；第二条只带 optional:true，不含 nullable）。
    - 4 个 Slice 06 模板 metadata 字节稳定（不含 optional 或 nullable）。
    - 其余 5 个 + render_region 仍无 fields。
  3. S2 item_fade happy（fade_in 单字段）：在已有 item 上跑 item_fade fade_in:0.25，不传 fade_out →
  success envelope；REAPER 属性对话框 Fade in length = 0.250，Fade out length = 未动。verify 端
  D_FADEINLEN 验过；D_FADEOUTLEN 因 optional+absent 跳过。
  4. S3 item_fade happy（fade_in + fade_out 数值）：item_fade last_result:item:0 fade_in:0.1 fade_out:0.5
  → success envelope；属性对话框 Fade in length=0.100、Fade out length=0.500。verify 端两条均验过。
  5. S4 item_fade happy（fade_in:null 清场）：item_fade last_result:item:0 fade_in:null → success
  envelope；属性对话框 Fade in length = 0.000，Fade out length = 0.500（继承上一步）。verify 端
  D_FADEINLEN 因 nullable+null 取 expected=0 通过；D_FADEOUTLEN 因 absent 跳过。这一步是 Slice 08 
  的核心新行为验证。
  6. S5 item_fade happy（fade_in:null + fade_out:null 双清）：再调一次 item_fade last_result:item:0 
  fade_in:null fade_out:null → success envelope；属性对话框两个 fade 长度都 0。verify
  端两条都通过（expected=0）。
  7. S6 Slice 07 回归：item_trim length:1.0 不传 start_offset → success；属性对话框 Length=1.000、Start
  in source=（不动）。verify 端 D_LENGTH 验过；D_STARTOFFS 因 optional+absent 跳过。item_trim 不能因 
  Slice 08 漂移。
  8. S7 Slice 06 happy 回归：抽 1–2 个 Slice 06 模板（如 item_pitch semitones:-3），确认 envelope
  字节稳定。
  9. S8 字段 mismatch 强制路径（raw queue）：直接往 queue 投 item_fade fade_in:0.25，但
  expected_delta.fields[0].field 改成不存在的 attr（如 D_FADEINLENX），handler 仍正常写
  D_FADEINLEN=0.25。结果应为：bridge 读 D_FADEINLENX 失败 → fields verify 失败 → VERIFY_FAILED,
  recoverable:false，details.fields[0].ok=false，message 含 Slice 04 恢复短语字面量。
  10. S9 LAST_RESULT 未污染验证：紧接 S8，发 item_pitch last_result:item:0 
  semitones:0，应仍指向上一个成功 mutation 的 item GUID（即 S5/S6/S7 任一成功 mutation 的 item），不指向
  S8 的 raw item_fade。
  11. S10 null 不带 nullable 必失败（raw queue）：raw 发 item_fade fade_in:null，但在 wire
  expected_delta.fields[0] 上人为去掉 nullable:true（保留 optional:true）。结果应为：bridge 读
  actual=0；expected 取值阶段判定为 mismatch（"null but field doesn't declare nullable"）→
  VERIFY_FAILED，details.fields[0].ok=false。这一步守护 nullable 必须显式声明。
  12. S11 optional skip 路径（raw queue）：raw 发 item_fade fade_in:0.1 但人为把 wire params.fade_in
  整个去掉（即仅传 fade_out 但 wire 里只剩 expected_delta.fields[] 两条 + 空 params）→ bridge 内部
  params.fade_in == nil + field.optional == true ⇒ 第一条 skip；第二条因 params.fade_out 也 nil 同样
  skip；整体 envelope = success（handler 也是 no-op）。验证 optional 跳过逻辑不被 nullable 影响。
  13. S12 结构 mismatch 仍优先（Slice 04 回归）：raw 发 item_fade fade_in:0.25 + expected_delta={count:1,
  creates:true, fields:[…]} → 结构 verify 失败优先返回，details 不含 fields。
  14. S13 error-code constants 回归：item_fade selected:99 → ITEM_NOT_FOUND；region_create name:"a/b" →
  REGION_NAME_INVALID。
  15. S14 get_state include 回归：get_state(tracks, include:["fx"]) 仍 OK；get_state(render, 
  include:["fx"]) 仍 PARAMS_INVALID；get_state(render) 仍 SCOPE_NOT_IMPLEMENTED。
  16. S15 render_region carve-out：render_region happy 路径仍工作，仍跳过 verify，仍只返绝对路径。临时
  render dir 用后必须删干净。

  清理：smoke 中创建的 track / item / region 留在 REAPER 项目里由用户手动 Cmd+Z / 删除（沿用 Slice
  04/05/06/07 惯例）；任何临时 render dir 必须删干净。

  通过判据：S0–S15 全绿，且：

  - item_fade 所有 happy envelope（数值、null 单清、null 双清、optional skip）与 Slice 06/07
  之前字节同构（仅 template 名不同）。
  - S4 / S5 的 null-coerce 路径确实进入 verify 且 expected=0 验过——这是 Slice 08 核心断言。
  - S8 details 含 fields[0]，结构与本 packet §5 一致。
  - S10 null+missing-nullable mismatch 返回 VERIFY_FAILED——这是 nullable 必须显式声明的守护。
  - S11 optional skip 路径 envelope 是 success，未走 VERIFY_FAILED。
  - S12 details 不含 fields（向后兼容验证）。
  - S13/S14/S15 wire code 与 Slice 07 之前完全一致。
  - 任何 path 退化为 INTERNAL_ERROR / 错误码字面量泄漏 → 不通过，回滚迁移并复盘。

  ---
  给用户的拍板请求
  
  请就 D1–D5 拍板（推荐 (a)/(a)/(a)/(a)/(a)），其余按本 packet 推进。Codex 执行；reviewer 只读复核；smoke
  通过后由你决定是否 commit——本 packet 不替你 commit、不 push、不 reset、不 branch。

  最关键的两个决策点：

  - D1：是否同时拆 D5。我推荐 不，先把 item_fade 的 null 语义单独验证完毕；Slice 09 再统一拆 D5 收 4 个
  creates-类模板。两件事同切片做，故障定位贵。
  - D2/D4：nullable 语义和 all-optional 规则。我推荐 hardcode null → 0（item_fade 唯一用例）+
  all-optional 必须 all-nullable（保留暗坑防护）。

  若想换方向：

  - H4 idempotency token：请先告知"逻辑操作 = ?"、key 生命周期、timeout / BRIDGE_NOT_RUNNING
  命中回放语义这三处决策，我会替换为 H4 packet（决策成本显著更高）。
  - 直接拆 D5 收 creates-类模板：可以，但建议先做 item_fade 把 null 语义打底；如果你坚持先拆 D5，我会重写
  packet 改收 track_create（最稳的 creates 模板，maybeCreates 路径已被 Slice 04 验过）。
  - H6 scaffold：仍建议至少先把 H2 字段 verify 推到 ≥9/11 模板再启动（当前 6/11 即将达成）；早做会让
  scaffold 吐出半残的 verify 钩子。
  - H3 cursor / 新 scope / H7 socket：v0.2 / 纯性能，与 Slice 08 不冲突；只要不动 5 工具面 /
  信封形态（I1/I3）可以另起 packet 并行。