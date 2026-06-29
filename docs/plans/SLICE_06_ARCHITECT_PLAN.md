 读完 HANDOFF + PROGRESS + KERNEL_HARDENING_PLAN + KERNEL_HARDENING_EXECUTION 的全部相关段。Slice 05
  已经把 H5 的最后一道社会契约关掉。现在 H1/H5 完结、H3 readonly 部分（Slice 01 + Slice 02 FX
  投影）落地、H2 结构 verify（Slice 04）落地。下面给排序与 Slice 06 packet。

  ---
  候选排序（高→低）

  A. H2 字段级 verify（in-place mutator 子集） ⭐ 推荐

  - 现状缺口：Slice 04 只验证 entity-count 结构 delta；Plan H2
  明示"真正有价值的是字段后置校验（确认写真的落了）"。没有它，"撒谎 handler" 只要保住计数就过。
  - 风险：低-中（只要把 scope 砍到 4 个单字段、单作用域、可由 params 直接推导期望值的 in-place 模板）。
  - 收益：高。把对外讲的"可验证内核"从"我数得清"升级为"我读得回"。
  - 测试难度：中。fake-bridge 已经接 expected_delta；Lua 端读字段是新代码，但只需断言已写入。
  - Live smoke 成本：中（每个 migrated 模板 happy + 故意改坏字段 → VERIFY_FAILED）。
  - 依赖：H5 已完成（errs.* 接线就绪），verify.lua 已存在，可平滑加 check_fields()。

  B. H3 fields/cursor 投影 / 新 scope（如 get_state(items)）

  - v0.2 deferred，无迫切需求；cursor 稳定语义还没定稿。Slice 06 不做。

  C. H4 幂等 token

  - 价值在长链 mutation 链；但要求 client 端定义"逻辑操作 = ?"决策；与 Slice 04 的 VERIFY_FAILED, 
  recoverable:false 形成正反馈（敢放手），但属于 Slice 07+ 优先。

  D. H6 template scaffold

  - 依赖 H2 字段级 verify 落地（生成器要生成 verify 钩子）；现在做属于地基不稳就上盖。先 H2，后 H6。

  E. H7 socket 传输

  - 性能优化，不解锁能力；任意时刻可并行做。Slice 06 不做。

  推荐 Slice 06 = 候选 A：H2 字段级 verify，scope 锁在 4 个 in-place 模板上。一刀小、可测、可
  live-smoke，护城河实质性扩张。

  ---
  Architect Plan Packet — Slice 06

  Codex implementation notes (2026-06-30):
  - `track_rename`'s shipped Zod schema uses `params.name`, not
    `params.new_name`, so the implemented field descriptor is
    `{ field:"P_NAME", scope:"track", paramPath:"name" }`.
  - Existing Slice 04 wire still uses `maybeCreates` camelCase. Slice
    06 only snake-cases the new field descriptor key
    `paramPath -> param_path` for Lua consumption.
  
  GOAL

  把 H2 验证闭环从"结构 delta"升级到"字段后置校验"，但只覆盖 4 个 in-place mutator 的 1 个核心字段：

  ┌──────────────┬───────┬────────────┬──────────────────┐
  │     模板     │ scope │   field    │    param 推导    │
  ├──────────────┼───────┼────────────┼──────────────────┤                             
  │ item_pitch   │ take  │ D_PITCH    │ params.semitones │
  ├──────────────┼───────┼────────────┼──────────────────┤
  │ item_move    │ item  │ D_POSITION │ params.position  │
  ├──────────────┼───────┼────────────┼──────────────────┤
  │ item_rate    │ take  │ D_PLAYRATE │ params.rate      │
  ├──────────────┼───────┼────────────┼──────────────────┤
  │ track_rename │ track │ P_NAME     │ params.new_name  │
  └──────────────┴───────┴────────────┴──────────────────┘

  handler 写完后，bridge 在已有结构 verify 通过之后、finalize_template 之前，按 expectedDelta.fields
  描述符读回字段并与 params 推导值比对。不符即 VERIFY_FAILED，复用现有错误码、recoverability
  与恢复短语，details 形态向后兼容地新增 fields 字段。

  NON-GOALS

  - 不动 5 工具面（I1）。
  - 不改 call_template 锁定信封（I3）：fields verify 失败仍走现有 VERIFY_FAILED
  通道，不在成功路径上塞额外字段。
  - 不做：
    - item_trim（字段条件性 + 跨 scope，留 Slice 07）。
    - item_fade（nullable 三态语义复杂，留 Slice 07）。
    - item_duplicate（多字段复制，留 Slice 07）。
    - track_create（maybeCreates，没有"是否复用"判别后再分支验证的脚手架）。
    - media_import（count:"any"，单个新 item 的字段不可单值推导）。
    - region_create（多字段 + Lua-resolved synthetic handle）。
    - render_region（继续艺术品级 carve-out，无 expectedDelta、跳过字段 verify）。
  - 不改 manifest.lua 元数据形状（undo_flags/entity_kind 等保持 Slice 03 形态）。
  - 不引入新错误码、不重命名错误码、不动 errs.* 接线。
  - 不动 get_state include/fields/cursor schema、不引入 H3 v0.2 字段。
  - 不动 LAST_RESULT 桶结构 / entity_buckets / refs 接口。
  - 不做 idempotency token（H4）、socket（H7）、scaffold（H6）。
  - 不动 recipes/、install.*、setup-out/、scripts/setup.mjs。

  USER-FACING BEHAVIOR

  绿色路径（4 个模板 happy）逐字节不变：locked envelope、changed_ids、changed_count、truncated 都不动。

  新增的 wire 行为只在两种新路径上可见：

  1. 撒谎 handler / 系统真的写错：现在会被 Lua 端读回字段拦截。返回与 Slice 04 同构的
  VERIFY_FAILED，error.details 额外带一个 fields 数组：

  {
    "ok": false,
    "error": {
      "code": "VERIFY_FAILED",
      "message": "Template 'item_pitch' produced delta inconsistent with expectedDelta. ... The mutation 
  has been applied — call get_state to inspect actual state.",
      "recoverable": false,
      "details": {
        "expected": { "count": 1 },
        "actual":   { "items": 1, "tracks": 0, "regions": 0 },
        "changed_count": 1,
        "fields": [
          {
            "field": "D_PITCH",
            "scope": "take",
            "expected": -3,
            "actual": 0,
            "tolerance": 1e-6,
            "ok": false
          }
        ]
      }
    }
  }

  1. 保留 Slice 04 的恢复短语字面量。
  2. list_templates 的 expectedDelta 摘要：4 个模板的 metadata 多了 fields 子结构（见 CONTRACT
  段）。其他模板该字段缺省即不出现（沿用 Slice 03 的 placeholder 省略策略 — 不出现 ≠ null/[]）。

  read-only 路径（get_state/ping/list_templates）不得触碰 LAST_RESULT，沿用 I7。

  FILES LIKELY TO CHANGE

  TypeScript（写）
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/packages/core/src/registry.ts — 扩展 ExpectedDelta
  增加可选 fields?: ReadonlyArray<FieldCheckDescriptor>；新增 FieldCheckDescriptor 类型与
  validateExpectedDelta 对其的校验（详见 CONTRACT 段）。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/packages/core/src/queue.ts — 在 expected_delta wire
  payload 里附带 fields（若 descriptor 声明）。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/packages/mcp-server/src/transport/file-queue.ts —
  同步透传 fields。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/packages/mcp-server/src/tools/call-template.ts —
  同步透传 fields；调用前不做字段层校验（TS 不重复 Lua 校验，I3）。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/packages/mcp-server/src/templates/item-pitch.ts —
  descriptor 增加 expectedDelta.fields = [{ field:"D_PITCH", scope:"take", paramPath:"semitones",  
  tolerance:1e-6 }]。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/packages/mcp-server/src/templates/item-move.ts —
  同上，{ field:"D_POSITION", scope:"item", paramPath:"position", tolerance:1e-6 }。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/packages/mcp-server/src/templates/item-rate.ts —
  同上，{ field:"D_PLAYRATE", scope:"take", paramPath:"rate", tolerance:1e-6 }。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/packages/mcp-server/src/templates/track-rename.ts —
  同上，{ field:"P_NAME", scope:"track", paramPath:"name" }（无 tolerance，字符串 ===）。
  - 其他 6 个模板 descriptor 不动（保持 Slice 04 形态，expectedDelta 不含 fields）。

  Lua（写）
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/reaper/packs/core/verify.lua — 新增
  M.check_fields(expected_delta, changed_ids, params, json_null)。
    - 不消费 token；只在 expected_delta.fields 存在且 changed_ids 非空时启动。
    - 仅按 entity_kind + scope 读 changed_ids 第 0 项的字段（v0.1 in-place mutator 只动一个实体）。
    - take scope：解析 item GUID → GetMediaItem_Take_* 链 → GetActiveTake → GetMediaItemTakeInfo_Value。
    - item scope：解析 item GUID → GetMediaItemInfo_Value。 
    - track scope：解析 track GUID → GetMediaTrackInfo_Value (numeric) / GetSetMediaTrackInfo_String
  (string)。
    - tolerance 缺省视为绝对相等（用于 P_NAME 等字符串）。
    - 任一 field 不符即返回 false, errs.VERIFY_FAILED, msg, details_fields_table。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/reaper/streetlight_bridge.lua — 在 DISPATCH.template
  成功路径上，结构 verify 通过之后、finalize_template 之前调用 verify.check_fields。失败时把 details 合并
  { expected, actual, changed_count, fields } 一并返回，沿用 Slice 04 的 message 模板（含恢复短语）。
  - reaper/packs/core/refs.lua — 不动（changed_ids 已是 GUID 形态，bridge 自带 entity_kind 信息，不需要新
  resolver）。
  - error_codes.lua / manifest.lua / entity_buckets.lua / names.lua / json.lua / undo.lua — 不动。

  Scripts（写）
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/scripts/manifest-alignment.mjs — 扩展校验：若
  descriptor 有 expectedDelta.fields，每条必须有 field/scope/paramPath；scope ∈ {take,item,track}；同模板
  fields 不允许重复 (scope,field)。tolerance 非负 number 或省略。该校验仅静态；不模拟 REAPER。

  Tests（写）
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/packages/core/src/__tests__/registry.test.ts — +N:
  拒绝 fields 非法形状（缺字段、未知 scope、负 tolerance、(scope,field) 重复）。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/packages/mcp-server/src/tools/__tests__/call-template.
  test.ts — +4: 4 个模板各断言 wire payload expected_delta.fields 形状（保持 Slice 04 模板的 wire
  断言风格）。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/packages/mcp-server/src/tools/__tests__/list-templates
  .test.ts — +N: 4 个模板的 list_templates 输出包含 fields，其他 7 个不含。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/scripts/__tests__/manifest-alignment.test.mjs — +N:
  静态校验 fields 形状。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/scripts/__tests__/lua-structure.test.mjs — +N:
  verify.lua 暴露 check_fields；streetlight_bridge.lua 在成功路径上调用顺序为 check_counts → check_fields
  → finalize_template；fields 失败不写 LAST_RESULT（结构守护，不跑真 REAPER）。

  Docs（写）
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/docs/plans/SLICE_06_ARCHITECT_PLAN.md — 本 packet
  落盘。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/docs/HANDOFF.md — live edge 切到 Slice 06；保留 Slice
  05 全部 decisions；append Slice 06 decisions（D1–D4 见下）。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/docs/PROGRESS.md — Slice 06 段（scope / what changed /
  verification / live smoke evidence 占位）。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/docs/TEMPLATE_SPEC.md — 在 "Runtime Structural
  Verification (Slice 04)" 之后追加 "Field-level Verification (Slice 06)" 子节，明示：只对 4 个 in-place
  mutator 启用；scope/api/tolerance 表；其余 7 个模板字段 verify 暂留 Slice 07+。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/docs/RESPONSE_BUDGET.md — VERIFY_FAILED details (Slice
  04) 子节追加：details.fields[] 形态、上限 size 估算（≤ 256 bytes/field，4 个模板 v0.1 每次只读 1
  字段，单次 details 不超 64 字节增量）。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/docs/plans/KERNEL_HARDENING_PLAN.md § H2 — 注："字段级
  verify Slice 06 落地 4 模板的子集；其余 7 模板留 Slice 07+"。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/docs/plans/KERNEL_HARDENING_EXECUTION.md § H2 — 同上 +
  §0.2 重载协议条目追加："Slice 06 改了 verify 主路径，必须 full quit/reopen REAPER"。

  Files NOT touched（明确禁碰）

  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/packages/core/src/errors.ts — 错误码集合稳定；只复用
  VERIFY_FAILED。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/packages/core/src/{result,risk,types,refs}.ts — 不动。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/packages/mcp-server/src/index.ts — 不动工具面 / Zod
  schema。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/packages/mcp-server/src/tools/{get-state,list-template
  s,list-recipes,ping}.ts — 不动。
  - 7 个不纳入 Slice 06 的模板 TS 文件保持 Slice 04 现状。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/reaper/packs/core/{manifest,refs,undo,entity_buckets,n
  ames,json,error_codes}.lua — 不动。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/reaper/packs/core/templates/*.lua — handler 
  不改（Slice 06 是 bridge-side verify 增强，不改写入路径）。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/scripts/error-codes.mjs — 不动 audit 形态。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/scripts/setup.mjs、install.*、setup-out/ — 不动。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/recipes/*.yaml — 不动。

  CONTRACT / SCHEMA / ERROR-CODE CHANGES

  TS — ExpectedDelta v2（向后兼容扩展）

  // packages/core/src/registry.ts
  type FieldCheckDescriptor = {
    field: string;          // REAPER attr name, e.g. "D_PITCH" / "P_NAME"
    scope: "take" | "item" | "track";
    paramPath: string;      // dot-free key in params, e.g. "semitones"
    tolerance?: number;     // non-negative finite; absent → strict equality
  };

  type ExpectedDelta = {
    count: number | "any";
    creates?: boolean;
    maybeCreates?: boolean;
    deletes?: boolean;
    fields?: ReadonlyArray<FieldCheckDescriptor>;  // ← Slice 06 新增
  };

  validateExpectedDelta 新增检查：
  - fields 缺省时一切如旧（向后兼容）。
  - fields 非空时每条必须有 field/scope/paramPath 三键；scope ∈ {take,item,track}；tolerance
  若存在必须有限非负。
  - 同一 descriptor 内 (scope,field) 唯一。
  - fields 与 count:"any" 兼容；但 v0.1 只在 4 个 count:1 in-place 模板里使用，留
  maybeCreates/creates/deletes 与 fields 的互斥放宽到 Slice 07。Slice 06 静态拒绝：fields 出现时不允许
  creates/maybeCreates/deletes 任一为 true（即仅允许 in-place）。

  Wire 协议

  call_template → bridge 的 expected_delta JSON 多一个 fields 数组（缺省即省略，保持 wire 字节稳定）：

  "expected_delta": {
    "count": 1,
    "fields": [
      {
        "field": "D_PITCH",
        "scope": "take",
        "param_path": "semitones",                                                     
        "tolerance": 1e-6
      }
    ]
  }

  TS 侧 camelCase → wire snake_case：Slice 06 新增字段使用 paramPath → param_path。既有 Slice 04
  maybeCreates wire 形态保持 camelCase，不在本刀翻案。

  VERIFY_FAILED 错误码
  
  不新增错误码。复用 errs.VERIFY_FAILED（recoverable:false）。message 保留 Slice 04 文案；fields verify
  失败时拼接 1 句字段差异概述（"D_PITCH expected -3, actual 0"），随后接 Slice 04 恢复短语字面量。

  error.details 形态向后兼容追加 fields 数组（Slice 04 没有 fields 字段时即省略，沿用现有形态）：

  "details": {
    "expected":       { "count": 1 },
    "actual":         { "items": 1, "tracks": 0, "regions": 0 },
    "changed_count":  1,
    "fields": [
      { "field":"D_PITCH", "scope":"take", "expected":-3, "actual":0, "tolerance":1e-6, "ok":false }
    ]
  }

  details.fields[] 上限：v0.1 单字段，Slice 06 一次最多 1 条；预留多字段空间（Slice 07）。

  DECISIONS FOR USER

  ┌─────┬─────────────────────┬─────────────────────────────────────────────────┬───────────────────┐
  决策项: 本 slice 收哪 4 个模板                     
  选项: (a) item_pitch / item_move / item_rate / track_rename；(b) 加 item_trim 的
    D_LENGTH（条件字段，scope 复杂度↑）；(c) 减到只做 item_pitch + track_rename 探路                
  推荐: (a)
  ────────────────────────────────────────
  #: D2 
  决策项: 浮点 tolerance 默认
  选项: (a) 1e-6（write-back 通常精确）；(b) 1e-9（更严）；(c) 1e-4（更宽，给 D_PLAYRATE
    内部归一化留余量）
  推荐: (a) 1e-6；若 D_PLAYRATE 在 live smoke 翻车再放宽到 1e-4                 
  ────────────────────────────────────────                                      
  #: D3
  决策项: wire 协议 fields 是否内嵌在 expected_delta 还是 top-level             
  选项: (a) 内嵌（一处声明、一处消费）；(b) top-level（与 count delta 解耦）    
  推荐: (a) 内嵌
  ────────────────────────────────────────                                      
  #: D4
  决策项: 字段 verify 失败时是否仍尝试更新 LAST_RESULT                          
  选项: (a) 不更新（与 Slice 04 结构失败一致，强保持 I7 + agent 必须 get_state）；(b) 更新（让 agent
    能继续用 last_result:N）
  推荐: (a) 不更新。理由：与 Slice 04 一致；若字段没写正确，LAST_RESULT 是脏值，agent 链式调用更危险
  ────────────────────────────────────────
  #: D5
  决策项: validateExpectedDelta 是否 Slice 06 就放开 fields 与 creates/maybeCreates/deletes 共存
  选项: (a) 静态拒绝（强约束，留 Slice 07 再放）；(b) 静态允许，Slice 06 暂不消费
  推荐: (a) 静态拒绝                                                                   

  RISKS & REGRESSION NOTES

  字段读取的 scope 坑（Plan Execution §H2 已警告）
  - pitch/rate 是 take 属性；位置/长度/fade 是 item 属性；名字是 track 属性。verify.lua 读字段时必须按
  scope 走对 API。错配会导致恒为 default 值的 false-positive VERIFY_FAILED。
  - 缓解：verify.lua 把 scope→API 的映射写死成查表；lua-structure 测试断言查表完整。

  Lua handler 不改 → 但 verify 在 handler 之后跑
  - 不改 handler 代码，但 verify.lua 读 take/item/track 字段时如果 handler 已经清空了 active
  take（理论上不会，但 paranoia 一下），会拿到 nil → 视为 mismatch。
  - 缓解：fields verify 在 with_undo 块外、finalize_template 之前执行；与 Slice 04 结构 verify 同位点。

  浮点容差
  - D_PITCH = -3 写入后 REAPER 读回是否仍为 -3.0？经验上是；但 D_PLAYRATE = 0.5 写入后可能被 REAPER 内部
  clamp/normalize 到 0.49999...。
  - 缓解：tolerance 1e-6 默认；live smoke 第一次跑就观察是否需要放宽。决策 D2 保留 fallback。

  回归点（必查）
  - LAST_RESULT 不被字段 verify 失败污染（与 Slice 04 同口径）：track_rename 写错 → 失败 → 紧接
  track_rename last_result:track:N 仍指向上一个成功的 GUID。
  - expectedDelta 结构 verify 仍生效：4 个模板的 count 失败优先于 fields 失败（执行顺序 check_counts →
  check_fields）。
  - error-code constants 不退化：fields verify 失败路径仍走 errs.VERIFY_FAILED；scripts/error-codes.mjs
  audit 应自动覆盖到 verify.lua 的新代码（Slice 05 已经 grep reaper/packs/core/**/*.lua，verify.lua
  在路径内）。
  - get_state include/fields/cursor：不动。Slice 02 的 get_state(tracks, include:["fx"])
  行为保留，get_state(render, include:["fx"]) = PARAMS_INVALID 优先级保留。
  - render_region 沿用 Slice 04：跳过结构 verify，跳过字段 verify；changed_ids 仍是绝对路径。
  - 7 个未纳入模板（item_trim/item_fade/item_duplicate/track_create/media_import/region_create/render_reg
  ion）的 wire payload expected_delta 不含 fields，整条 expectedDelta 字节稳定。
  - REAPER bridge boot path：本 slice 没改 boot 顺序（dofile 链与 Slice 05 一致），但改了
  DISPATCH.template 成功路径，必须 full quit/reopen REAPER 加载新 bridge；仅 Run 不够，旧 chunk 的
  reaper.defer 还在用 Slice 05 的 verify 路径。
  - wire 字节稳定：4 个模板的成功 envelope（{template, changed_count, changed_ids, 
  truncated}）逐字节不变；失败 envelope 仅在故意制造 mismatch 路径上扩张。
  - list_templates 字节：4 个模板的 metadata 新增 expectedDelta.fields[]；agent 端 transcript 会有
  diff，但 Slice 03 已经明示 metadata 可富化（H5），属于内核硬化预期 surface。

  IMPLEMENTATION SEQUENCE

  按依赖顺序（每一步可单独绿测过再走下一步）：

  1. TS schema 扩展（packages/core/src/registry.ts）
    - 加 FieldCheckDescriptor 类型。
    - 扩展 ExpectedDelta。
    - 扩展 validateExpectedDelta：fields 形状 + 互斥规则（D5）。
    - 跑 packages/core/src/__tests__/registry.test.ts，先新增"非法 fields 拒绝"测试，再写实现，TDD。
  2. wire 透传（queue.ts / file-queue.ts / call-template.ts）
    - 4 个 in-place 模板 descriptor 加 expectedDelta.fields。
    - 单测断言 wire payload expected_delta.fields。
  3. list_templates 富化
    - list-templates.test.ts +N。
  4. 静态守护
    - scripts/manifest-alignment.mjs 扩展校验。
    - scripts/__tests__/manifest-alignment.test.mjs +N。
  5. Lua verify.lua 增强
    - 加 M.check_fields + scope→API 查表。
    - scripts/__tests__/lua-structure.test.mjs +N（结构守护，断言 bridge 调用顺序）。
  6. bridge dispatch
    - streetlight_bridge.lua 在结构 verify 通过后调 check_fields，失败合并 details。
  7. 静态闸
    - npm test 全绿（基线 248 → 248 + Slice 06 新增 N，N 应在 8–15 之间；超出审视是否过测）。
    - npm run build clean。
    - npm run check:manifest 绿。
    - npm run check:error-codes-fresh 绿（含 audit）。
    - git diff --check clean。
  8. REAPER full quit/reopen → ReaScript: Load → Run
    - console 必须仍含 loaded error_codes (22 codes)，generation 1。
  9. Live smoke（见下）

  STATIC VERIFICATION

  绝对路径命令（直接 copy 给 Codex）：

  cd /Users/Zhuanz/Documents/streetlight-reaper-mcp                                    
  npm test
  npm run build                                                                        
  npm run check:manifest
  npm run check:error-codes-fresh
  git -C /Users/Zhuanz/Documents/streetlight-reaper-mcp diff --check

  通过判据：
  - npm test → 256/256 ± 7 绿（基线 248 + 新增）；若 < 248 视为回归，立即排查。        
  - npm run build → 0 报错（pre-existing TS6310 噪声可忽略）。
  - npm run check:manifest → Streetlight manifest alignment ok (11 templates).，新静态规则不报错。
  - npm run check:error-codes-fresh → Streetlight error codes fresh (22 codes). + zero forbidden literal
  usage（Slice 05 audit 应自动覆盖新增 verify.lua 行）。
  - git diff --check → 无空白错误。

  LIVE SMOKE PLAN

  前置（必须）：用户完全退出 REAPER 进程，重开 → Actions → Show action list → ReaScript: Load… → 选
  start_bridge.lua → Run。console 必须有：

  [streetlight] loaded error_codes (22 codes)
  bridge ready (generation 1) — loaded error_codes (22 codes) — templates: …

  generation ≠ 1 或 22 codes 行缺失 → 不通过，回到前置。

  Smoke 步骤（保持 Slice 04/05 的"成功路径 + 故意 mismatch"双轨）：

  1. S0 reachability: ping → bridge: connected，reaper_version=7.71/macOS-arm64。
  2. S1 list_templates: 11 模板返回；断言 4 个 in-place 模板的 metadata 含 expectedDelta.fields；其余 7
  个不含。
  3. S2 item_pitch happy: 选 1 item → item_pitch semitones:-3 → 成功 envelope；REAPER 属性对话框 D_PITCH
  = -3.000；get_state(items) 不污染 LAST_RESULT（Slice 04 风格）。
  4. S3 item_move happy: item_move position:5.0 on last_result:item:0 → 成功 envelope；属性对话框
  position = 5.000。
  5. S4 item_rate happy: item_rate rate:0.5 on last_result:item:0 → 成功 envelope；属性对话框 D_PLAYRATE
  = 0.500。若失败因 tolerance 太严，落 D2 fallback 1e-4。
  6. S5 track_rename happy: 选 / 创建 track → track_rename new_name:"smoke06-1782800000000" → 成功
  envelope；TCP 中可见新名字。
  7. S6 字段 mismatch 强制路径（raw queue）：直接往 queue 投一个 track_rename，但
  expected_delta.fields[0].field 改成不存在的 attr（如 P_NAMEX），handler 仍正常写
  P_NAME。结果应为：bridge 读 P_NAMEX 取不到 → fields verify 失败 → VERIFY_FAILED, 
  recoverable:false，details 含 fields[0].ok=false，message 包含恢复短语。LAST_RESULT.tracks 
  不被更新（连发 track_rename last_result:track:0 仍指向上一个成功的 GUID）。
  8. S7 结构 mismatch 仍生效（Slice 04 回归）：raw queue 发 item_pitch expected_delta={count:1, 
  creates:true} → 仍走结构 verify 失败路径，不应进入 fields verify（因为结构先 fail）。details 形态与
  Slice 04 byte-stable（fields 字段缺省）。
  9. S8 expectedDelta 缺省回归：render_region（不带 expectedDelta）继续工作；item_fade / item_duplicate /
  track_create / media_import / region_create / item_trim 任挑 1–2 个做 happy 路径，确认未纳入 Slice 06
  的模板未被波及。
  10. S9 error-code constants 回归：跑一条 item_pitch selected:99 → 仍是 ITEM_NOT_FOUND, 
  recoverable:true；跑一条 region_create name:"a/b" → 仍是 REGION_NAME_INVALID。Slice 05 的 errs.*
  接线应未被破坏。
  11. S10 get_state include 回归：get_state(tracks, include:["fx"]) 仍工作；get_state(render, 
  include:["fx"]) 仍是 PARAMS_INVALID（include 校验优先）；get_state(render) 仍是 SCOPE_NOT_IMPLEMENTED。

  清理：smoke 中创建的 track / item / region 留在 REAPER 项目里由用户手动 Cmd+Z / 删除（沿用 Slice 04/05
  惯例）；任何临时 render dir 必须删干净。

  通过判据：S0–S10 全绿，且：
  - 4 个 happy envelope 与 Slice 05 之前逐字节相同。
  - S6 details 含 fields[0]，结构与本 packet CONTRACT 段一致。
  - S7 details 不含 fields（向后兼容验证）。 
  - S9/S10 wire code 与 Slice 05 之前完全一致。
  - 任何 path 退化为 INTERNAL_ERROR / 错误码字面量泄漏 → 不通过，回滚迁移并复盘。

  ---
  给用户的拍板请求

  工作流约束：本 packet 仅计划；Codex 执行；reviewer 只读复核；用户拍板 D1–D5 + 通过 acceptance smoke
  后再决定是否 commit。不 commit、不 push、不 reset、不 branch。

  若想换方向（H4 幂等 token / H3 cursor / H6 scaffold），请告知，我会替换为对应 packet——但要预期更高的
  test surface（H6）或更高的 product 决策成本（H4 需定义"逻辑操作 = ?"）。

✻ Baked for 5m 5s

─────────────────────────────────────────────────────────────────────────────────────────────────────────
❯   
─────────────────────────────────────────────────────────────────────────────────────────────────────────
                                                                                       98% context used

