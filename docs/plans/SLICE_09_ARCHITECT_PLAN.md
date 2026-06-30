下面是 Slice 09 的 Architect Plan Packet。

  ▎ ▎ 工作流约束（先确认）：本 packet 仅做计划——不写代码、不 commit、不 push、不 reset、不
  ▎ branch。所有路径用绝对路径。本 slice 改 packages/core/src/registry.ts 的静态校验、不动
  ▎ reaper/packs/core/verify.lua 的 check_fields 主路径（只新增一条 descriptor 的合法形态）。但 wire
  ▎ 上首次出现 creates:true + fields[] 同时出现的 payload，所以 live smoke 仍必须 full quit/reopen
  ▎ REAPER，重新 Run start_bridge.lua（generation 必须 = 1）。

  ---
  候选排序（高 → 低）

  A. item_duplicate（creates:true，count:1，item scope，GUID-shaped changed_ids） ⭐ 推荐

  - 目前 H2 覆盖 6/11；剩 5 个未纳入模板：item_duplicate / track_create / media_import / region_create /
  render_region(carve-out)。其中 4 个是 creates/maybeCreates 类。
  - item_duplicate 在四个 creates 候选里新轴最少：
    - 同 entity_kind = item（与 Slice 06/07/08 一致）。
    - changed_ids 是 guid:{...} —— Slice 06 的 parse_guid_ref(changed_ids[1]) + find_item_by_guid()
  路径直接复用，verify.lua 主路径零修改。
    - count 是定数 1（不是 "any"），不引入"多新建实体的字段 verify 怎么分配"问题。
    - 不是 maybeCreates，不引入"count:1 但 actual delta=0 时字段 verify 是否仍跑"问题。
    - 只新增一个真正的轴：放宽 D5 让 creates:true 与 fields[] 共存。
  - 收益：H2 覆盖 6/11 → 7/11；同时把"放宽 D5"这件事用最小风险面验完，为后续 3 个 creates 类模板铺路。

  B. track_create（maybeCreates:true）

  - 同时引入两个新轴：(1) D5 放宽到 creates；(2) D5 放宽到 maybeCreates。maybeCreates 的
  reuse_existing:true 路径意味着"结构 delta=0 但字段 verify 仍需读 P_NAME 并对账
  params.name"——技术上其实工作（reuse 命中的已存 track 的 P_NAME 必等于 params.name，因为我们就是按 name
  去查的），但和 D5 放宽同切片做，故障定位贵。
  - 留 Slice 10。

  C. media_import（creates:true，count:"any"）

  - 引入两个新轴：(1) D5 放宽；(2) count:"any" + fields 的 verify 语义（首项验证 vs 全项验证 vs 仅验证
  D_POSITION）。多通道音频被 InsertMedia 拆成 N 个 item 是真实场景，N>1 时 "verify D_POSITION on
  changed_ids[1]" 是部分覆盖，需要产品决策。
  - 留 Slice 11+，先把"any-count 下 fields 怎么覆盖"作为单独 packet 决策。

  D. region_create（creates:true，count:1，但 region scope）

  - changed_ids 是 region:NAME，不是 GUID-shaped。Slice 06 的 parse_guid_ref(changed_ids[1]) 直接
  nil，verify 立刻 fail。
  - 需要三处新代码：(1) 新增 parse_region_ref(changed_ids[1])；(2) FIELD_CHECK_SCOPES 增加 "region"；(3)
  FIELD_READERS 新增 region scope reader（要么按 name 重扫 EnumProjectMarkers3，要么把
  refs.resolve_region 的合成 handle 传给 reader）。
  - 同时引入三个新轴：D5 放宽 + 新 ref 形状 + 新 scope。
  - 留 Slice 12+，单独一刀做 region scope 扩展。

  E. 拆 maybeCreates 之外的 H 项（H4 / H6 / H7）

  - H4 idempotency 需要先钉三处产品决策（key 由谁出 / 生命周期 / 回放语义）。本身就是一份 packet。
  - H6 scaffold 仍依赖 H2 字段 verify ≥ 9/11；当前 6/11，Slice 09 推到 7/11 仍远不够。
  - H7 socket 是纯性能，与 Slice 09 不冲突，但不解锁护城河。
  - Slice 09 都不上。

  结论：Slice 09 = item_duplicate 字段 verify + D5 放宽到"creates:true only, 数值 count
  only"。这是最小风险面把 D5 拆开的第一刀，把后续 3 个 creates 类模板的基础设施（统一靠 changed_ids[1]
  GUID 找新实体）先在最简形态上验证。

  ---
  Architect Plan Packet — Slice 09

  1. GOAL

  把 H2 字段 verify 从 6 个模板扩到 7 个，新纳入 item_duplicate，首次允许 expectedDelta.fields[] 与
  creates:true 共存，但用最小放宽面：

  - D5 当前：fields[] 与 creates / maybeCreates / deletes 三选一互斥。
  - Slice 09 D5：fields[] 可与 creates:true 共存，当且仅当：
    - count 是 >= 1 的正整数（禁止 count:"any"，把 media_import 静态拦在外面）。
    - 仍禁止 fields[] 与 maybeCreates:true 共存（track_create 留 Slice 10）。
    - 仍禁止 fields[] 与 deletes:true 共存（v0.1 无 deletes 模板，规则保留）。
    - 仍禁止 field 的 scope = "region"（FIELD_CHECK_SCOPES 不增，region_create 留 Slice 12+）。

  item_duplicate 落地一条字段 check：

  ┌────────────────┬───────┬────────────┬─────────────────┬──────────┬──────────┬───────────┐
  │      模板      │ scope │   field    │   param 推导    │ optional │ nullable │ tolerance │
  ├────────────────┼───────┼────────────┼─────────────────┼──────────┼──────────┼───────────┤
  │ item_duplicate │ item  │ D_POSITION │ params.position │ (none)   │ (none)   │ 1e-6      │
  └────────────────┴───────┴────────────┴─────────────────┴──────────┴──────────┴───────────┘

  bridge 端零代码改动：Slice 06 落下的 verify.check_fields(expected, changed_ids, params, entity_kind,
  ctx) 已经按 changed_ids[1] 的 guid:{...} 解析新实体；handler 已经 SetMediaItemInfo_Value(new_item,
  "D_POSITION", params.position) 写入；FIELD_READERS 已经有 scope = "item" reader 读 D_POSITION。本 slice
  只是首次让一条 creates:true 模板把这条已有的路径用起来。

  H2 覆盖率：6/11 → 7/11。

  ---
  2. NON-GOALS

  - 不动 5 工具面（I1）。
  - 不动 call_template 成功信封（I3）：失败信封仅在 error.details.fields[] 上扩张（保留 Slice 06/07/08
  形状）。
  - 不引入新错误码、不重命名、不动 errs.* 接线（Slice 05 不变）。
  - 不放开 fields[] + maybeCreates（track_create 留 Slice 10）。
  - 不放开 fields[] + count:"any"（media_import 留 Slice 11+）。
  - 不放开 region scope 的 field check（region_create 留 Slice 12+；不动 FIELD_CHECK_SCOPES、不动
  FIELD_READERS、不动 verify.lua 的 parse_guid_ref(changed_ids[1])）。
  - 不动 verify.lua 的 check_fields 主路径函数体（Slice 09 只让 descriptor 形态变多，不改 Lua 算法）。
  - 不动 streetlight_bridge.lua 的调用顺序：check_counts → check_fields → finalize_template。
  - 不动 render_region（继续 Slice 04 起的 carve-out：无 expectedDelta、跳过任何 verify）。
  - 不动 LAST_RESULT 桶结构、entity_buckets、refs.lua。
  - 不动 get_state schema / include / fields / cursor。
  - 不动 item.lua 的 item_duplicate handler 本体（已落定：手动 AddMediaItemToTrack +
  SetMediaItemTake_Source + SetMediaItemInfo_Value(new_item, "D_POSITION", params.position)）。
  - 不动 6 个 Slice 06/07/08 已覆盖模板的 expectedDelta（item_pitch / item_move / item_rate /
  track_rename / item_trim / item_fade）。
  - 不做 H4 idempotency token、H6 scaffold、H7 socket。
  - 不动 recipes/、scripts/setup.mjs、install.*、setup-out/。
  - 不动 docs/CROSS_MAC_SMOKE.md、docs/ARCHITECTURE.md、docs/KERNEL_DESIGN.md、docs/INSTALL.md
  等非内核硬化文档。

  ---
  3. USER-FACING BEHAVIOR

  - Slice 06 的 4 happy envelope + Slice 07 的 item_trim 2 happy envelope + Slice 08 的 item_fade 4 happy
  envelope 逐字节不变。
  - item_duplicate happy envelope 逐字节不变（仍是锁定 { template, changed_count, changed_ids, truncated
  }，changed_ids 仍是 ["guid:{NEW-ITEM-GUID}"]，count 仍是 1）。
  - 新增 wire/语义只在四类路径上可见：

    - a. list_templates metadata：item_duplicate.expectedDelta.fields[] 现在含 1 条 {scope:"item",
  field:"D_POSITION", paramPath:"position", tolerance:1e-6}；不含 optional、不含
  nullable（缺省即省略，遵守 Slice 03 omit-when-absent 策略）。其他 10 个模板字节稳定。
    - b. 拥有"创建即验证"的语义：item_duplicate 在 handler 成功后由 bridge 重读新 item 的 D_POSITION，与
  params.position 比对（容差 1e-6）。差异 → VERIFY_FAILED + recoverable:false + details.fields[] +
  LAST_RESULT 不更新。但在正常 handler 路径下 verify 必通过（handler 自己 SetMediaItemInfo_Value
  写了同一个值），所以日常用户看不到这条路径——它仅在 raw queue 故意搞坏 wire 时才暴露。
    - c. 静态校验更严：尝试给 media_import 这种 count:"any"+creates:true 模板加 fields[] 现在会在
  registry/manifest CLI 上注册时报错；尝试给 track_create 这种 maybeCreates:true 模板加 fields[]
  也仍会报错（D5 只放宽到 creates:true + numeric count）。
    - d. wire 首次同时出现 creates:true 与 fields[]：call_template item_duplicate 的 wire payload 现在含
  expected_delta:{count:1, creates:true, fields:[{scope:"item", field:"D_POSITION",
  param_path:"position", tolerance:1e-6}]}。这是 Slice 09 唯一的 wire diff，针对单个模板，预期出现。
  - read-only 路径（ping / get_state / list_templates / list_recipes）继续不触碰 LAST_RESULT（I7）。

  ---
  4. FILES LIKELY TO CHANGE

  TypeScript（写）

  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/packages/core/src/registry.ts
    - validateExpectedDeltaFields 修订：
        - 当前 if (expectedDelta.creates || expectedDelta.maybeCreates || expectedDelta.deletes)
  一杆子拦——改为分流：
            - expectedDelta.maybeCreates === true → 仍拒。
        - expectedDelta.deletes === true → 仍拒。
        - expectedDelta.creates === true → 接受，但必须:
                - count 是数值 >= 1（typeof === "number" && Number.isFinite && Math.floor === self && >=
  1）；count:"any" 拒。
          - 每条 field 的 scope 仍属于 FIELD_CHECK_SCOPES（即 take/item/track，不含
  region）——这是已有规则，不变。
        - 都不勾 → 与 Slice 06/07/08 行为一致（in-place 模板）。
      - 其他规则（duplicate (scope,field)、负 tolerance、dotted paramPath、boolean optional、boolean
  nullable、all-optional iff all-nullable）一律不动。
    - toMetadata / ExpectedDelta type 形态不变（已支持 creates? 与 fields?
  共存的类型层面，只是运行时校验先前拦住）。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/packages/mcp-server/src/templates/item-duplicate.ts
    - descriptor 加 expectedDelta = { count:1, creates:true, fields:[{ scope:"item", field:"D_POSITION",
  paramPath:"position", tolerance:1e-6 }] }。
    - 现有 expectedDelta = { count:1, creates:true } 直接扩展为带 fields 形态。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/packages/mcp-server/src/tools/call-template.ts
    - 不改。toWireExpectedDelta 已经在 fields 上透传 optional/nullable/tolerance/param_path；本 slice
  不引入新字段。

  Lua（不写）

  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/reaper/packs/core/verify.lua — 不改。Slice 06 的
  M.check_fields 已经按 parse_guid_ref(changed_ids[1]) + find_item_by_guid(guid)
  找新实体；FIELD_READERS["item"] 已经能读 D_POSITION。item_duplicate 创建后的新 item GUID 就是
  changed_ids[1]，主路径直接打通。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/reaper/streetlight_bridge.lua — 不改。调用顺序、字段
  verify 入参（含 ctx）、details 形状都不变。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/reaper/packs/core/templates/item.lua —
  不改。item_duplicate handler 已经 SetMediaItemInfo_Value(new_item, "D_POSITION", params.position)。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/reaper/packs/core/manifest.lua — 不改。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/reaper/packs/core/refs.lua / undo.lua /
  error_codes.lua / lib/*.lua — 不改。

  Scripts（写）

  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/scripts/manifest-alignment.mjs
    - 静态规则与 registry.ts 同口径修订：把"fields 与 creates 互斥"放宽为"fields 可与 creates:true
  共存，但必须 count 为数值 >= 1"；fields 与 maybeCreates/deletes 仍互斥。
    - 避免 manifest CLI 与 vitest 校验偏离。

  Tests（写）

  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/packages/core/src/__tests__/registry.test.ts
    - +6 测试：
        - 合法：creates:true + count:1 + fields:[...]（接受）。
      - 合法：creates:true + count:3 + fields:[{...}]（接受；多新建实体场景未来需求）。
      - 非法：creates:true + count:"any" + fields:[...]（拒）。
      - 非法：creates:true + count:0 + fields:[...]（拒——count 必须 >= 1）。
      - 非法：maybeCreates:true + fields:[...]（仍拒，Slice 10 才放）。
      - 非法：deletes:true + fields:[...]（仍拒，v0.1 无用例但规则保留）。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/packages/mcp-server/src/tools/__tests__/call-template.
  test.ts
    - +2 测试：
        - item_duplicate item_id:"selected:0" track_id:"track:Foo" position:2.5 → wire expected_delta 含
  count:1, creates:true, fields:[{scope:"item", field:"D_POSITION", param_path:"position",
  tolerance:1e-6}]。
      - item_duplicate 不会在 fields 上夹带 optional/nullable（descriptor 没声明 → wire 必然没有，与
  Slice 06 in-place 模板的 4 个一致）。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/packages/mcp-server/src/tools/__tests__/list-templates
  .test.ts
    - +2 测试：
        - item_duplicate metadata expectedDelta.fields[] 含 1 条 {scope:"item", field:"D_POSITION",
  paramPath:"position", tolerance:1e-6}；不含 optional/nullable。
      - 其他 10 个模板 metadata 字节稳定（含 4 个 Slice 06
  in-place、item_trim、item_fade、track_create、media_import、region_create、render_region；其中前 3 个有
  fields[]，其余 4 个 expectedDelta 无 fields；render_region 无 expectedDelta）。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/scripts/__tests__/manifest-alignment.test.mjs
    - +4 测试：与 registry tests 同口径覆盖（合法 creates+count:1+fields；合法
  creates+count:3+fields；非法 creates+"any"+fields；非法 maybeCreates+fields）。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/scripts/__tests__/lua-structure.test.mjs
    - +1 测试：grep 守护 verify.lua 未引入 region scope reader / parse_region_ref（防止本 slice 漂出
  region scope 扩展；region 留 Slice 12+）。

  Docs（写）

  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/docs/plans/SLICE_09_ARCHITECT_PLAN.md — 本 packet
  落盘。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/docs/HANDOFF.md — live edge 切到 Slice 09；Slice 08
  全部 decisions 保留；append Slice 09 decisions（D1–D5 见 §6）。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/docs/PROGRESS.md — Slice 09 段（scope / what changed /
  verification baseline 占位 / live smoke evidence 占位）。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/docs/TEMPLATE_SPEC.md — "Nullable fields (Slice 08)"
  子节后追加 "Fields on creates templates (Slice 09)"，明示：fields[] 可与 creates:true 共存当且仅当
  count 是数值正整数；解释 "bridge 用 changed_ids[1] 的 GUID 找新实体" 的约定；明示 maybeCreates /
  count:"any" / region scope 仍未放开。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/docs/RESPONSE_BUDGET.md — VERIFY_FAILED details
  段追加：item_duplicate 单字段失败时 details.fields[] ≤ 256 字节增量（与 Slice 06 单字段同口径）。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/docs/plans/KERNEL_HARDENING_PLAN.md § H2 — 注：" Slice
  09 把字段 verify 扩到 item_duplicate，首次放宽 D5 让 creates:true 与 fields[] 共存（仅限数值
  count）；track_create (maybeCreates) 留 Slice 10，media_import (count:"any") 留 Slice
  11+，region_create (region scope) 留 Slice 12+。"
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/docs/plans/KERNEL_HARDENING_EXECUTION.md § H2 + §0.2
  重载协议 — 追加："Slice 09 不改 verify.lua 主路径，但 wire 首次出现 creates:true + fields[] 同时出现的
  payload，bridge 需重启以保证旧 chunk 不在 dofile 的 manifest 上停留。建议 full quit/reopen REAPER。"

  Files NOT touched（明确禁碰）

  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/packages/core/src/errors.ts、result.ts、risk.ts、types
  .ts、refs.ts、queue.ts
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/packages/mcp-server/src/transport/file-queue.ts
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/packages/mcp-server/src/index.ts、tools/{get-state,lis
  t-templates,list-recipes,ping}.ts
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/packages/mcp-server/src/templates/*.ts（除
  item-duplicate.ts 外的 10 个 TS 模板）
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/reaper/streetlight_bridge.lua
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/reaper/packs/core/{manifest,refs,undo,error_codes,veri
  fy}.lua、templates/*.lua、lib/*.lua
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/scripts/error-codes.mjs、scripts/setup.mjs、install.*
  、setup-out/、recipes/*.yaml
  - render_region 模板（继续 carve-out）

  ---
  5. CONTRACT / SCHEMA / ERROR-CODE CHANGES

  TS — validateExpectedDeltaFields 修订（向后兼容扩展）

  // 当前：
  if (expectedDelta.creates || expectedDelta.maybeCreates || expectedDelta.deletes) {
    throw new Error(`... only supported for in-place templates`);
  }

  // Slice 09：
  if (expectedDelta.deletes) {
    throw new Error(`Capability ${name} expectedDelta.fields cannot coexist with deletes`);
  }
  if (expectedDelta.maybeCreates) {
    throw new Error(
      `Capability ${name} expectedDelta.fields cannot coexist with maybeCreates yet (Slice 10+)`
    );
  }
  if (expectedDelta.creates) {
    // 仅允许数值 count，且 >= 1。把 media_import 的 count:"any"+fields 静态拦住。
    if (
      typeof expectedDelta.count !== "number" ||
      !Number.isFinite(expectedDelta.count) ||
      Math.floor(expectedDelta.count) !== expectedDelta.count ||
      expectedDelta.count < 1
    ) {
      throw new Error(
        `Capability ${name} expectedDelta.fields with creates:true requires numeric count >= 1`
      );
    }
  }
  // 其余规则（FIELD_CHECK_SCOPES / duplicate / tolerance / optional / nullable /
  // all-optional iff all-nullable）原样保留。

  Descriptor — item_duplicate.ts 改动

  // 之前：
  expectedDelta: { count: 1, creates: true },
  // Slice 09：
  expectedDelta: {
    count: 1,
    creates: true,
    fields: [
      { scope: "item", field: "D_POSITION", paramPath: "position", tolerance: 1e-6 },
    ],
  },

  Wire 协议（snake_case，字面同名）

  jsonc
  "expected_delta": {
    "count": 1,
    "creates": true,
    "fields": [
      { "field": "D_POSITION", "scope": "item", "param_path": "position", "tolerance": 1e-6 }
    ]
  }

  Slice 06/07/08 的 param_path / tolerance / optional / nullable 字段语义不变。本 slice
  不引入新字段。creates / maybeCreates / deletes / count 已是 Slice 04 字段。

  Lua check_fields 行为差异：零。Slice 09 的 item_duplicate 走的就是 Slice 06 已落定的"按
  parse_guid_ref(changed_ids[1]) 找 item → FIELD_READERS["item"] 读 D_POSITION → 与
  expected=params.position 比对"路径。

  VERIFY_FAILED 错误码：不动。details.fields[] 形状不动；上限按字段条数线性增长（Slice 09 单模板 1 条 ⇒ ≤
  256 字节增量）。

  list_templates 元数据：item_duplicate 的 expectedDelta.fields[0] 含 {scope, field, paramPath,
  tolerance}；不含 optional、不含 nullable（缺省省略）。

  ---
  6. DECISIONS FOR USER

  #: D1
  决策项: Slice 09 收哪个 creates/maybeCreates 模板？
  选项: (a) item_duplicate（creates+count:1+item scope+GUID-shaped changed_ids，新轴最少）；(b)
    track_create（maybeCreates，叠加结构 delta=0 时字段 verify 是否仍跑的轴）；(c)
    media_import（多新建实体的 verify 分配轴）；(d) region_create（叠加 region scope + region: 形状
    changed_ids 两个新轴）
  推荐: (a) — 唯一一个不引入"第二个新轴"的创造类模板；把"放宽 D5"单独验证完毕，b/c/d 留后续 slice
  ────────────────────────────────────────
  #: D2
  决策项: D5 放宽到 creates:true 同时是否也放宽 maybeCreates:true？
  选项: (a) 仅 creates；(b) creates + maybeCreates 同时放（一刀清到 track_create）；(c) 不放，留更晚
  推荐: (a) — 单轴更安全；track_create 留 Slice 10，verify 在结构 delta=0 reuse
    路径下"该不该跑/能不能跑"作为下一个 slice 的核心问题独立验证
  ────────────────────────────────────────
  #: D3
  决策项: 放宽 creates:true + fields[] 时，count 形态是否限定？
  选项: (a) 必须数值 >= 1（把 count:"any"+fields 静态拦住，media_import 暂不进 fields）；(b) 任何 count
    都允许（包括 "any"）
  推荐: (a) — count:"any"+fields 的语义（首项 verify / 全项 verify / 跳过）需要单独产品决策；本 slice
  不背
  ────────────────────────────────────────
  #: D4
  决策项: item_duplicate 在 Slice 09 验哪些字段？
  选项: (a) 仅 D_POSITION（来自 params.position，item scope，1 条）；(b) 加 D_LENGTH（来自源 item 的
    D_LENGTH，需"跨实体"verify 模型，新轴）；(c) 加 target track 校验（需"resolve params.track_id 后比对
    GetMediaItemTrack(new_item) 的 GUID"，新轴）
  推荐: (a) — D_POSITION 是 params 直接驱动、单 scope、Slice 06 主路径直接打通；D_LENGTH / track
    都是跨实体推导，应作为"H2 跨实体 verify"独立 packet
  ────────────────────────────────────────
  #: D5
  决策项: D_POSITION 容差
  选项: (a) 1e-6（与 Slice 06/07/08 同口径）；(b) 严格相等 0（D_POSITION 是 set→get 直接回写，REAPER
    不会浮点夹取）
  推荐: (a) — 保留与已有 6 模板同口径；若 live smoke 翻车（哪种 REAPER
    内部夹取/取整）也有余量。若你想顺手测试"严格 0 也能过"，可以在 raw queue 上 ad-hoc 验证一次而不写进
    descriptor

  ---
  7. RISKS & REGRESSION NOTES

  D5 放宽的滑坡风险（Slice 09 最大策略点）

  - 放宽 fields[] + creates:true 之后，剩余三条仍互斥的边界（maybeCreates / deletes / count:"any" /
  region scope）必须仍由静态校验守住，否则后续 PR 把 fields 塞到 media_import 上 → verify
  路径会爆"changed_ids[1] 是 GUID 但只验 1 项 / 漏掉 N-1 项"的隐藏 bug。
  - 缓解：D3 把 count:"any"+fields 静态拦住；scripts/__tests__/manifest-alignment.test.mjs 与
  packages/core/src/__tests__/registry.test.ts 双重覆盖；HANDOFF + KERNEL_HARDENING_PLAN
  注明哪些组合仍未开放，给后续 slice 的 architect 明确边界。

  changed_ids[1] 作为新实体唯一标识的隐式约定

  - item_duplicate handler 当前返回 { changed_ids = { "guid:{NEW-ITEM-GUID}" } }——只有一条。Slice 06 的
  parse_guid_ref(changed_ids[1]) 直接打通。
  - 但未来 maybeCreates 模板（track_create reuse 路径）也走 changed_ids[1]：reuse 命中时 changed_ids[1]
  是已存 track 的 GUID，field verify 读 P_NAME 仍能命中；create 路径下是新 track 的 GUID。形态一致。
  - 未来 count:"any" 模板（media_import）会出现 N 条 changed_ids：仅验证 changed_ids[1] 是部分覆盖。Slice
  11+ 需明确"首项 verify"还是"全项 verify"。本 slice 不背这个决策——D3 静态把它拦住。
  - 缓解：本 slice 在 HANDOFF + KERNEL_HARDENING_PLAN 明确把"changed_ids[1] = 新实体的 GUID"作为 Slice 09
  的契约约定，遗留 maybeCreates 与 count:"any" 的语义讨论到后续 slice。

  item_duplicate 新 item 创建时序

  - handler 在 with_undo 包裹内调 AddMediaItemToTrack(target_track, ...) + SetMediaItemTake_Source(...) +
  SetMediaItemInfo_Value(new_item, "D_POSITION", params.position)，再返回 changed_ids = {
  "guid:{NEW-GUID}" }。
  - with_undo 在 handler 返回后 Undo_EndBlock2。verify 在 Undo_EndBlock2 之后跑——此时新 item 已可见于
  CountMediaItems(0)，GUID 可用 linear scan 找到。Slice 06 已验证此假设（4 个 in-place 模板的 verify 在
  with_undo 之后跑、字段读得到）。
  - 风险：如果 REAPER 在 undo block 提交瞬间瞬间释放新 item 句柄，verify 会读不到。不会发生——REAPER 7 的
  undo block 是逻辑分组，不影响实体生命周期；Slice 04 的结构 verify 已经在 Undo_EndBlock2 后读
  CountMediaItems 并对账，证明新 item 在 verify 时刻已可见。
  - 缓解：live smoke 第 S2/S3 步必须验证 happy 创建后 verify 通过。如果出现"happy 路径却
  VERIFY_FAILED"则需立即停止滚回。

  字段写入的 scope 一致性

  - D_POSITION 是 item 属性（不是 take，不是 track）。FIELD_READERS["item"].read = read_item_field 直接调
  GetMediaItemInfo_Value(handle, field)，与 Slice 06 的 D_POSITION 读法（item_move 模板）字节一致。
  - handler 写 SetMediaItemInfo_Value(new_item, "D_POSITION", params.position)——与 item_move
  写法字节一致。
  - 风险：scope 不一致（写 item 但 verify 读 take）会让 verify 永远 mismatch。本 slice 的 paramPath/scope
  一一与 handler 写入路径对照即可。

  LAST_RESULT 不被字段 verify 失败污染

  - 与 Slice 06/07/08 同口径：item_duplicate 故意 mismatch（S7）→ VERIFY_FAILED → LAST_RESULT.items
  不更新；紧接 item_pitch last_result:item:0 仍指向上一个成功 mutation 的 item GUID（不是这次失败的
  item_duplicate 创建出来的 GUID）。
  - 注意 trap：S7 的故意 raw mismatch 让 handler 成功创建了一个新 item（因为 handler 不读
  expected_delta，只完成自己的工作）。这个新 item 留在 REAPER 项目里、但不进 LAST_RESULT。live smoke 第
  S8 步必须把这个区分验出来。

  wire 字节稳定

  - Slice 06 的 4 模板 wire 字节不变。
  - Slice 07 的 item_trim wire 字节不变。
  - Slice 08 的 item_fade wire 字节不变。
  - 5 个未纳入字段 verify 的模板（track_create / track_rename 之外的 region_create / media_import /
  item_duplicate 之前形态 / render_region）中：
    - item_duplicate wire 在 Slice 09 之后含 fields:[{D_POSITION...}]——这是本 slice 唯一的 wire
  diff，针对单个模板，预期出现。
    - 其余 4 个（region_create / media_import / track_create / render_region）wire 字节稳定。

  static redlines（防 D5 滥用）

  - registry + manifest-alignment 双层守护：见 §5 修订。
  - 新增 lua-structure.test.mjs grep：守护 verify.lua 未引入 region scope reader 或
  parse_region_ref（这是 Slice 12+ 的工作；防止本 slice 漂出 scope 扩展）。
  - HANDOFF / PROGRESS 把"已放开 / 仍互斥"的组合矩阵列清楚，给后续 architect 明确边界。

  error-code constants 不退化

  - 失败路径仍走 errs.VERIFY_FAILED。
  - Slice 05 audit 已 grep reaper/packs/core/**/*.lua；本 slice 不改 Lua，audit 影响为 0。
  - npm run check:error-codes-fresh 必须保持 22 codes。

  REAPER bridge boot 必须 full quit/reopen

  - 本 slice 不改 verify.lua，但 wire 首次出现 creates:true + fields[] 同时出现的 payload。如果旧 chunk
  的 manifest 上 item_duplicate 没有 fields，新 chunk 的 manifest 上有，bridge 启动时是 dofile
  一次，所以靠 Re-Run start_bridge.lua 即可（无 verify.lua 主路径变更）。
  - 但为消除 Slice 04+05+06+07+08 累计的 chunk-stack 不确定性，仍建议 full quit/reopen REAPER，确保
  generation = 1。
  - 验证 console 含 loaded error_codes (22 codes)。

  回归覆盖必查项

  - Slice 06 的 4 happy envelope 字节稳定（item_pitch / item_move / item_rate / track_rename）。
  - Slice 07 item_trim 的两个 happy envelope 字节稳定（length-only + length+start_offset）。
  - Slice 07 item_trim 的 optional 跳过路径仍工作。
  - Slice 08 item_fade 的 4 happy envelope 字节稳定（数值单字段 / 数值双字段 / null 单清 / null 双清）。
  - Slice 04 的结构 verify 失败仍优先于字段 verify。
  - Slice 05 errs.* 接线不退化（item_duplicate selected:99 → ITEM_NOT_FOUND；item_duplicate
  item_id:"selected:0" track_id:"track:DoesNotExist" position:0 → TRACK_NOT_FOUND）。
  - Slice 02 get_state include 仍工作。
  - Slice 01 readonly scope 不污染 LAST_RESULT。
  - render_region 仍跳过任何 verify；changed_ids 仍是绝对路径。
  - Slice 06 的"raw 结构 mismatch 优先于字段 mismatch"仍工作（在 item_duplicate 上重新验一次）。
  - media_import / region_create / track_create 仍无 fields[]（Slice 09 不收它们）。

  ---
  8. IMPLEMENTATION SEQUENCE

  按依赖顺序（每步独立绿测后再走下一步）：

  1. TS schema 修订 — /Users/Zhuanz/Documents/streetlight-reaper-mcp/packages/core/src/registry.ts
    - 修订 validateExpectedDeltaFields：把"fields 与 creates/maybeCreates/deletes 一杆子互斥"改为分流（见
  §5 伪代码）。
    - TDD：先在
  /Users/Zhuanz/Documents/streetlight-reaper-mcp/packages/core/src/__tests__/registry.test.ts 加 6
  个新测试，再写实现。
  2. item_duplicate descriptor —
  /Users/Zhuanz/Documents/streetlight-reaper-mcp/packages/mcp-server/src/templates/item-duplicate.ts
    - 把 expectedDelta = { count:1, creates:true } 扩展为 expectedDelta = { count:1, creates:true,
  fields:[{scope:"item", field:"D_POSITION", paramPath:"position", tolerance:1e-6}] }。
  3. wire 透传验证 — /Users/Zhuanz/Documents/streetlight-reaper-mcp/packages/mcp-server/src/tools/__tests
  __/call-template.test.ts
    - toWireExpectedDelta 不需改（Slice 06 已实现 fields 透传）；只加 2 个测试断言 wire 形态正确。
  4. list_templates 富化 — /Users/Zhuanz/Documents/streetlight-reaper-mcp/packages/mcp-server/src/tools/_
  _tests__/list-templates.test.ts
    - 加 2 个测试：item_duplicate metadata 含 1 条 fields；其他 10 个模板 metadata 字节稳定。
  5. 静态守护扩展 — /Users/Zhuanz/Documents/streetlight-reaper-mcp/scripts/manifest-alignment.mjs +
  /Users/Zhuanz/Documents/streetlight-reaper-mcp/scripts/__tests__/manifest-alignment.test.mjs
    - 与 registry.ts 同口径修订；加 4 个新测试。
  6. lua-structure 防漂 —
  /Users/Zhuanz/Documents/streetlight-reaper-mcp/scripts/__tests__/lua-structure.test.mjs
    - +1 grep 守护：verify.lua 不含 parse_region_ref / scope = "region" / region FIELD_READER（防本 slice
  漂出 scope 扩展）。
  7. 不改 Lua — verify.lua / streetlight_bridge.lua / item.lua / manifest.lua 全部不动。
  8. 静态闸 — 见 §9。
  9. REAPER full quit/reopen → ReaScript: Load → Run — 验证 generation = 1 + loaded error_codes (22
  codes) 行。
  10. Live smoke — 见 §10。
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

  - npm test → 基线 263 + 新增 14–18 之间（≈ 277–281）全绿；若 < 263 视为回归。
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

  generation ≠ 1 或 22 codes 行缺失 → 不通过，回到前置。

  Smoke 步骤（保持 Slice 04/05/06/07/08 的"成功路径 + 故意 mismatch + 多 slice 回归"三轨）：

  1. S0 reachability：ping → bridge:connected, reaper_version=7.71/macOS-arm64。
  2. S1 list_templates：11 模板返回；断言：
    - item_duplicate.expectedDelta 含 {count:1, creates:true, fields:[{scope:"item", field:"D_POSITION",
  paramPath:"position", tolerance:1e-6}]}；不含 optional/nullable。
    - Slice 06/07/08 已纳入的 6 个模板 metadata 字节稳定。
    - track_create.expectedDelta = {count:1, maybeCreates:true}（仍无 fields——Slice 10 才放）。
    - media_import.expectedDelta = {count:"any", creates:true}（仍无 fields——Slice 11+ 才放）。
    - region_create.expectedDelta = {count:1, creates:true}（仍无 fields——Slice 12+ 才放）。
    - render_region 仍无 expectedDelta。
  3. S2 item_duplicate happy 单目标 track：先 track_create name:"Slice09 Live Smoke <ts>"（拿到
  LAST_RESULT.tracks[0]）→ media_import path:"/System/Library/Sounds/Ping.aiff"
  track_id:"last_result:track:0" position:0 在该 track 上放一个源 item（拿到 LAST_RESULT.items[0]）→
  item_duplicate item_id:"last_result:item:0" track_id:"last_result:track:0" position:2.5 → success
  envelope。
    - 断言：changed_count=1，changed_ids 是新 item 的 guid:{...}，与源 item GUID 不同。
    - REAPER 主时间线上 track 上有两个 item，第二个位置 2.5s。
    - verify 端 D_POSITION 在 params.position=2.5 与 readback 2.5 之间通过（容差 1e-6）。这一步是 Slice
  09 的核心新行为验证。
  4. S3 item_duplicate happy 跨 track：再 track_create name:"Slice09 Target <ts>"（拿到
  LAST_RESULT.tracks[0]）→ item_duplicate item_id:"selected:0"（手动在 REAPER 里选中 S2 的源 item，或用
  last_result）track_id:"last_result:track:0" position:0 → success envelope；新 item 落在新 track 的位置
  0s。
    - 注意：S3 之前 LAST_RESULT.tracks 已被 S3 的 track_create 覆盖；S2 的 source item 必须用 selected:0
  或 guid:{...} 显式引用，不能用 last_result:item:0（那已被 S2 的 item_duplicate 覆盖为新 item）。
    - 这一步证明：跨 track 的 item_duplicate 仍 verify 通过；同时也证明 LAST_RESULT 在 Slice 09 之后仍按
  entity_kind 分桶。
  5. S4 Slice 08 回归：item_fade last_result:item:0 fade_in:null → success envelope（注意
  last_result:item:0 现在指向 S3 的新 item）。属性对话框 fade_in length=0；verify 端 D_FADEINLEN
  通过（expected=0），D_FADEOUTLEN skip。
  6. S5 Slice 07 回归：item_trim last_result:item:0 length:1.0 → success envelope；D_LENGTH=1.0
  通过；D_STARTOFFS skip。
  7. S6 Slice 06 回归：抽 2 个 Slice 06 模板（如 item_pitch last_result:item:0 semitones:-3 + item_move
  last_result:item:0 position:5.0），逐个确认 envelope 字节稳定，verify 通过。
  8. S7 字段 mismatch 强制路径（raw queue）：直接往 queue 投 item_duplicate item_id:"<S2 源 item guid>"
  track_id:"<S3 target track guid>" position:7.7，但 wire expected_delta.fields[0].field 改成不存在的
  attr（如 D_POSITIONX）。handler 仍正常 SetMediaItemInfo_Value(new_item, "D_POSITION", 7.7)，但 bridge
  端 verify 读 GetMediaItemInfo_Value(handle, "D_POSITIONX") 不存在的字段——REAPER 7 对未知 attr 返回
  0，与 expected=7.7 不等 → fields verify 失败 → VERIFY_FAILED, recoverable:false,
  details.fields[0].ok=false, details.fields[0].expected=7.7, details.fields[0].actual=0, message 含
  Slice 04 恢复短语字面量。这一步证明 creates+fields 失败路径与 Slice 06 in-place 同形。
  9. S8 LAST_RESULT 未污染验证（创建型语义）：S7 让 handler 真的创建了一个新 item（在 S3 的 target track
  上，位置 7.7s——这是 REAPER 项目里真实可见的副作用），但 LAST_RESULT.items 应该仍指向 S6 的最后一次成功
  mutation 的 item GUID，不是 S7 创建的那个新 item。验证方式：发 item_pitch last_result:item:0
  semitones:0 → 应当作用于 S6 末尾的 item，不作用于 S7 的新 item。然后人工到 REAPER 看：S7 的新 item 的
  pitch 应仍是默认值。这是 Slice 09 的关键守护——VERIFY_FAILED 后 LAST_RESULT 不更新，即使 handler
  真的创建了新实体。
  10. S9 forced expected mismatch（raw queue，单纯数值不对）：raw 发 item_duplicate item_id:"<S2 源 item
  guid>" track_id:"<S3 target track guid>" position:9.9，但 wire
  params.position=9.9，expected_delta.fields[0].paramPath="position" 不变，但 wire params 里把 position
  字段整个抽掉（仅在 expected_delta 里保留 paramPath）。结果：handler 走 Zod 失败 → PARAMS_INVALID（在
  MCP 层就拦住，根本不进 bridge）。这条 path 实际不可达——略过这一步。改成下面一条：

  10. S9 forced expected mismatch（raw queue，paramPath 不在 params 里）：raw 发 item_duplicate
  item_id:"..." track_id:"..." position:9.9，wire params.position=9.9 正常，但
  expected_delta.fields[0].paramPath="positionX"（不存在的 key）。verify 端 params["positionX"] == nil 且
  optional 不为 true → mismatch {expected:"present param", actual:nil} →
  VERIFY_FAILED。这一步守护"paramPath 错位"在 Slice 09 仍按 Slice 06 的 mismatch 路径走。
  11. S10 结构 mismatch 仍优先（Slice 04 回归 + 在 creates 模板上重测）：raw 发 item_duplicate
  item_id:"..." track_id:"..." position:1.1，expected_delta = {count:2, creates:true, fields:[{...}]} →
  handler 创建 1 个 item，结构 verify count expected 2 got 1 失败优先返回，top-level details 不含
  fields（与 Slice 06/07/08 一致）。
  12. S11 error-code constants 回归：
    - item_duplicate item_id:"selected:99" track_id:"<S3 target track guid>" position:0 →
  ITEM_NOT_FOUND（selection 没有 99）。
    - item_duplicate item_id:"<S2 源 item guid>" track_id:"track:DoesNotExist" position:0 →
  TRACK_NOT_FOUND。
    - region_create name:"bad/name" start:0 end:1 → REGION_NAME_INVALID。
  13. S12 get_state include 回归：
    - get_state(tracks, include:["fx"]) → OK；
    - get_state(render, include:["fx"]) → PARAMS_INVALID；
    - get_state(render) → SCOPE_NOT_IMPLEMENTED。
  14. S13 render_region carve-out：region_create name:"slice09-r-<ts>" start:0 end:1 →
  success；render_region region:"slice09-r-<ts>" output_dir:"<临时 dir>" render_pattern:"slice09-r-<ts>"
  → success；临时 dir 含且仅含 .wav，无 .RPP / .RPP-bak。changed_ids 是绝对 WAV 路径。render_region
  仍跳过任何 verify——envelope 字节与 Slice 04/05/06/07/08 同形。临时 render dir 用后必须删干净。
  15. S14 maybeCreates 模板 wire 字节稳定回归：track_create name:"slice09-mc-<ts>" reuse_existing:true
  两次连发——第一次 create 路径，第二次 reuse 路径——两次 envelope 都不含 fields，wire 不含
  fields（track_create 仍是 Slice 04 的 {count:1, maybeCreates:true}，Slice 10 才放
  fields）。第二次返回的 GUID 必须与第一次相同。

  清理：smoke 中创建的 track / item / region 留在 REAPER 项目里由用户手动 Cmd+Z / 删除（沿用 Slice
  04/05/06/07/08 惯例）；任何临时 render dir 必须删干净。S7 的"创建成功但 verify 失败"会留下一个孤儿
  item，在 PROGRESS / 本 packet 的 live smoke evidence 段必须明确点名"S7 副作用：新建一个 item 但不进
  LAST_RESULT；位置 7.7s on target track"，让用户知道这是预期的"creates + verify failure"语义副作用。

  通过判据：S0–S14 全绿，且：

  - S2 / S3 的 happy 路径确实进入 fields verify 且 D_POSITION 通过——这是 Slice 09 核心断言。
  - S7 details 含 fields[0]，结构与本 packet §5 一致；handler 已经把新 item 创建了，但 envelope 是
  VERIFY_FAILED。
  - S8 的 LAST_RESULT 隔离——VERIFY_FAILED 不更新 LAST_RESULT，即使 handler 真的创建了实体；后续
  last_result:item:0 仍指向 S6 末尾的成功 mutation。
  - S9 的 paramPath 错位仍走 Slice 06 的 mismatch 路径（不是新代码路径）。
  - S10 details 不含 fields（结构 mismatch 优先）。
  - S11 / S12 / S13 / S14 wire code 与 Slice 08 之前完全一致。
  - 任何 path 退化为 INTERNAL_ERROR / 错误码字面量泄漏 → 不通过，回滚迁移并复盘。
  - list_templates 11 模板字节稳定，仅 item_duplicate 出现 fields[]——其他 4 个 creates/maybeCreates
  类（track_create / media_import / region_create / render_region）必须仍无 fields。

  ---
  给用户的拍板请求

  请就 D1–D5 拍板（推荐 (a)/(a)/(a)/(a)/(a)），其余按本 packet 推进。Codex 执行；reviewer 只读复核；smoke
  通过后由你决定是否 commit——本 packet 不替你 commit、不 push、不 reset、不 branch。

  针对你 7 个问题的直接答案：

  1. Slice 09 最小安全切片 = item_duplicate（D1=a）。三个候选里它新轴最少：item 同
  entity_kind，GUID-shaped changed_ids 复用 Slice 06 verify 主路径，单 field（D_POSITION）单
  scope，count:1 不引入"any-count"歧义。
  2. 只支持 creates:true + fields[]，不碰 maybeCreates:true（D2=a）。把"放宽 D5"和"verify 在结构 delta=0
  的 reuse 路径下是否仍跑"分两刀做。track_create 留 Slice 10。
  3. bridge 继续用 changed_ids[1] 的 GUID 找新实体——item_duplicate handler 返回的 changed_ids = {
  "guid:{NEW-ITEM-GUID}" } 直接喂给 Slice 06 的 parse_guid_ref(changed_ids[1]) +
  find_item_by_guid(guid)。verify.lua 零修改。这是 Slice 09 能"小到不动 Lua"的关键。
  4. region 没有 GUID → 先避开。region_create 的 changed_ids 是 region:NAME，需要新 parse_region_ref + 新
  FIELD_READERS["region"] + 新 FIELD_CHECK_SCOPES 成员——三个新轴，留 Slice 12+ 单独一刀（建议作为"region
  scope 扩展"独立 packet，与 Slice 09 同形态推进）。
  5. track_create reuse_existing:true 留 Slice 10。技术上 maybeCreates 0-change reuse 路径下 P_NAME
  仍可读、仍等 params.name，verify 自然通过。但作为"放 D5 到 maybeCreates"的代表，应独立一刀验证"结构
  delta=0 时字段 verify 是否跑/能跑/契约怎么写"。
  6. 新增 static redlines（防 D5 滥用）：
    - registry.ts 修订（见 §5 伪代码）：fields + maybeCreates 仍拒；fields + deletes 仍拒；fields +
  creates 必须 numeric count >= 1（拦住 count:"any"）。
    - manifest-alignment.mjs 同口径修订（保持 CLI 与 vitest 校验对齐）。
    - lua-structure.test.mjs grep：verify.lua 未 引入 region scope reader / parse_region_ref（防本 slice
  漂出 scope 扩展）。
    - list-templates 测试：断言其他 4 个 creates/maybeCreates 类模板仍无 fields（防 PR 顺手给
  track_create 加 fields）。
    - HANDOFF + KERNEL_HARDENING_PLAN 把"已放开 / 仍互斥"组合矩阵列清楚。
  7. Live smoke recipe（见 §10）——核心五件事：
    - S2/S3 happy 创建后 verify 通过：D_POSITION readback 与 params.position 在容差内匹配。
    - S7 forced mismatch 返回 VERIFY_FAILED：raw queue 把 field 改成 D_POSITIONX，handler 创建成功但
  verify fail。
    - S8 VERIFY_FAILED 不污染 LAST_RESULT：S7 真的建了一个新 item（用户在 REAPER 里可见），但
  last_result:item:0 仍指向 S6 末尾的 item——这是 creates+VERIFY_FAILED 的关键守护，比 in-place
  难验证因为有真实副作用。
    - S4–S6 / S14 旧模板不回归：Slice 06/07/08 已纳入字段 verify 的 6 个模板逐字节稳定；track_create 的
  maybeCreates 路径仍无 fields。
    - S13 render_region carve-out 不被误纳入：render_region 仍无 expectedDelta，仍跳过
  verify，changed_ids 仍是绝对 WAV 路径。

  最关键的两个决策点：

  - D1：是否 item_duplicate（推荐）vs 其他三个候选。我推荐 item_duplicate——单轴变化，复用 Slice 06
  verify.lua 主路径零修改，把"放 D5"这件事独立验证。
  - D3：是否把 count:"any" + fields[] 也静态拦住。我推荐 拦住——count:"any" 多新建实体下的 verify
  分配语义（首项 / 全项 / 跳过）需要单独产品决策；本 slice 不背。这条规则让 Slice 11+ 收 media_import
  时必须显式回答这个问题，而不是默认就让 "any-count" 进了字段 verify。

  若想换方向：

  - 直接 Slice 09 收 track_create：可以，但等于把"放 D5"和"verify 在 maybeCreates 0-change reuse
  下"两件事一刀做。如你坚持，我会重写 packet 改收 track_create，但请准备好回答"reuse 路径下
  changed_ids[1] 是已存 track GUID，verify 读 P_NAME 是否仍按 params.name
  比对"这个核心契约问题（推荐答案：是，与 create 路径同形）。
  - 直接 Slice 09 收 region_create：不推荐——region scope + 新 ref 形状两个新轴叠加 D5
  放宽，故障定位贵。最起码先做 item_duplicate 把 D5 放宽这件事的"static redline 套件"先在最简形态上验证。
  - H4 idempotency token：请先告知"逻辑操作 = ?"、key 生命周期、BRIDGE_NOT_RUNNING
  命中回放语义这三处决策，我会替换为 H4 packet（决策成本显著更高）。
  - H6 scaffold：仍建议至少先把 H2 字段 verify 推到 ≥9/11 模板再启动（当前 6/11，Slice 09 推到
  7/11）；早做会让 scaffold 吐出半残的 verify 钩子。
  - H3 cursor / 新 scope / H7 socket：v0.2 / 纯性能，与 Slice 09 不冲突；只要不动 5 工具面 /
  信封形态（I1/I3）可以另起 packet 并行。
