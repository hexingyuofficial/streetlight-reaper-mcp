 请基于 /Users/Zhuanz/Documents/streetlight-reaper-mcp 当前 main 最新状态制定
  Slice 11 Architect Plan Packet。

  当前状态：
  - Slice 10 已 commit + push：2babc5c kernel-hardening: slice 10 track-create
  field checks
  - main...origin/main clean and synced
  - Slice 10 已完成：track_create 作为 first maybeCreates:true +
  expectedDelta.fields[] template，验证 track P_NAME <- params.name
  - Static gates：npm test 278/278，npm run build clean，check:manifest
  ok，check:error-codes-fresh ok，git diff --check clean
  - Live smoke S0-S17 已绿：create path / reuse path / VERIFY_FAILED no
  LAST_RESULT pollution / Slice 06-09 regressions / get_state / render_region
  carve-out

  请先读：
  /Users/Zhuanz/Documents/streetlight-reaper-mcp/docs/HANDOFF.md
  /Users/Zhuanz/Documents/streetlight-reaper-mcp/docs/PROGRESS.md
  /Users/Zhuanz/Documents/streetlight-reaper-mcp/docs/plans/KERNEL_HARDENING_PL
  AN.md
  /Users/Zhuanz/Documents/streetlight-reaper-mcp/docs/plans/KERNEL_HARDENING_EX
  ECUTION.md
  /Users/Zhuanz/Documents/streetlight-reaper-mcp/docs/plans/SLICE_10_ARCHITECT_
  PLAN.md

  请只做计划，不写代码、不 commit、不 push、不 reset。
  目标：给出下一刀 Slice 11 的 Architect Plan Packet。优先评估 H2
  剩余边界，尤其 media_import / count:"any" 的 expectedDelta.fields[]
  是否该作为 Slice 11。请列出 scope、non-goals、files likely to
  change、contract/schema changes、用户需要拍板的 decisions、risks/regression
  notes、static tests、REAPER live smoke recipe。

  Read 5 files (ctrl+o to expand)

⏺ 我已经把 HANDOFF、PROGRESS、KERNEL_HARDENING_PLAN/EXECUTION、以及 Slice 10
  packet 全部读完。下面是 Slice 11 Architect Plan
  Packet（计划纯文本，不写代码、不 commit、不 push、不 reset）。

  ---
  Slice 11 Architect Plan Packet — media_import count:"any" first-item field
  verification

  ▎ 工作流约束（先确认）：本 packet 仅做计划——不写代码、不 commit、不 push、不
  reset、不 branch。所有路径用绝对路径。本 slice 改
  packages/core/src/registry.ts 的静态校验、不动 reaper/packs/core/verify.lua 的
  check_fields 主路径（与 Slice 09 / 10 同口径，新增一条 descriptor
  的合法形态）。wire 上首次出现 creates:true + count:"any" + fields[] 同时出现的
  payload，所以 live smoke 仍必须 full quit/reopen REAPER，重新 Run
  start_bridge.lua（generation 必须 = 1）。

  ---
  候选排序（高 → 低）

  A. media_import（creates:true, count:"any", item scope, GUID-shaped
  changed_ids，first-item verify）⭐ 推荐

  - H2 覆盖 8/11 → 9/11；剩 3
  个未纳入：media_import、region_create、render_region（carve-out）。
  - 在剩下两个 creates 类候选里 media_import 与 Slice 09 item_duplicate
  同形最深：
    - 同 GUID-shaped changed_ids（guid:{...}）。
    - 同 FIELD_READERS["item"]（Slice 09 已落定 find_item_by_guid +
  read_item_field 处理 D_POSITION）。
    - 同数值字段 + tolerance 1e-6（与 Slice 09 完全一致）。
    - verify.lua 主路径零代码改动——check_fields 已经只读
  changed_ids[1]，"first-item verify" 是它的天然语义。
  - 唯一新轴：D5 从 "fields + creates:true + 数值 count" 放宽到 "fields +
  creates:true + count:'any'"，并显式锁定 "count:'any' 下 fields[] 验证 only
  changed_ids[1]"（first-item verify）作为契约。这是本 slice
  必须独立验证的核心问题。
  - 收益：H2 覆盖 8/11 → 9/11；把 "D5 三大边界（creates+数值 / maybeCreates+数值
  / creates+any）" 最后一条用最小风险面验完；区域 scope 完全留给独立 packet。

  B. region_create（creates:true, count:1, 但 region scope + region:NAME 形
  changed_ids + 新 FIELD_READER）

  - 同时引入三个新轴：
    a. verify.lua 新增 parse_region_ref(changed_ids[1])（regex
  ^region:(.+)$，不是 guid:{...}）。
    b. FIELD_READERS["region"] 新增（resolve 走 EnumProjectMarkers3 按 name 找
  region；read 走 region 的 pos / rgnend / name 字段——region 没有原生
  handle，需要 synthetic struct）。
    c. FIELD_CHECK_SCOPES 从 {take, item, track} 扩到 {take, item, track,
  region}。
  - 故障定位贵；建议作为"region scope 扩展"独立 packet（Slice 12+）。

  C. media_import + region_create 一刀切

  - 不推荐——同时引入 D5 + region scope + region readers 三件大事，违反"每 slice
  一新轴"的节奏（Slice 06–10 都是单轴增量）。

  D. 不再扩 H2，转 H4 / H6 / H7

  - H4 idempotency 三处产品决策（key 由谁出 / 生命周期 / 回放语义）独立 packet。
  - H6 scaffold 至少要 H2 覆盖 ≥9/11；Slice 11 推到 9/11 后才到门槛。
  - H7 socket 纯性能，不解锁护城河。
  - 建议在 H2 收完 9/11 之后再评估 H6 是否启动。

  结论：Slice 11 = media_import 字段 verify + D5 放宽到 "creates:true +
  count:'any' only, first-item verify"。 这是把 D5 三大边界拆开的第三刀（第一刀
  Slice 09 = creates+数值；第二刀 Slice 10 = maybeCreates+数值；第三刀 Slice 11
  = creates+"any" first-item）。把 "count:'any' 下 first-item verify
  的契约语义"作为本 slice 的核心验证目标。

  ---
  1. GOAL

  把 H2 字段 verify 从 8 个模板扩到 9 个，新纳入 media_import，首次允许
  expectedDelta.fields[] 与 creates:true + count:"any" 共存，仍用最小放宽面：

  - Slice 09 D5：fields[] 可与 creates:true 共存当且仅当 count 是数值 >= 1。
  - Slice 10 D5：fields[] 可与 maybeCreates:true 共存当且仅当 count 是数值 >=
  1。
  - Slice 11 D5：fields[] 可与 creates:true + count:"any" 共存；此时 verify
  语义锁定为 "first-item verify only"（仅验证 changed_ids[1]）。
    - 仍禁止 fields[] 与 deletes:true 共存（v0.1 无 deletes 模板，规则保留）。
    - 仍禁止 fields[] 与 maybeCreates:true +
  count:"any"（结构上不可达——maybeCreates 自身 Slice 04 起强制数值 count）。
    - 仍禁止 field scope "region"（FIELD_CHECK_SCOPES 不增；region_create 留
  Slice 12+）。

  media_import 落地一条字段 check：

  ┌───────────┬──────┬──────────┬──────────────┬────────┬────────┬─────────┐
  │   模板    │ scop │  field   │  param 推导  │ option │ nullab │ toleran │
  │           │  e   │          │              │   al   │   le   │   ce    │
  ├───────────┼──────┼──────────┼──────────────┼────────┼────────┼─────────┤
  │ media_imp │ item │ D_POSITI │ params.posit │ (none) │ (none) │ 1e-6    │
  │ ort       │      │ ON       │ ion          │        │        │         │
  └───────────┴──────┴──────────┴──────────────┴────────┴────────┴─────────┘

  bridge 端零代码改动。verify.check_fields 主路径与 Slice 09 item_duplicate
  字节同形：

  1. parse_guid_ref(changed_ids[1]) → GUID 字符串。
  2. FIELD_READERS["item"].resolve = find_item_by_guid(guid) → 线性扫描定位首项
  inserted item。
  3. read_item_field(handle, "D_POSITION") → GetMediaItemInfo_Value(handle,
  "D_POSITION")。
  4. 与 params["position"] 数值比较，tolerance 1e-6。

  H2 覆盖率：8/11 → 9/11。

  ---
  2. NON-GOALS

  - 不动 5 工具面（I1）。
  - 不动 call_template 成功信封（I3）：失败信封仅在 error.details.fields[]
  上扩张（保留 Slice 06/07/08/09/10 形状）。
  - 不引入新错误码、不重命名、不动 errs.* 接线（Slice 05 不变）。
  - 不放开 fields[] + deletes:true（v0.1 无 deletes 模板）。
  - 不放开 region scope 的 field check（region_create 留 Slice 12+；不动
  FIELD_CHECK_SCOPES、不动 FIELD_READERS、不动 verify.lua 的 parse_guid_ref）。
  - 不动 verify.lua 的 check_fields 主路径函数体（不引入"all-items
  verify"或"per-item fields"分支）。
  - 不动 streetlight_bridge.lua 的调用顺序：check_counts → check_fields →
  finalize_template。
  - 不动 render_region（继续 Slice 04 起的 carve-out：无 expectedDelta、跳过任何
  verify）。
  - 不动 LAST_RESULT 桶结构、entity_buckets、refs.lua。
  - 不动 get_state schema / include / fields / cursor。
  - 不动 media.lua handler 本体（selection save/restore + InsertMedia + 选区
  diff 求新 item GUIDs 已落定）。
  - 不动 9 个 Slice 06–10 已覆盖模板的 expectedDelta（item_pitch / item_move /
  item_rate / track_rename / item_trim / item_fade / item_duplicate /
  track_create）（注：track_rename Slice 06；track_create Slice 10；media_import
  是本 slice 新收）。
  - 不引入"all-items verify"或"per-item fields"语义（留 Slice
  13+，需独立产品决策）。media_import insertmode 影响 position 行为时（若 v0.2
  加 insertmode），需重评 D4。
  - 不做 H4 idempotency token、H6 scaffold、H7 socket。
  - 不动 recipes/、scripts/setup.mjs、install.*、setup-out/。
  - 不动 docs/CROSS_MAC_SMOKE.md、docs/ARCHITECTURE.md 等非内核硬化文档。

  ---
  3. USER-FACING BEHAVIOR

  - Slice 06 的 4 happy envelope + Slice 07 item_trim 2 + Slice 08 item_fade 4 +
  Slice 09 item_duplicate 2 + Slice 10 track_create 2 happy envelope
  逐字节不变。
  - media_import happy envelope 逐字节不变（仍是锁定 { template, changed_count,
  changed_ids, truncated }，N>=1 个 guid:{...} 在 changed_ids 里，changed_count
  仍是真实数）。
  - 新增 wire / 语义只在四类路径上可见：

    - a. list_templates metadata：media_import.expectedDelta.fields[] 含 1 条
  {scope:"item", field:"D_POSITION", paramPath:"position", tolerance:1e-6}；不含
  optional、不含 nullable。其他 10 个模板 metadata 字节稳定。
    - b. "First-item verify" 语义：media_import 在 handler 成功后由 bridge 重读
  首个新 item 的 D_POSITION，与 params.position 比对（数值，tolerance 1e-6）。单
  item 路径（最常见）= 完全 verify；多 item 路径（多 stem / CD 等少见情况）= 仅
  first item verify，后续 items 不校验。这条契约写进 docs/TEMPLATE_SPEC.md 的
  "Fields on count:'any' templates (Slice 11)" 子节，明示"first-item verify is
  proof-of-life under count:'any', not strong assertion for N>1"。差异 →
  VERIFY_FAILED + recoverable:false + details.fields[] + LAST_RESULT.items
  不更新。
    - c. 静态校验更严：尝试给 media_import 之外的 creates:true + count:"any"
  模板加 fields[]（v0.1 暂无第二个 count:"any" 模板，规则前置）走 D5
  放宽路径；尝试给 region_create 之类的 region scope 字段加 fields[] 仍会在
  registry / manifest CLI 上注册时报错（FIELD_CHECK_SCOPES 仍是 {take, item,
  track}）。
    - d. wire 首次同时出现 creates:true + count:"any" + fields[]：call_template
  media_import 的 wire payload 现在含 expected_delta:{count:"any", creates:true,
  fields:[{scope:"item", field:"D_POSITION", param_path:"position",
  tolerance:1e-6}]}。这是 Slice 11 唯一的 wire diff，针对单个模板，预期出现。
  - read-only 路径（ping / get_state / list_templates / list_recipes）继续不触碰
  LAST_RESULT（I7）。

  ---
  4. FILES LIKELY TO CHANGE

  TypeScript（写）

  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/packages/core/src/registry.ts
    - validateExpectedDeltaFields 修订（见 §5 伪代码）：把 Slice 10 的 "fields +
  (maybeCreates OR creates) → 必须 numeric count >= 1" 分流为：
        - expectedDelta.deletes === true → 仍拒。
      - expectedDelta.maybeCreates === true → 仍要求 numeric count >=
  1（实际上由 Slice 04 起强制；这里再断言一次保险）。
      - expectedDelta.creates === true → 接受 count === "any" 或 numeric count
  >= 1。
    - 其他规则（duplicate (scope,field)、负 tolerance、dotted paramPath、boolean
  optional、boolean nullable、all-optional iff all-nullable、FIELD_CHECK_SCOPES
  = {"take","item","track"}）一律不动。
    - toMetadata / ExpectedDelta type 形态不变。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/packages/mcp-server/src/templ
  ates/media-import.ts
    - descriptor 加 expectedDelta = { count: "any", creates: true, fields: [{
  scope: "item", field: "D_POSITION", paramPath: "position", tolerance: 1e-6 }]
  }。
    - 现有 expectedDelta = { count: "any", creates: true } 直接扩展为带 fields
  形态。
    - 在 expectedDelta 上方加一行注释：// Slice 11: count:"any" semantic =
  first-item verify (changed_ids[1] only); multi-item paths only have first item
  validated. See TEMPLATE_SPEC.md.
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/packages/mcp-server/src/tools
  /call-template.ts
    - 不改。toWireExpectedDelta 已在 Slice 06/07/08/09 把 fields[] 透传含
  optional/nullable/tolerance/param_path；本 slice 不引入新字段。

  Lua（不写）

  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/reaper/packs/core/verify.lua
  — 不改。
    - FIELD_READERS["item"] 已经在 Slice 09 落定（find_item_by_guid +
  read_item_field 处理 D_POSITION）。
    - parse_guid_ref 已经按 ^guid:(%b{})$ 匹配 item GUID（与 track GUID 同形）。
    - check_fields 已经只读 changed_ids[1]——天然就是"first-item
  verify"语义；Slice 11 只是让 media_import 复用同一条路径。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/reaper/streetlight_bridge.lua
  — 不改。调用顺序、字段 verify 入参（含 ctx）、details 形状都不变。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/reaper/packs/core/templates/m
  edia.lua — 不改。media_import handler 在 success 路径返回 { changed_ids = {
  "guid:{...}", ... } }（N>=1 个 GUID，selection-diff 顺序）；首项即首插入
  item，与 verify pipeline 已对齐。
  - manifest.lua / refs.lua / undo.lua / error_codes.lua / lib/*.lua — 不改。

  Scripts（写）

  -
  /Users/Zhuanz/Documents/streetlight-reaper-mcp/scripts/manifest-alignment.mjs
    - 静态规则与 registry.ts 同口径修订（见 §5）。
    - "fields cannot coexist with deletes" 仍保留。
    - "fields + maybeCreates → 必须 numeric count >= 1" 仍保留。
    - "fields + creates → 数值 count OR count:'any'" 放宽。

  Tests（写）

  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/packages/core/src/__tests__/r
  egistry.test.ts
    - +6 测试：
        - 合法：creates:true + count:"any" + fields:[...]（接受）。
      - 合法：creates:true + count:"any" + fields:[{scope:"item",field:"D_POSITI
  ON",paramPath:"position",tolerance:1e-6}]（接受，with tolerance）。
      - 非法：maybeCreates:true + count:"any" + fields:[...]（拒；由
  maybeCreates 自身的 numeric-count 规则承担——本测试守护拒绝消息不变）。
      - 非法：deletes:true + fields:[...]（仍拒，规则保留）。
      - 非法：creates:true + count:0 + fields:[...]（拒——count 必须 >= 1 OR
  "any"；Slice 11 boundary）。
      - 合法回归：creates:true + count:1 + fields:[...]（Slice 09 行为不退化）。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/packages/mcp-server/src/tools
  /__tests__/call-template.test.ts
    - +2 测试：
        - media_import path:"/x" track_id:"selected:0" position:0 → wire
  expected_delta 含 count:"any", creates:true, fields:[{scope:"item",
  field:"D_POSITION", param_path:"position", tolerance:1e-6}]。
      - media_import 不会在 fields 上夹带 optional / nullable（descriptor 没声明
  → wire 必然没有）。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/packages/mcp-server/src/tools
  /__tests__/list-templates.test.ts
    - +3 测试：
        - media_import metadata expectedDelta.fields[] 含 1 条 {scope:"item",
  field:"D_POSITION", paramPath:"position", tolerance:1e-6}；不含
  optional/nullable。
      - 其他 10 个模板 metadata 字节稳定（含 8 个已纳入 fields：4 个 Slice 06
  in-place + item_trim + item_fade + item_duplicate + track_create；其余 2 个
  expectedDelta 无 fields：region_create、render_region；其中 render_region 无
  expectedDelta）。
      - 断言：region_create.expectedDelta = {count:1, creates:true} 仍无
  fields（Slice 12+ 才放）；render_region 仍无 expectedDelta（永久 carve-out）。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/scripts/__tests__/manifest-al
  ignment.test.mjs
    - +4 测试：与 registry tests 同口径覆盖（合法 creates+any+fields；合法
  creates+1+fields 不退化；非法 maybeCreates+any+fields 走原 numeric-count
  规则；非法 deletes+fields 保留）。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/scripts/__tests__/lua-structu
  re.test.mjs
    - +2 测试：
        - grep 守护 verify.lua 仍未引入 parse_region_ref / scope = "region" /
  region FIELD_READER（防本 slice 漂出 scope 扩展；region 留 Slice 12+）。强化
  Slice 09/10 已有的同形 grep，明确归属 Slice 11 守护点。
      - grep 守护 verify.lua 仍未引入 "all-items verify" / "per-item fields"
  循环（防本 slice 漂出 multi-item semantic 扩展；留 Slice 13+）。

  Docs（写）

  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/docs/plans/SLICE_11_ARCHITECT
  _PLAN.md — 本 packet 落盘（建议格式与 Slice 10 packet 一致）。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/docs/HANDOFF.md — live edge
  切到 Slice 11；Slice 10 decisions 保留；append Slice 11 decisions（D1–D6 见
  §6）；明确 "D5 三大边界（creates+数值 / maybeCreates+数值 /
  creates+any）已全部放开"、region scope 仍未放开。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/docs/PROGRESS.md — Slice 11
  段（scope / what changed / verification baseline 占位 / live smoke evidence
  占位）。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/docs/TEMPLATE_SPEC.md —
  "Fields on maybeCreates templates (Slice 10)" 子节后追加 "Fields on
  count:'any' templates (Slice 11)"，明示：
    - fields[] 可与 creates:true + count:"any" 共存。
    - first-item verify 契约：count:"any" 下 fields[] 仅验证
  changed_ids[1]，后续 items 不校验。对 N==1 = 完全 verify；对 N>1 = pipeline
  proof-of-life，不是强断言。
    - 明示 region scope 仍未放开。
    - 明示 "fields + deletes" 仍拒。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/docs/RESPONSE_BUDGET.md —
  VERIFY_FAILED details 段追加：media_import 单字段失败时 details.fields[] ≤ 256
  字节增量（与 Slice 06–10 同口径）。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/docs/plans/KERNEL_HARDENING_P
  LAN.md § H2 — 注："Slice 11 把字段 verify 扩到 media_import，第三次放宽 D5 让
  creates:true + count:"any" 与 fields[] 共存；多 item 路径下 verify 仅覆盖
  changed_ids[1]（first-item verify），契约写进
  TEMPLATE_SPEC.md。region_create（region scope）留 Slice 12+。"
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/docs/plans/KERNEL_HARDENING_E
  XECUTION.md § H2 + §0.2 重载协议 — 追加："Slice 11 不改 verify.lua 主路径，但
  wire 首次出现 creates:true + count:'any' + fields[] 同时出现的 payload。建议
  full quit/reopen REAPER 以确保旧 chunk 的 manifest 上 media_import 没有 fields
  不会与新 chunk 抢命令。"

  Files NOT touched（明确禁碰）

  - packages/core/src/errors.ts / result.ts / risk.ts / types.ts / refs.ts /
  queue.ts
  - packages/mcp-server/src/transport/file-queue.ts
  - packages/mcp-server/src/index.ts / tools/{get-state,list-recipes,ping}.ts
  - packages/mcp-server/src/templates/*.ts（除 media-import.ts 外的 10 个 TS
  模板）
  - reaper/streetlight_bridge.lua
  - reaper/packs/core/{manifest,refs,undo,error_codes,verify}.lua、templates/*.l
  ua（含 templates/media.lua）、lib/*.lua
  - scripts/error-codes.mjs / setup.mjs / install.* / setup-out/ /
  recipes/*.yaml
  - render_region、region_create 模板（继续 carve-out / deferred）

  ---
  5. CONTRACT / SCHEMA / ERROR-CODE CHANGES

  TS — validateExpectedDeltaFields 修订（向后兼容扩展）

  // 当前（Slice 10）：
  if (expectedDelta.deletes) {
    throw new Error(`Capability ${name} expectedDelta.fields cannot coexist with
  deletes`);
  }
  if (expectedDelta.maybeCreates || expectedDelta.creates) {
    if (
      typeof expectedDelta.count !== "number" ||
      !Number.isFinite(expectedDelta.count) ||
      Math.floor(expectedDelta.count) !== expectedDelta.count ||
      expectedDelta.count < 1
    ) {
      const mode = expectedDelta.creates ? "creates:true" : "maybeCreates:true";
      throw new Error(
        `Capability ${name} expectedDelta.fields with ${mode} requires numeric
  count >= 1`,
      );
    }
  }

  // Slice 11：
  if (expectedDelta.deletes) {
    throw new Error(`Capability ${name} expectedDelta.fields cannot coexist with
  deletes`);
  }
  if (expectedDelta.maybeCreates) {
    // maybeCreates 仍要求 numeric count >= 1（由 Slice 04 起强制 +
  本断言保险）。
    if (
      typeof expectedDelta.count !== "number" ||
      !Number.isFinite(expectedDelta.count) ||
      Math.floor(expectedDelta.count) !== expectedDelta.count ||
      expectedDelta.count < 1
    ) {
      throw new Error(
        `Capability ${name} expectedDelta.fields with maybeCreates:true requires
  numeric count >= 1`,
      );
    }
  }
  if (expectedDelta.creates) {
    // creates 接受 count:"any" OR numeric count >= 1。
    if (expectedDelta.count === "any") {
      // 合法：first-item verify under count:"any"
    } else if (
      typeof expectedDelta.count === "number" &&
      Number.isFinite(expectedDelta.count) &&
      Math.floor(expectedDelta.count) === expectedDelta.count &&
      expectedDelta.count >= 1
    ) {
      // 合法：full-item verify under numeric count
    } else {
      throw new Error(
        `Capability ${name} expectedDelta.fields with creates:true requires
  count "any" or numeric >= 1`,
      );
    }
  }
  // 其余规则（FIELD_CHECK_SCOPES / duplicate / tolerance / optional / nullable
  /
  // all-optional iff all-nullable）原样保留。

  Descriptor — media-import.ts 改动

  // 之前（Slice 04）：
  expectedDelta: { count: "any", creates: true },

  // Slice 11：
  expectedDelta: {
    count: "any",
    creates: true,
    // Slice 11: count:"any" semantic = first-item verify (changed_ids[1] only);
    // multi-item paths only have first item validated. See TEMPLATE_SPEC.md.
    fields: [
      { scope: "item", field: "D_POSITION", paramPath: "position", tolerance:
  1e-6 },
    ],
  },

  Wire 协议（snake_case，字面同名）

  jsonc
  "expected_delta": {
    "count": "any",
    "creates": true,
    "fields": [
      { "field": "D_POSITION", "scope": "item", "param_path": "position",
  "tolerance": 1e-6 }
    ]
  }

  Slice 06–10 的 param_path / tolerance / optional / nullable 字段语义不变。本
  slice 不引入新字段。

  Lua check_fields 行为差异：零

  Slice 11 的 media_import 走的就是 Slice 09 已落定的 item_duplicate 的字段
  verify 路径——parse_guid_ref(changed_ids[1]) → find_item_by_guid(guid) →
  read_item_field(handle, "D_POSITION") → 与 params.position 数值比较，tolerance
  1e-6。多 item 路径下 changed_ids[2..N] 不参与 verify（这是天然 "first-item
  verify"，不是 bug，是契约）。

  VERIFY_FAILED 错误码：不动

  details.fields[] 形状不动；单 field 增量 ≤ 256 字节。

  list_templates 元数据

  media_import.expectedDelta.fields[0] 含 {scope, field, paramPath,
  tolerance}；不含 optional、不含 nullable。

  ---
  6. DECISIONS FOR USER

  #: D1
  决策项: Slice 11 收哪个 creates 类模板？
  选项: (a) media_import（creates+"any"+item scope+GUID-shaped
    changed_ids，verify.lua 主路径零修改）；(b) region_create（叠加 region scope

    + region:NAME 形 changed_ids + region FIELD_READER 三个新轴）；(c)
    都不收，直接 H4/H6/H7
  推荐: (a) — 唯一一个不引入 region scope 的剩余创造类模板；把"放 D5 到
    count:'any'"独立验证
  ────────────────────────────────────────
  #: D2
  决策项: D5 放宽到 creates:true + count:"any" 时，verify 的多 item 语义如何定？
  选项: (a) first-item verify：仅验 changed_ids[1]，verify.lua
    零改动，文档锁定语义为 "pipeline proof-of-life for N>1"；(b) all-items
    uniform verify：对每个 changed_ids[i] 重复 field reader，验同一 expected
    值，verify.lua 需加循环；(c) per-item fields：descriptor 增 perItem
    标记，每个 item 一组 fields——v0.1 过复杂
  推荐: (a) — 单轴更安全；verify.lua 零改动；N==1（最常见）= 完全 verify；N>1 =
    proof-of-life。all-items / per-item 留 Slice 13+ 独立产品决策
  ────────────────────────────────────────
  #: D3
  决策项: media_import 在 Slice 11 验哪些字段？
  选项: (a) 仅 item D_POSITION ← params.position（item scope，1 条，verify.lua
    主路径零修改）；(b) 加 take source 文件名验证（需新 take reader）；(c) 加
    item 所在 track GUID 等于 params.track_id 解析后的 GUID（需新 cross-scope
    reader）
  推荐: (a) — D_POSITION 是 params 直接驱动、单 scope、与 Slice 09
  item_duplicate
    主路径字节一致；其他字段都引入新轴，应作为独立 packet
  ────────────────────────────────────────
  #: D4
  决策项: "first-item verify" 契约写在哪？
  选项: (a) TEMPLATE_SPEC.md 新子节 "Fields on count:'any' templates (Slice
    11)"（推荐）+ 在 media-import.ts descriptor 上方注释引用；(b) 仅在
    PROGRESS.md 记录，不入正式 spec；(c) 在 verify.lua 内部注释，TS 端不暴露
  推荐: (a) — 契约必须出现在 agent-facing 的 TEMPLATE_SPEC.md，让 agent 知道 N>1

    时 verify 不全。源码注释 + 文档双重锁定
  ────────────────────────────────────────
  #: D5
  决策项: D_POSITION 字段比较的 tolerance？
  选项: (a) 1e-6（与 Slice 09 item_duplicate 同口径，浮点位置）；(b)
    0（严格等于，会被 REAPER 内部 float 精度坑）
  推荐: (a) — D_POSITION 是 double，REAPER 内部有 64-bit IEEE 754
    round-trip，1e-6 是安全 epsilon
  ────────────────────────────────────────
  #: D6
  决策项: "creates + VERIFY_FAILED 留 N 个 orphan items" 副作用，文档与 smoke
    如何覆盖？
  选项: (a) 明确记录 N>=1 个 orphan items 语义（推荐）：media_import handler 已
    InsertMedia 完毕，N>=1 个 item 已落在 track 上；verify 在 finalize
    之前失败，LAST_RESULT 不更新——N 个 orphan items 留在 REAPER 项目里。在
    PROGRESS / TEMPLATE_SPEC 显式记录；live smoke 各验一次（N=1 forced mismatch
  +
     可选 N>1 forced mismatch）。(b) 不区分记录，仅当 creates 类共有副作用处理
  推荐: (a) — media_import 是 Slice 09–11 三个 creates 类模板中唯一可能产生 N>1
    orphan 的；契约要写明

  ---
  7. RISKS & REGRESSION NOTES

  D5 放宽到 count:"any" 的滑坡风险（Slice 11 最大策略点）

  - 放宽 fields[] + creates:true + count:"any"
  之后，剩余两条仍互斥的边界（deletes / region
  scope）必须仍由静态校验守住，否则后续 PR 把 fields 塞到 region_create 上 →
  verify.check_fields 会爆 parse_guid_ref(changed_ids[1]) 在 region:NAME
  上不匹配 → INTERNAL_ERROR 或 silent skip。
  - 缓解：
    - FIELD_CHECK_SCOPES 静态拦住 region scope。
    - scripts/__tests__/manifest-alignment.test.mjs 与
  packages/core/src/__tests__/registry.test.ts 双重覆盖。
    - HANDOFF + KERNEL_HARDENING_PLAN 把"已放开 /
  仍互斥"的组合矩阵列清楚（更新组合矩阵：creates+数值 ✅ / maybeCreates+数值 ✅
  / creates+"any" ✅ / deletes ✗ / region scope ✗）。
    - lua-structure.test.mjs grep 守护 verify.lua 未漂出 region 扩展或
  multi-item verify 循环。

  "First-item verify" 契约的可读性风险

  - N>1 的多 item 路径下，verify 只覆盖首项——agent 可能误读为"verify 在
  count:'any' 路径下确实验证了全部新建实体"。它没有——它只验证了首项 + 整体 GUID
  解析与字段读取 pipeline 仍在工作。
  - 风险：未来读者可能在多 stem 媒体（rare）下误判 "verify 通过 = N 项都对"。
  - 缓解：
    - D2 决策 (a) 选择 "first-item verify"，把契约写进 docs/TEMPLATE_SPEC.md 的
  "Fields on count:'any' templates" 子节，明确语义。
    - 在 media-import.ts descriptor 上方注释引用 TEMPLATE_SPEC.md。
    - live smoke S6 / S8 显式触发 raw-queue 故意 mismatch 来证明 mismatch
  路径仍工作（用 field:"D_POSITIONX" 让 GetMediaItemInfo_Value 返回 0 /
  不匹配）。
    - live smoke 若条件允许，加一个 N>1 路径测试（multi-take WAV
  罕见；若没条件就在 PROGRESS 标 "N>1 path coverage deferred to manual test"，与
  Slice 10 同口径）。

  changed_ids[1] 在 count:"any" 下的"首项"歧义

  - media_import handler 用 selection-diff 求新 item GUIDs；REAPER InsertMedia
  的 selection 顺序在不同 insertmode 下可能不同（v0.1 hardcoded mode
  应该确定，但 v0.2 加 insertmode 后可能变）。
  - 风险：v0.2 引入 insertmode 后，changed_ids[1] 不一定是 "the first inserted
  item by position"——可能是 "the last inserted by some REAPER internal
  ordering"，导致 D_POSITION ← params.position verify 失败。
  - 缓解：
    - HANDOFF 注明：media_import 升级 insertmode 时需重评 D2/D3/D4。
    - PROGRESS 记录：Slice 11 假设 changed_ids[1] = 首插入位置 =
  params.position；这个假设在 v0.1 单 insertmode 下稳定。

  create + VERIFY_FAILED 留 N>=1 orphan items 副作用

  - D6 决策 (a) 推荐：media_import 路径下 VERIFY_FAILED 留 N>=1 个 orphan
  items（与 Slice 09 item_duplicate / Slice 10 track_create 同形，但
  media_import 可能 N>1）。
  - 风险：live smoke 若不显式覆盖，PROGRESS 中可能让用户误以为 "只留 1 个
  orphan"。
  - 缓解：
    - S6 (single-stem mismatch) 留 1 个 orphan；PROGRESS 记 "media_import
  single-stem VERIFY_FAILED leaves 1 orphan item"。
    - 如果有 multi-take 测试条件，加 S6b (multi-stem mismatch) 留 N>1
  orphan；否则 PROGRESS 明示 "N>1 path manual verification deferred"。
    - 用户在 smoke 后看 REAPER 项目会看到 orphan items（带 Ping.aiff 等
  take）——packet 提前预告。

  Slice 04 的 count:"any" 结构 verify 路径不退化

  - media_import 走 expectedDelta.creates:true + count:"any" 的结构 verify
  路径已经在 Slice 04 测过：实际 delta >= 1（因为 creates）就通过；delta == 0
  应该走 VERIFY_FAILED（structural before fields）。
  - 风险：Slice 11 引入 fields 后，是否影响 Slice 04 的结构 verify 优先级？
  - 缓解：S11 (forced structural mismatch on media_import) 显式验证 structural
  verify 仍优先于 fields verify；details 不含 fields。

  wire 字节稳定

  - Slice 06 的 4 模板 wire 字节不变。
  - Slice 07 item_trim wire 字节不变。
  - Slice 08 item_fade wire 字节不变。
  - Slice 09 item_duplicate wire 字节不变。
  - Slice 10 track_create wire 字节不变。
  - 2 个未纳入字段 verify 的模板（region_create / render_region）+ Slice 11
  之前形态的 media_import 中：
    - media_import wire 在 Slice 11 之后含 fields:[{D_POSITION...}]——这是本
  slice 唯一的 wire diff，针对单个模板，预期出现。
    - region_create / render_region wire 字节稳定。

  Static redlines（防 D5 滥用）

  - registry + manifest-alignment 双层守护：见 §5 修订。
  - 新增/强化 lua-structure.test.mjs grep：
    - 守护 verify.lua 未引入 region scope reader 或 parse_region_ref（防本 slice
  漂出 scope 扩展）。
    - 守护 verify.lua 未引入 multi-item 循环（防本 slice 漂出 "all-items verify"
  语义）。
  - 新增 list-templates 断言：region_create / render_region 仍无 fields（防 PR
  顺手扩散）。
  - HANDOFF / PROGRESS 把"已放开 / 仍互斥"的组合矩阵列清楚，给后续 architect
  明确边界。

  Error-code constants 不退化

  - 失败路径仍走 errs.VERIFY_FAILED。
  - Slice 05 audit 已 grep reaper/packs/core/**/*.lua；本 slice 不改 Lua，audit
  影响为 0。
  - npm run check:error-codes-fresh 必须保持 22 codes。

  REAPER bridge boot 必须 full quit/reopen

  - 本 slice 不改 verify.lua，但 wire 首次出现 creates:true + count:"any" +
  fields[] 同时出现的 payload。
  - 如果旧 chunk 的 manifest 上 media_import 没有 fields，新 chunk 的 manifest
  上有，bridge 启动时是 dofile 一次，所以靠 Re-Run start_bridge.lua 即可（无
  verify.lua 主路径变更）。
  - 但为消除 Slice 04+05+06+07+08+09+10 累计的 chunk-stack 不确定性，仍强制建议
  full quit/reopen REAPER，确保 generation = 1。
  - 验证 console 含 loaded error_codes (22 codes)。

  回归覆盖必查项

  - Slice 06 的 4 happy envelope 字节稳定（item_pitch / item_move / item_rate /
  track_rename）。
  - Slice 07 item_trim 的两个 happy envelope 字节稳定（length-only +
  length+start_offset）。
  - Slice 07 item_trim 的 optional 跳过路径仍工作。
  - Slice 08 item_fade 的 4 happy envelope 字节稳定（数值单字段 / 数值双字段 /
  null 单清 / null 双清）。
  - Slice 09 item_duplicate 的 happy envelope 字节稳定（同 track + 跨 track）。
  - Slice 10 track_create 的 happy envelope 字节稳定（create + reuse）。
  - Slice 04 的结构 verify 失败仍优先于字段 verify（在 media_import
  上重新验一次，是 count:"any" 模板首次验证此优先级）。
  - Slice 05 errs.* 接线不退化。
  - Slice 02 get_state include 仍工作。
  - Slice 01 readonly scope 不污染 LAST_RESULT。
  - render_region 仍跳过任何 verify；changed_ids 仍是绝对路径。
  - Slice 06 的"raw 结构 mismatch 优先于字段 mismatch"在 media_import
  上重新验一次（首次在 count:"any" 模板上）。
  - region_create 仍无 fields[]（Slice 11 不收）。
  - Slice 09 item_duplicate 的 D5 boundary（creates+数值 count+fields）仍工作。
  - Slice 10 track_create 的 D5 boundary（maybeCreates+数值
  count+fields）仍工作。

  ---
  8. IMPLEMENTATION SEQUENCE

  按依赖顺序（每步独立绿测后再走下一步）：

  1. TS schema 修订 —
  /Users/Zhuanz/Documents/streetlight-reaper-mcp/packages/core/src/registry.ts
    - 修订 validateExpectedDeltaFields：把 "fields + (maybeCreates OR creates) →
  数值 count" 分流为 "fields + creates → 数值 OR 'any' 接受"（见 §5 伪代码）。
    - TDD：先在 packages/core/src/__tests__/registry.test.ts 加 6
  个新测试，再写实现。
  2. media_import descriptor — /Users/Zhuanz/Documents/streetlight-reaper-mcp/pa
  ckages/mcp-server/src/templates/media-import.ts
    - 把 expectedDelta = { count:"any", creates:true } 扩展为 expectedDelta = {
  count:"any", creates:true, fields:[{scope:"item", field:"D_POSITION",
  paramPath:"position", tolerance:1e-6}] }。
    - 在 expectedDelta 上方加一行注释：// Slice 11: count:"any" semantic =
  first-item verify (changed_ids[1] only); multi-item paths only have first item
  validated. See TEMPLATE_SPEC.md.
  3. wire 透传验证 — /Users/Zhuanz/Documents/streetlight-reaper-mcp/packages/mcp
  -server/src/tools/__tests__/call-template.test.ts
    - toWireExpectedDelta 不需改（Slice 06 已实现 fields 透传）；只加 2
  个测试断言 wire 形态正确。
  4. list_templates 富化 — /Users/Zhuanz/Documents/streetlight-reaper-mcp/packag
  es/mcp-server/src/tools/__tests__/list-templates.test.ts
    - 加 3 个测试：media_import metadata 含 1 条 fields；其他 10 个模板 metadata
  字节稳定；region_create / render_region 仍无 fields。
  5. 静态守护扩展 —
  /Users/Zhuanz/Documents/streetlight-reaper-mcp/scripts/manifest-alignment.mjs
  + /Users/Zhuanz/Documents/streetlight-reaper-mcp/scripts/__tests__/manifest-al
  ignment.test.mjs
    - 与 registry.ts 同口径修订；加 4 个新测试。
  6. lua-structure 防漂 — /Users/Zhuanz/Documents/streetlight-reaper-mcp/scripts
  /__tests__/lua-structure.test.mjs
    - +2 grep 守护：verify.lua 不含 parse_region_ref / scope = "region" / region
  FIELD_READER（强化 Slice 09/10 已有同形 grep，明确归属 Slice 11 守护点）；+
  verify.lua 不含 multi-item verify 循环（"for _, id in ipairs(changed_ids)"
  之类的字面 pattern）。
  7. 不改 Lua — verify.lua / streetlight_bridge.lua / media.lua / manifest.lua
  全部不动。
  8. 静态闸 — 见 §9。
  9. REAPER full quit/reopen → ReaScript: Load → Run — 验证 generation = 1 +
  loaded error_codes (22 codes) 行。
  10. Live smoke — 见 §10。
  11. Docs 同步 — HANDOFF / PROGRESS / TEMPLATE_SPEC / RESPONSE_BUDGET /
  KERNEL_HARDENING_{PLAN,EXECUTION} / 本 packet。

  ---
  9. STATIC VERIFICATION

  绝对路径命令：

  cd /Users/Zhuanz/Documents/streetlight-reaper-mcp
  npm test
  npm run build
  npm run check:manifest
  npm run check:error-codes-fresh
  git -C /Users/Zhuanz/Documents/streetlight-reaper-mcp diff --check

  通过判据：

  - npm test → 基线 278 + 新增 17 ≈ 295 全绿；若 < 278 视为回归。
  - npm run build → 0 报错（pre-existing TS6310 噪声可忽略）。
  - npm run check:manifest → Streetlight manifest alignment ok (11 templates).
  - npm run check:error-codes-fresh → Streetlight error codes fresh (22 codes).
  + zero forbidden literal usage。
  - git diff --check → 无空白错误。

  ---
  10. LIVE SMOKE PLAN

  前置（必须）：用户完全退出 REAPER 进程（不只是关项目），重开 → Actions → Show
  action list → ReaScript: Load… → 选 start_bridge.lua → Run。console 必须有：

  [streetlight] loaded error_codes (22 codes)
  bridge ready (generation 1) — loaded error_codes (22 codes) — templates: …

  generation ≠ 1 或 22 codes 行缺失 → 不通过，回到前置。

  Smoke 步骤（保持 Slice 04–10 的"成功路径 + 故意 mismatch + 多 slice
  回归"三轨）

  S0 reachability：ping → bridge:connected, reaper_version=7.71/macOS-arm64。

  S1 list_templates：11 模板返回；断言：
  - media_import.expectedDelta 含 {count:"any", creates:true,
  fields:[{scope:"item", field:"D_POSITION", paramPath:"position",
  tolerance:1e-6}]}；不含 optional/nullable。
  - Slice 06–10 已纳入的 8 个模板 metadata 字节稳定（含 item_pitch / item_move /
  item_rate / track_rename / item_trim / item_fade / item_duplicate /
  track_create）。
  - region_create.expectedDelta = {count:1, creates:true}（仍无 fields——Slice
  12+ 才放）。
  - render_region 仍无 expectedDelta。

  S2 prep track：track_create name:"Slice11 Live Smoke <ts>" reuse_existing:true
  → 拿到 track GUID（用 Slice 10 happy create 路径，应通过 P_NAME verify）。

  S3 media_import happy 单 stem 路径：media_import
  path:"/System/Library/Sounds/Ping.aiff" track_id:"last_result:track:0"
  position:0 → 单 item 路径。
  - 断言：changed_count=1，changed_ids 是新 item 的 guid:{...}；记下该 GUID。
  - 验证：bridge 端结构 verify 算出 delta_items=+1（与 count:"any" +
  creates:true 兼容路径符合：actual >= 1 通过）；字段 verify 端 D_POSITION
  readback ≈ 0.0 通过（tolerance 1e-6）。
  - 这是 Slice 11 的核心新行为之一：count:"any" + creates + fields 路径在 N=1
  下全程绿。

  S4 media_import happy 不同 position：media_import
  path:"/System/Library/Sounds/Ping.aiff" track_id:"last_result:track:0"
  position:5.0 → 单 item 路径。
  - 断言：changed_count=1，新 item GUID 与 S3 不同。
  - 验证：D_POSITION readback ≈ 5.0 通过。
  - 这条验证 params.position 是字段 verify 的真实驱动（不是 hardcoded 0）。

  S5 Slice 06 / 09 / 10 回归（在 S3/S4 创建的 items 上）：
  - item_pitch last_result:item:0 semitones:-3 → success + Slice 06 D_PITCH
  verify 通过。
  - item_move last_result:item:0 position:7.0 → success + Slice 06 D_POSITION
  verify 通过。
  - item_duplicate last_result:item:0 track_id:"last_result:track:0"
  position:10.0 → success + Slice 09 D_POSITION verify 通过。
  - track_create name:"Slice11 Reuse <ts>" reuse_existing:true → success + Slice
  10 P_NAME verify 通过（create 路径）。
  - 再来一次 track_create name:"Slice11 Reuse <ts>" reuse_existing:true → reuse
  命中 + Slice 10 verify 通过（reuse 路径）。

  S6 字段 mismatch 强制路径（single-stem + raw queue）：直接往 queue 投
  media_import path:"/System/Library/Sounds/Ping.aiff" track_id:"<S2 track
  GUID>" position:3.0，但 wire expected_delta.fields[0].field =
  "D_POSITIONX"（不存在的 attr）。
  - handler 仍正常 InsertMedia 创建 1 个新 item；bridge 端字段 verify 读
  GetMediaItemInfo_Value(handle, "D_POSITIONX")——REAPER 对未知 numeric attr 返回
  0 → 与 expected=3.0 不等 → fields verify 失败。
  - 断言：VERIFY_FAILED，recoverable:false，details.fields[0].ok=false，details.
  fields[0].expected=3.0，details.fields[0].actual=0，tolerance:1e-6，message 含
  Slice 04 恢复短语字面量。
  - 副作用（D6 决策 (a) 显式记录）：S6 让 handler 真创建了一个新 item（在 REAPER
  项目里可见），但 LAST_RESULT.items 不更新——1 个 orphan item，与 Slice 09
  item_duplicate S7 同形。

  S7 LAST_RESULT 不污染（create 路径）：发 item_pitch last_result:item:0
  semitones:-5 → 应当作用于 S5 末尾的 item（与 S3/S4/S5 链上一致），不作用于 S6
  创建的 orphan。
  - 断言：changed_ids[1] GUID 与 S5 末尾 item_duplicate 的输出一致；S6 的 orphan
  item 不被改 pitch。
  - 这是 Slice 11 的关键守护：create + VERIFY_FAILED 不污染 LAST_RESULT，即使
  handler 真的创建了新实体。

  S8 forced paramPath 错位（raw queue）：raw 发 media_import
  path:"/System/Library/Sounds/Ping.aiff" track_id:"<S2 track GUID>"
  position:4.0，wire params.position 正常，但
  expected_delta.fields[0].paramPath="positionX"（不存在的 key）。
  - verify 端 params["positionX"] == nil 且 optional 不为 true → mismatch
  {expected:"present param", actual:nil} → VERIFY_FAILED。
  - 这一步守护"paramPath 错位"在 Slice 11 仍按 Slice 06 的 mismatch
  路径走（不是新代码路径）。
  - 副作用：handler 又创建了一个 orphan item——记入 evidence。

  S9 结构 mismatch 仍优先（Slice 04 回归 + 在 count:"any" 模板上首次验）：raw 发
  media_import path:"/System/Library/Sounds/Ping.aiff" track_id:"<S2 track
  GUID>" position:6.0，expected_delta = {count:0, creates:true,
  fields:[{...}]}（count:0 静态会被拒，这里改用 count:5 期望 5 项但 handler 只插
  1 项以触发结构失败）→ handler 创建 1 个 item，结构 verify count expected 5
  got 1 失败优先返回，top-level details 不含 fields（与 Slice 06–10 一致）。
  - 注意 wire-side 测试用 numeric count：因为 count:"any" 永远兼容任何正
  delta，结构 mismatch 无法用 count:"any" 触发；用 count:5 兼容 Slice 04 结构
  verify 拦截。
  - 副作用：又一个 orphan item——记入 evidence。

  S10 LAST_RESULT 不污染（structural mismatch 路径）：发 item_pitch
  last_result:item:0 semitones:0 → 仍作用于 S7 后的同一 item。
  - 断言：changed_ids[1] GUID 与 S5/S7 一致。

  S11 maybeCreates+fields 回归（Slice 10）：track_create name:"Slice11
  maybeCreates Probe <ts>" reuse_existing:true → create 路径 + P_NAME verify
  通过。再发一次同名 → reuse 路径 + P_NAME verify 通过。两次 changed_ids GUID
  相同。
  - 这一步守护 Slice 10 的 D5 boundary（maybeCreates+数值 count+fields）在 Slice
  11 D5 进一步放宽后仍工作。

  S12 creates+数值+fields 回归（Slice 09）：item_duplicate last_result:item:0
  track_id:"last_result:track:0" position:12.0 → success + Slice 09 D_POSITION
  verify 通过。
  - 这一步守护 Slice 09 的 D5 boundary（creates+数值 count+fields）在 Slice 11
  D5 进一步放宽后仍工作。

  S13 Slice 07 / 08 回归（在 S5 / S7 链上的 item 上）：
  - item_trim last_result:item:0 length:1.0 → success + Slice 07 D_LENGTH verify
  通过，D_STARTOFFS skip。
  - item_fade last_result:item:0 fade_in:null → success + Slice 08 nullable
  verify 通过。

  S14 error-code constants 回归：
  - media_import path:"/no/such/file" → MEDIA_NOT_FOUND。
  - media_import path:"/System/Library/Sounds/Ping.aiff" track_id:"selected:99"
  → TRACK_NOT_FOUND 或 REF_INVALID（依 refs.lua 实际消息）。
  - region_create name:"bad/name" start:0 end:1 → REGION_NAME_INVALID。

  S15 get_state include 回归：
  - get_state(tracks, include:["fx"]) → OK；
  - get_state(render, include:["fx"]) → PARAMS_INVALID；
  - get_state(render) → SCOPE_NOT_IMPLEMENTED。

  S16 render_region carve-out：region_create name:"slice11-r-<ts>"
  item_id:"last_result:item:0" → success；render_region region:"slice11-r-<ts>"
  output_dir:"<临时 dir>" render_pattern:"slice11-r-<ts>" → success；临时 dir
  含且仅含 .wav，无 .RPP / .RPP-bak。changed_ids 是绝对 WAV 路径。render_region
  仍跳过任何 verify。临时 render dir 用后必须删干净。

  S17 region_create 仍无 fields 回归：list_templates 重读一次（或 S1
  已经覆盖），断言 region_create.expectedDelta 仍无 fields；render_region 仍无
  expectedDelta。

  清理

  smoke 中创建的 track / item / region 留在 REAPER 项目里由用户手动 Cmd+Z /
  删除（沿用 Slice 04–10 惯例）；任何临时 render dir 必须删干净。

  S6 / S8 / S9 的 orphan items（来自 forced VERIFY_FAILED 路径）在 PROGRESS / 本
  packet 的 live smoke evidence 段必须明确点名"这些是预期的 'count:"any" create
  + verify failure' 语义副作用"，让用户知道不需要 panic。预期 orphan 计数：S6 =
  1 item, S8 = 1 item, S9 = 1 item（structural mismatch 也走了 handler）= 共 3
  个 orphan items（每个名为 Ping.aiff take 在 S2 创建的 track 上）。

  通过判据

  S0–S17 全绿，且：

  - S3 / S4 的 happy 路径确实进入 fields verify 且 D_POSITION 通过——这是 Slice
  11 核心断言（count:"any" 单 item 路径完全 verify）。
  - S6 details 含 fields[0]，结构与本 packet §5 一致；create 路径 handler
  已经把新 item 创建了，但 envelope 是 VERIFY_FAILED。
  - S7 的 LAST_RESULT 隔离——VERIFY_FAILED 不更新 LAST_RESULT，即使 handler
  真的创建了实体。
  - S8 的 paramPath 错位仍走 Slice 06 的 mismatch 路径（不是新代码路径）。
  - S9 details 不含 fields（结构 mismatch 优先）；这是 count:"any"
  模板首次验证此优先级。
  - S11 / S12 的 Slice 10 / 09 D5 boundary 不退化。
  - S13 / S14 / S15 / S16 wire code 与 Slice 10 之前完全一致。
  - 任何 path 退化为 INTERNAL_ERROR / 错误码字面量泄漏 →
  不通过，回滚迁移并复盘。
  - list_templates 11 模板字节稳定，仅 media_import 新出现 fields[]——其他 2
  个未纳入模板（region_create / render_region）必须仍无 fields。

  Multi-item path（N>1）覆盖说明

  media_import 的 N>1 路径在标准 Ping.aiff 等单 stem 文件下永远是 N=1；要触发
  N>1 需要多 stem 文件（如某些 multi-channel cwave 文件）或 ReaCue MIDI
  文件。v0.1 不强制 N>1 live smoke：

  - 如果用户手边有 multi-stem media file，可选执行 S3b：media_import
  path:"<multi-stem file>" track_id:"last_result:track:0" position:0 → 预期
  changed_count >= 2，changed_ids 是 N>=2 个 GUIDs；字段 verify 仅验
  changed_ids[1] 的 D_POSITION ≈ 0；后续 items 的 position 不被
  verify（first-item verify 契约）。
  - 如果没有 multi-stem 文件，PROGRESS 明示 "N>1 path manual verification
  deferred"，与 Slice 10 的 "reuse path is tautological" 同口径声明。

  ---
  针对用户 6 个问题的直接答案

  1. media_import / count:"any" 是否该作为 Slice 11？

  是，强烈推荐。理由：
  - H2 剩余 3 个未覆盖模板（media_import / region_create / render_region
  carve-out）中，media_import 引入新轴最少（只有 D5 放宽到 count:"any"），与
  Slice 09 item_duplicate 的 item scope + GUID-shaped changed_ids + D_POSITION
  完全同形。verify.lua 主路径零代码改动。
  - region_create 同时引入 region scope + region:NAME ref parser + 新
  FIELD_READER 三个新轴，故障定位贵，应作为 Slice 12+ 独立 packet。
  - render_region 是永久 carve-out（artifact path 不是项目态实体），不进 H2。
  - Slice 11 收 media_import 后，H2 覆盖 8/11 → 9/11；D5 三大边界（creates+数值
  / maybeCreates+数值 / creates+"any"）全部放开；H6 scaffold 的"≥9/11"门槛达成。

  2. 多 item changed_ids 下 verify 语义如何决定？

  推荐 (a) first-item verify only（D2 决策）：
  - 仅验 changed_ids[1]，verify.lua 零改动。
  - N==1（最常见，单 stem 媒体）= 完全 verify。
  - N>1（罕见，多 stem 媒体）= pipeline proof-of-life；后续 items
  不校验，契约写进 TEMPLATE_SPEC.md 的 "Fields on count:'any' templates" 子节。
  - "all-items uniform verify" / "per-item fields" 留 Slice 13+
  独立产品决策（需新 Lua 循环 + 新 descriptor 字段）。

  3. 哪些字段最适合作为 media_import 的首选 verify？

  推荐 (a) 仅 item D_POSITION ← params.position（D3 决策）：
  - 与 Slice 09 item_duplicate 同口径（item scope，数值，tolerance
  1e-6，paramPath 直接驱动）。
  - verify.lua 主路径零修改。
  - take source 文件名 / item track GUID 等候选都引入新轴（新 take reader / 新
  cross-scope reader），应作为独立 packet。
  - v0.1 media_import insertmode 是 hardcoded 的，D_POSITION ← params.position
  假设稳定；v0.2 加 insertmode 后需重评 D2/D3/D4。

  4. 是否需要 Lua verify 改动？

  完全不需要，零 Lua 改动。FIELD_READERS["item"] 自 Slice 09 起就为
  item_duplicate 服务，专门处理 D_POSITION 走
  GetMediaItemInfo_Value；find_item_by_guid 也是 Slice 06 落地。check_fields
  已经只读 changed_ids[1]——天然就是 "first-item verify" 语义。Slice 11 只是让
  media_import 复用同一条路径。verify.lua / streetlight_bridge.lua / media.lua /
  manifest.lua 全部不改。

  5. 需要哪些 registry / manifest redlines，防止 D5 滑到 region scope /
  multi-item verify / per-item fields？

  - registry.ts（见 §5 伪代码）：
    - fields[] + deletes:true → 仍拒。
    - fields[] + maybeCreates:true → 必须 numeric count >= 1。
    - fields[] + creates:true → 接受 numeric count >= 1 或 count:"any"（Slice 11
  放宽）。
    - FIELD_CHECK_SCOPES = {"take","item","track"} → 不增 region。
  - manifest-alignment.mjs 同口径修订（CLI 与 vitest 校验对齐）。
  - lua-structure.test.mjs grep 守护：
    - verify.lua 未引入 parse_region_ref / scope = "region" / region
  FIELD_READER（防本 slice 漂出 scope 扩展）。
    - verify.lua 未引入 multi-item 循环 / "all-items verify" 字面 pattern（防本
  slice 漂出 multi-item semantic 扩展）。
  - list-templates 测试：断言 region_create / render_region 仍无 fields（防 PR
  顺手扩散）。
  - HANDOFF + KERNEL_HARDENING_PLAN 把"已放开 / 仍互斥"组合矩阵列清楚：
    - ✅ creates + numeric count + fields（Slice 09）
    - ✅ maybeCreates + numeric count + fields（Slice 10）
    - ✅ creates + count:"any" + fields（Slice 11，first-item verify）
    - ❌ deletes + fields（v0.1 无 deletes 模板，规则保留）
    - ❌ field scope "region"（Slice 12+ for region_create，需新
  parse_region_ref + 新 reader）
    - ❌ count:"any" + multi-item all-items verify（Slice 13+，需 verify.lua
  改动）
    - ❌ render_region 任何 verify（永久 carve-out，artifact path）

  6. live smoke 怎么覆盖 single-item / multi-item / VERIFY_FAILED 不污染
  LAST_RESULT / orphan items？

  详细见 §10。核心五件事：

  - S3 / S4 happy 单 stem 路径：N=1 完全 verify，含两个不同 position 值（防
  hardcoded 0 假阳性）。
  - S6 forced create + VERIFY_FAILED：raw queue 改 wire field:"D_POSITIONX" →
  handler 创建 1 个 orphan item + bridge VERIFY_FAILED + details.fields[]。
  - S7 LAST_RESULT 隔离：item_pitch last_result:item:0 仍作用于 S5 末尾的
  item，S6 的 orphan 不被改 pitch。
  - S8 forced paramPath 错位：又一个 orphan item，验证 Slice 06 mismatch
  路径仍工作。
  - S9 forced structural mismatch（在 count:"any" 模板上首次）：用 count:5 期望
  5 项但只插 1 项 → 结构 verify 优先于 fields verify，details 不含
  fields；又一个 orphan item。
  - N>1 multi-stem path：v0.1 不强制（多 stem 文件不便找）；PROGRESS 明示 "N>1
  path manual verification deferred"，与 Slice 10 "reuse path is tautological"
  同口径声明。

  S6 + S7 + S8 + S9 一起锁定：create + VERIFY_FAILED 留 N>=1 orphan items
  但不污染 LAST_RESULT。这是 count:"any" 模板相对于 Slice 09 item_duplicate
  的语义升级（potentially N>1 orphan vs. 1 orphan）。

  ---
  拍板请求

  请就 D1–D6 拍板（推荐 (a)/(a)/(a)/(a)/(a)/(a)），其余按本 packet 推进。Codex
  执行；reviewer 只读复核；smoke 通过后由你决定是否 commit——本 packet 不替你
  commit、不 push、不 reset、不 branch。

  最关键的三个决策点：

  - D1：是否先做 media_import 而不是 region_create？推荐先 media_import——只引入
  1 个新轴（D5 放宽到 count:"any"），region_create 引入 3 个新轴（region scope +
  region:NAME ref + 新 reader），故障定位贵。
  - D2：count:"any" 下的多 item verify 语义？推荐 first-item verify
  only——verify.lua 零改动；契约写进 TEMPLATE_SPEC.md；all-items / per-item 留
  Slice 13+ 独立产品决策。
  - D6：N>=1 orphan items 副作用如何文档化？推荐 (a) 显式记录——media_import
  是首个可能产生 N>1 orphan 的 creates 类模板；契约要写明，smoke evidence
  要列计数。

  若想换方向：

  - 直接 Slice 11 收 region_create：可以，但等于把"D5 收尾"和"region scope
  扩展"两件事一刀做。请准备好回答：(1) verify.lua 如何 parse region:NAME 形
  changed_ids；(2) FIELD_READERS["region"] 的 resolve / read 函数签名（region
  没有原生 handle，需 synthetic struct）；(3) FIELD_CHECK_SCOPES 是否扩到 4
  元素；(4) region "name" 字段的 verify 是结构性永真（与 Slice 10 reuse path
  类似）还是真的能 mismatch（rename 路径在 v0.1 不存在）——这是 2–3
  个新的产品决策。
  - 直接转 H4 idempotency：可以，但 H2 9/11 阈值未达；H6 scaffold 至少要 H2
  ≥9/11；建议先做完 Slice 11 把 H2 推到 9/11，再评估 H4 vs H6 的下一刀。
  - 直接转 H6 scaffold（descriptor → 代码生成）：可以，但 H2 9/11
  阈值未达；建议先做 Slice 11；Slice 11 完成后 H6 scaffold 可启动，并把
  region_create（Slice 12+）作为首个由 scaffold 生成的模板。