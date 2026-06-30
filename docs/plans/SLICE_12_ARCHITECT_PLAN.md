我已经把 HANDOFF / PROGRESS / KERNEL_HARDENING_PLAN/EXECUTION / TEMPLATE_SPEC
  / RESPONSE_BUDGET / SLICE_11 packet / verify.lua / refs.lua / region.lua /
  region-create.ts / registry.ts / manifest-alignment.mjs 都读完了。下面是 Slice
  12 的 Architect Plan Packet。

  ---
  Slice 12 Architect Plan Packet — region_create first-name-shaped-ref field 
  verification (region scope)

  ▎ 工作流约束（重申）：我是 Architect，只做计划。**不写代码、不 commit、不 
  ▎ push、不 reset、不 branch。**所有路径用绝对路径；本 slice 改 Lua（verify.lua
  ▎ 新增 region 解析 + region scope reader）+ TS 静态校验 + region_create 
  ▎ 描述符。wire 首次出现 creates:true + region scope + fields[] 同时出现的 
  ▎ payload，所以 live smoke 必须 full quit/reopen REAPER，重新 Run 
  ▎ start_bridge.lua（generation 必须 = 1，console 含 loaded error_codes (22 
  ▎ codes)）。

  ---
  候选排序（高 → 低）— 风险/收益/可测性重评

  A. region_create 仅验 region name 字段（first-name-shaped-ref verify） ⭐ 推荐

  H2 覆盖 9/11 → 10/11，把"剩余两个未纳入"中唯一可纳入的吃掉（render_region
  是永久 carve-out）。
  - 本次唯一新轴：region scope —— verify.lua 加
  parse_region_ref(changed_ids[1])、FIELD_READERS["region"]、FIELD_CHECK_SCOPES
  扩到 4 元素。
  - 故意只验 1 个字段（name），避开 region_create 两 mode 的 paramPath
  难题（见候选 B），把"region scope 落地"和"bounds 字段验证"拆为两 slice。
  - name 字段在 v0.1 是结构性永真（与 Slice 10 track_create 的 reuse-path P_NAME
  verify 同口径）：handler 用 params.name 创建 region，verify 再读回；这个
  slice 的"verify 通过"= 整条 region 管线（changed_ids 形态 → ref 解析 → reader
  读字段 → 字符串比对）都活着，不是新的语义断言。把这条契约写进
  docs/TEMPLATE_SPEC.md，与 Slice 10 同口径声明 "pipeline proof-of-life"。
  - mismatch 路径仍可测：raw-queue 把 field:"name" 改成 field:"nameX"（不存在）→
  region reader 必失败 → VERIFY_FAILED + details.fields[]。raw-queue 把
  paramPath:"name" 改成 paramPath:"nameX"（params 没这个 key）→ Slice 06
  mismatch 路径仍工作。 
  - 故障定位：region scope 是本次唯一新轴，verify.lua 改动可机械化（加 30~50
  行：1 个 parse 函数 + 1 个 reader + 1 个 scope 注册）。
  - VERIFY_FAILED orphan 形态：与 Slice 09–11 同形——handler 已 AddProjectMarker2
  创建了 region，verify 失败后 LAST_RESULT 不更新，留 1 个 orphan region
  在工程里。

  B. region_create 同时验 name + start + end

  需要解决两 mode（explicit {name, start, end} vs item-mode {name, item_id}）下
  paramPath 的不对称：
  - item-mode 下 params 里 没有 start / end —— 如果用 Slice 07 optional:true
  跳过，等于 "item-mode 完全没 bounds verify"，那就别 declare。
  - 如果用 optional:true 让 explicit mode 验 / item-mode 跳，那就是把 "two-mode
  descriptor 的 conditional field" 引入 v0.1 —— 与 Slice 07 单 optional
  语义不同（Slice 07 是 "caller 自由选填"，这里是 "schema 强制 XOR
  导致字段成对出现/缺席"）。需要先决策这是否新轴。
  - 折中：仍 optional:true，但文档明确 "Slice 12 下 item-mode 区域只验证
  name；start/end verify 仅在 explicit mode 工作"。但这会让 item-mode 的 verify
  在 paramPath verification 上失语。
  - 故障面增大：还要给 region reader 加 pos / rgnend 字段读取（synthetic struct
  是 {index, pos, rgnend, name}，本来都在 handle 里，实现并不贵，但与 D2 
  决策耦合）。

  → 推荐把 bounds verify 留 Slice 13（独立 packet，绑定 "two-mode optional field
  在 v0.1 的语义"产品决策）。Slice 12 只做 name，把 region scope 打通即可。

  C. region_create + 引入"region 自有 GUID"虚拟标识

  为消除 region 没有 GUID 的尴尬，自己 mint synthetic GUID 缓存到 region 名（或
  user-data）。
  - 严重违反 v0.1 "region identity = name" 锁定决策（HANDOFF 多处明示 + REAPER 7
  无 region GUID API）。
  - 把 region rename 这条尚未实现的能力的契约提前定死。
  - 拒。

  D. 跳过 region，直接转 H4 / H6 / H7

  H2 现在 9/11；区域是最后一个能被 H2 吃掉的核心模板。H6 scaffold
  的"≥9/11"门槛已达，但 H6 启动前补完 H2 region scope 是更整齐的"先把 H2
  收齐"路径——region scope 一旦落地，H6 scaffold 出来的"区域类新模板"立刻能复用
  region reader / FIELD_READERS["region"]。H4 idempotency 独立 packet
  路径稳定，可在 Slice 12 后再起。

  → 结论：Slice 12 = region_create name-only field verify + region scope 
  打通。把"D5 三大边界（creates+数值 / maybeCreates+数值 /
  creates+'any'）已全部放开 + 新增 region scope"作为 v0.1 H2
  收口的最后一刀。bounds 留 Slice 13。

  ---
  1. Goal

  把 H2 字段 verify 从 9 个模板扩到 10 个，新纳入 region_create；首次允许
  expectedDelta.fields[].scope = "region"，同时让 verify.lua 的 first-changed-id
  解析器接受 region:NAME 形 ref（仅当 field scope 是 "region"）。这是 H2 在
  v0.1 的 最后一刀（11 个模板剩 render_region 是永久 carve-out）。

  region_create 落地一条字段 check：

  ┌──────────────┬───────┬──────┬──────────┬─────────┬─────────┬──────────┐
  │     模板     │ scope │ fiel │ paramPat │ optiona │ nullabl │ toleranc │
  │              │       │  d   │    h     │    l    │    e    │    e     │
  ├──────────────┼───────┼──────┼──────────┼─────────┼─────────┼──────────┤
  │ region_creat │ regio │ name │ name     │ (none)  │ (none)  │ (none —  │
  │ e            │ n     │      │          │         │         │ 字符串)  │
  └──────────────┴───────┴──────┴──────────┴─────────┴─────────┴──────────┘

  执行路径（见 §5 伪代码）：
  1. verify.lua: parse_changed_ref(changed_ids[1], scope) —— 当 scope == 
  "region" 走 ^region:(.+)$ 匹配；当其他 scope 仍走 ^guid:(%b{})$（不退化）。
  2. FIELD_READERS["region"] 新增：entity_kind = "region"，resolve = 
  find_region_by_name(name)（线性扫 EnumProjectMarkers3，与 refs.lua 
  resolve_region_name 同算法但只为 verify 用），read = read_region_field(handle,
  field)（synthetic handle { index, pos, rgnend, name }；本 slice 只读 name，但
  reader 一次性写好支持 name/pos/rgnend 以便 Slice 13）。
  3. FIELD_CHECK_SCOPES 在 TS（packages/core/src/registry.ts）+
  manifest-alignment（scripts/manifest-alignment.mjs）+ Lua（verify.lua 隐含通过
  FIELD_READERS）三处同步扩到 {take, item, track, region}。
  4. region_create.expectedDelta 从 {count:1, creates:true} 扩为 {count:1, 
  creates:true, fields:[{scope:"region", field:"name", paramPath:"name"}]}。无
  tolerance、无 optional、无 nullable。

  H2 覆盖率：9/11 → 10/11。剩 render_region（永久 carve-out，无
  expectedDelta）。

  ---
  2. Non-goals

  - 不动 5 工具面（I1）、不动 call_template 
  成功信封（I3）、不引入新错误码（继续走 errs.VERIFY_FAILED）。
  - 不放开 fields[] + deletes:true（v0.1 无 deletes 模板，规则保留）。
  - 不放开 region GUID ref（REAPER 7 无 region GUID API；refs.lua resolve_region
  仍返 REF_INVALID + "regions don't support GUID refs in v0.1"）。
  - 不动 region_create handler（reaper/packs/core/templates/region.lua 不改一行
  —— 仍 changed_ids = { "region:" .. params.name }，仍 REGION_NAME_INVALID /
  REGION_NAME_TAKEN 域错误码、仍 explicit/item-mode XOR）。
  - 不验 region bounds（pos / rgnend） —— 即使 reader 一次写好支持，本 slice
  descriptor 只 declare 1 个 name 字段。两 mode 下 paramPath 的不对称 + bounds
  verify 的产品决策留 Slice 13 独立 packet。
  - 不动 refs.lua（resolve_region_name / resolve_last_result_region / 跨类型
  REF_INVALID 全保留；verify 的 region reader 是 verify.lua 内部副本，与 refs
  解耦避免互相污染调用语义）。
  - 不动 streetlight_bridge.lua 的 check_counts → check_fields → 
  finalize_template 调用顺序（仅 verify.check_fields 内部分发逻辑改）。
  - 不引入"all-items verify" —— Slice 11 first-item verify 契约保持（count:"any"
  模板仍只验 changed_ids[1]；region_create 是 count:1，自然只有 1 个
  changed_id）。
  - 不引入"per-item fields" descriptor 字段。
  - 不动 9 个已纳入 fields verify 的模板（item_pitch / item_move / item_rate /
  track_rename / item_trim / item_fade / item_duplicate / track_create /
  media_import）—— Slice 06–11 字节稳定。
  - *不动 LAST_RESULT 桶结构、entity_buckets、ENTITY_BUCKET（H1 
  完整保留）、error_codes.lua、manifest.lua、recipes/、scripts/setup.mjs、instal
  l.、setup-out/`。
  - 不做 H4 idempotency token、H6 scaffold、H7 socket。

  ---
  3. User-facing behavior
  
  - Slice 06–11 已覆盖 9 个模板的 happy envelope 逐字节不变（含 media_import /
  track_create reuse / item_fade 4 路径 / item_trim 2 路径）。
  - region_create happy envelope 逐字节不变（仍是锁定 { template, changed_count,
  changed_ids, truncated }；changed_ids = ["region:<name>"]；changed_count = 
  1；truncated = false）。
  - 新增 wire / 语义只在四类路径上可见：
    - a. list_templates metadata：region_create.expectedDelta.fields[] 含 1 条
  {scope:"region", field:"name", paramPath:"name"}；不含
  tolerance、optional、nullable。其他 10 个模板 metadata 字节稳定（含 9 个已纳入
  fields + render_region 仍无 expectedDelta）。
    - b. wire 首次同时出现 creates:true + count:1 + 
  fields[scope="region"]：call_template region_create 的 wire payload 现在含
  expected_delta:{count:1, creates:true, fields:[{scope:"region", field:"name", 
  param_path:"name"}]}。这是 Slice 12 唯一的 wire diff，针对单个模板，预期出现。
    - c. region scope verify 真实执行：handler 成功创建 region 后，bridge
  重读首个 region 的 name（按 parse_changed_ref(changed_ids[1], "region") →
  find_region_by_name(name) → read_region_field(handle, "name")），与
  params.name 字符串严格相等比较。N=1 = 完全 verify（structurally 永真但
  pipeline proof-of-life）。
    - d. mismatch 路径：raw-queue 改 field:"nameX" → reader 返回 unknown →
  VERIFY_FAILED + recoverable:false + details.fields[]。raw-queue 改
  paramPath:"nameX" → params 无此 key → Slice 06 mismatch 路径仍工作（"present
  param" expected vs nil actual）。raw-queue 改 params.name 与 wire
  changed_ids[1] 区域名不一致（理论上 handler 会用 params.name 创建，但
  raw-queue 可以伪造一致结构来制造 VERIFY_FAILED）→ details.fields[] 含
  expected/actual 字符串。
    - e. structural mismatch 优先级：raw-queue 给 region_create 发
  expected_delta:{count:2, creates:true, fields:[...]} → handler 只创建 1 个
  region → Slice 04 结构 verify 先返 VERIFY_FAILED，details 不含 fields[]（与
  Slice 06–11 一致）。这是首次在 region scope 上验证此优先级。
  - read-only 路径（ping / get_state / list_templates / list_recipes）继续不触碰
  LAST_RESULT（I7）。

  ---
  4. Files likely to change

  TypeScript（写）

  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/packages/core/src/registry.ts
    - FIELD_CHECK_SCOPES：从 {"take","item","track"} 扩到
  {"take","item","track","region"}。
    - validateExpectedDeltaFields 其余规则不动（duplicate / 负 tolerance /
  dotted paramPath / boolean optional / boolean nullable / all-optional iff
  all-nullable / Slice 09–11 的 D5 矩阵）。
    - ExpectedDelta / FieldCheckDescriptor 类型形态不变（scope: "take" | "item" 
  | "track" 改为 "take" | "item" | "track" | "region"）。
    - toMetadata 不动。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/packages/mcp-server/src/templ
  ates/region-create.ts
    - descriptor 加 expectedDelta = { count: 1, creates: true, fields: [{ scope:
  "region", field: "name", paramPath: "name" }] }。
    - 在 expectedDelta 上方加一行注释：// Slice 12: region scope verify; name 
  field is structurally guaranteed (handler creates region with params.name), so
  this is a pipeline proof-of-life like Slice 10 track_create reuse path. 
  Bounds (pos/rgnend) verification is deferred to Slice 13 because two-mode 
  (explicit vs item_id) paramPath asymmetry needs its own decision. See 
  TEMPLATE_SPEC.md.
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/packages/mcp-server/src/tools
  /call-template.ts — 不改。toWireExpectedDelta 在 Slice 06 起已透传 fields[] 含
  scope / param_path / tolerance / optional / nullable；本 slice 不引入新字段。

  Lua（写）

  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/reaper/packs/core/verify.lua
    - 新增 parse_region_ref(ref)：^region:(.+)$ 匹配，返回 region 名（与
  refs.lua parse_region_name 算法同步但 verify 内部副本，不 dofile refs.lua 避免
  verify/refs 互相依赖）。
    - 新增 find_region_by_name(name)：线性扫 EnumProjectMarkers3，返回 { index =
  i, pos = pos, rgnend = rgnend, name = n }（与 refs.lua resolve_region_name
  同结构）。
    - 新增 read_region_field(handle, field)：从 synthetic handle 读 name / pos /
  rgnend；未知 field 返回 false, nil, "region field not supported"。本 slice
  只用 name，但 reader 一次写好。
    - 新增 FIELD_READERS["region"] = { entity_kind = "region", resolve = 
  find_region_by_name, read = read_region_field }。
    - check_fields 主逻辑微调：parse changed_ids[1] 时按 field reader 的 
  entity_kind 选择 parser（item/take/track → parse_guid_ref；region →
  parse_region_ref）。把当前 "parse 一次 guid，给所有 fields 用" 改为
  "首次失败时按 field reader 类型重新 parse"，或在循环顶部按混合 entity_kind
  拒（v0.1 单模板单 scope，不会混合，但守护静态规则）。最小改动方案：循环里每个
  field 用自己的 reader.parse() 函数（FIELD_READERS 增 parse
  字段：item/take/track → parse_guid_ref；region → parse_region_ref）。
    - check_fields 早期"changed_ids[1] is not a guid ref"硬错误路径调整为按
  reader 选 parse 函数后再判定。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/reaper/streetlight_bridge.lua
  — 不改。仍按 check_counts → check_fields → finalize_template
  调用顺序；verify.check_fields(expected_delta, changed_ids, params, 
  entity_kind, ctx) 签名不变。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/reaper/packs/core/refs.lua —
  不改。
  -
  /Users/Zhuanz/Documents/streetlight-reaper-mcp/reaper/packs/core/manifest.lua
  — 不改（region_create 的 entity_kind、undo_flags、undoable 在 Slice 03
  已落定）。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/reaper/packs/core/templates/r
  egion.lua — 不改。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/reaper/packs/core/error_codes
  .lua — 不改（22 codes 保持，VERIFY_FAILED 已在）。

  Scripts（写）

  -
  /Users/Zhuanz/Documents/streetlight-reaper-mcp/scripts/manifest-alignment.mjs
    - validateExpectedDeltaFields 里 ["take", "item", 
  "track"].includes(field.scope) 扩到包含 "region"。其余规则不动（包括 D5
  三大边界 + duplicate + tolerance + optional + nullable +
  all-optional-iff-all-nullable）。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/scripts/error-codes.mjs —
  不改。

  Tests（写）

  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/packages/core/src/__tests__/r
  egistry.test.ts — +5 测试：
    - 合法：region_create 形态 {count:1, creates:true, fields:[{scope:"region", 
  field:"name", paramPath:"name"}]}（接受）。
    - 合法：region scope + tolerance（不强制使用，但接受 tolerance:1e-6 为后续
  bounds 铺路）。
    - 非法：region scope + dotted paramPath（继续拒；通用规则）。
    - 非法：region scope 上 duplicate (scope, field)（继续拒）。
    - 合法回归：item_pitch / item_duplicate / media_import Slice 09/11 D5
  boundary 不退化。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/packages/mcp-server/src/tools
  /__tests__/call-template.test.ts — +2 测试：
    - region_create name:"foo" start:0 end:1 → wire expected_delta 含 count:1, 
  creates:true, fields:[{scope:"region", field:"name", param_path:"name"}]；不含
  tolerance / optional / nullable。
    - region_create name:"foo" item_id:"selected:0" → 同上 wire 形态（两 mode
  都用同一 expectedDelta）。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/packages/mcp-server/src/tools
  /__tests__/list-templates.test.ts — +3 测试：
    - region_create.expectedDelta.fields[0] = {scope:"region", field:"name", 
  paramPath:"name"}；不含 tolerance / optional / nullable。
    - 其他 10 个模板 metadata 字节稳定（含 9 个已纳入 fields + render_region
  仍无 expectedDelta）。
    - 断言：render_region 仍无 expectedDelta（永久 carve-out）。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/scripts/__tests__/manifest-al
  ignment.test.mjs — +3 测试：
    - 合法：region scope fields 接受。
    - 合法回归：4 个旧 scope 仍接受。
    - 合法回归：D5 三大边界（Slice 09/10/11）不退化。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/scripts/__tests__/lua-structu
  re.test.mjs — +3 测试：
    - grep 守护 verify.lua 含 parse_region_ref + FIELD_READERS["region"]（Slice
  12 加入证据）。
    - grep 守护 verify.lua 未引入 "for _, id in ipairs(changed_ids)" / "for i =
  1, #changed_ids" 之类的 multi-item verify 循环（防本 slice 漂出 multi-item
  语义；Slice 11 守护点延续）。
    - grep 守护 verify.lua 的 find_region_by_name 内部副本独立于 refs.lua（不
  dofile refs；同算法但解耦）。

  Docs（写）

  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/docs/plans/SLICE_12_ARCHITECT
  _PLAN.md — 本 packet 落盘（与 Slice 11 packet 同格式）。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/docs/HANDOFF.md — live edge
  切到 Slice 12；append Slice 12 decisions（D1–D7 见 §6）；更新组合矩阵：region 
  scope ✅（Slice 12，仅 string 字段；bounds 留 Slice 13）；明确 render_region
  仍永久 carve-out。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/docs/PROGRESS.md — Slice 12
  段（scope / what changed / verification baseline 占位 / live smoke evidence
  占位）。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/docs/TEMPLATE_SPEC.md
    - "Fields on count:'any' templates (Slice 11)" 子节后追加 "Fields on region
  scope (Slice 12)"，明示：
        - fields[].scope 现在含 "region"；region scope 的 changed_ids 形态是
  region:NAME，verify.lua 内部用 parse_region_ref 与 find_region_by_name
  解析（与 refs.lua 同算法但内部副本，避免 verify/refs 互相依赖）。
      - region name 字段是结构性永真：handler 用 params.name 创建 region，verify
  再读回；与 Slice 10 reuse path P_NAME 同口径，是 pipeline 
  proof-of-life，不是新的语义断言。
      - bounds (pos / rgnend) verify 留 Slice 13（绑 two-mode optional field
  语义决策）。
      - region GUID ref 仍不支持（REAPER 7 无 region GUID API）。
    - "Required v0.1 Templates" 表 + "Field verification" 表追加 region_create |
  region | name | params.name。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/docs/RESPONSE_BUDGET.md —
  VERIFY_FAILED details 段追加：region scope 字段失败 details.fields[] 增量 ≤
  256 字节（与 Slice 06–11 同口径）；说明 region 字段值是字符串 (name)，可能超过
  take/item 浮点字段的字节数但仍受 details 总大小约束。
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/docs/plans/KERNEL_HARDENING_P
  LAN.md § H2 — 注："Slice 12 把字段 verify 扩到 region_create，新增 region
  scope。verify.lua 加 parse_region_ref + FIELD_READERS["region"]（synthetic
  handle {index, pos, rgnend, name}，reader 一次性写好 name/pos/rgnend 但本
  slice 描述符只 declare name）。name 字段结构性永真——pipeline
  proof-of-life。bounds verify 留 Slice 13。H2 v0.1 覆盖收口：10/11，剩
  render_region 永久 carve-out。"
  - /Users/Zhuanz/Documents/streetlight-reaper-mcp/docs/plans/KERNEL_HARDENING_E
  XECUTION.md § H2 + §0.2 重载协议 — 追加："Slice 12 改 verify.lua（加 region
  scope reader 与 ref parser）。wire 首次出现 creates:true + count:1 + 
  fields[scope='region']。必须 full quit/reopen REAPER，避免旧 chunk 在新
  manifest 描述符上跑旧 check_fields 路径。验 console 含 loaded error_codes (22 
  codes) + bridge ready (generation 1)。"

  Files NOT touched（明确禁碰）

  - packages/core/src/errors.ts / result.ts / risk.ts / types.ts / refs.ts / 
  queue.ts
  - packages/mcp-server/src/transport/file-queue.ts
  - packages/mcp-server/src/index.ts / tools/{get-state,list-recipes,ping}.ts
  - packages/mcp-server/src/templates/*.ts（除 region-create.ts 外的 10 个 TS
  模板）
  - reaper/streetlight_bridge.lua
  - reaper/packs/core/{manifest,refs,undo,error_codes}.lua、templates/*.lua（含
  templates/region.lua，handler 不改）、lib/*.lua
  - scripts/error-codes.mjs / setup.mjs / install.* / setup-out/ /
  recipes/*.yaml
  - render_region 模板（继续永久 carve-out）

  ---
  5. Contract / schema / error-code changes

  TS — FIELD_CHECK_SCOPES 修订（向后兼容扩展）

  // 当前（Slice 11）：
  const FIELD_CHECK_SCOPES = new Set<FieldCheckDescriptor["scope"]>([
    "take",
    "item",
    "track",
  ]);

  export interface FieldCheckDescriptor {
    field: string;
    scope: "take" | "item" | "track";
    // ...
  }

  // Slice 12：
  const FIELD_CHECK_SCOPES = new Set<FieldCheckDescriptor["scope"]>([
    "take",
    "item",
    "track",
    "region",
  ]);

  export interface FieldCheckDescriptor {
    field: string;
    scope: "take" | "item" | "track" | "region";
    // ...
  }

  validateExpectedDeltaFields 其余分支（deletes / maybeCreates / creates+numeric
  / creates+"any" / duplicate / tolerance / optional / nullable /
  all-optional-iff-all-nullable）字面不动。

  Descriptor — region-create.ts 改动

  // 之前（Slice 04）：
  expectedDelta: { count: 1, creates: true },

  // Slice 12：
  // Slice 12: region scope verify; name field is structurally guaranteed
  // (handler creates region with params.name), so this is a pipeline
  // proof-of-life like Slice 10 track_create reuse path. Bounds (pos/rgnend)
  // verification is deferred to Slice 13. See TEMPLATE_SPEC.md.
  expectedDelta: {
    count: 1,
    creates: true,
    fields: [
      { scope: "region", field: "name", paramPath: "name" },
    ],
  },

  Wire 协议（snake_case，字面同名）                          

  jsonc
  "expected_delta": {
    "count": 1,
    "creates": true,
    "fields": [
      { "field": "name", "scope": "region", "param_path": "name" }
    ]
  }

  无 tolerance / optional / nullable。
  
  Lua verify.lua 改动伪代码

  -- 新增：
  local function parse_region_ref(ref)
    if type(ref) ~= "string" then return nil end
    return ref:match("^region:(.+)$")
  end

  local function find_region_by_name(name)
    local i = 0
    while true do
      local retval, isrgn, pos, rgnend, n = reaper.EnumProjectMarkers3(0, i)
      if retval == 0 then return nil end
      if isrgn and n == name then
        return { index = i, pos = pos, rgnend = rgnend, name = n }
      end
      i = i + 1
    end
  end

  local function read_region_field(handle, field)
    if field == "name"   then return true, handle.name end
    if field == "pos"    then return true, handle.pos end
    if field == "rgnend" then return true, handle.rgnend end
    return false, nil, "region field '" .. tostring(field) .. "' not supported"
  end

  -- 修订 FIELD_READERS：每个 reader 增 parse 字段；item/take/track 用 
  parse_guid_ref；region 用 parse_region_ref。
  local FIELD_READERS = {
    item   = { entity_kind = "item",   resolve = find_item_by_guid,    read =
  read_item_field,   parse = parse_guid_ref },
    take   = { entity_kind = "item",   resolve = find_item_by_guid,    read =
  read_take_field,   parse = parse_guid_ref },
    track  = { entity_kind = "track",  resolve = find_track_by_guid,   read =
  read_track_field,  parse = parse_guid_ref },
    region = { entity_kind = "region", resolve = find_region_by_name,  read =
  read_region_field, parse = parse_region_ref },
  }

  -- check_fields 主循环：parse changed_ids[1] 时按当前 field 的 reader.parse 
  选择。
  -- 旧硬错误 "changed_ids[1] is not a guid ref" 改为 per-field 失败（其余 
  fields 仍尝试）。
  -- 但 v0.1 单模板单 scope（region_create 全部 fields scope=region），所以 
  parse 一次即可：
  -- 拿第一个 field 的 reader.parse(changed_ids[1])，全部 fields 共用该 parsed 
  value。
  function M.check_fields(expected, changed_ids, params, entity_kind, ctx)
    -- ...（其余不变）
    -- 改：
    local first_reader = type(expected.fields[1]) == "table"
      and FIELD_READERS[expected.fields[1].scope] or nil
    local parsed_ref = first_reader and first_reader.parse(changed_ids[1]) or
  nil
    if not parsed_ref then
      failures[#failures + 1] = {
        scope = "unknown",
        field = "changed_ids[1]",
        expected = first_reader and (first_reader.entity_kind == "region" and
  "region:NAME" or "guid:{...}") or "guid:{...}",
        actual = tostring(changed_ids[1]),
        ok = false,
      }
      return "changed_ids[1] does not match expected ref shape", failures
    end
    -- 然后循环里 reader.resolve(parsed_ref) 与原来一致（guid 或 region name 
  都是 string）。
    -- ...（其余不变）
  end
  
  v0.1 单模板单 scope 简化：region_create 的 fields[] 全部 scope=region；其他 9
  个模板 fields[] 全部 scope=item/take/track。混合 scope 不会发生在 v0.1
  单模板里。但代码逻辑仍按 first-field-reader 决定 parse
  形态，未来若某模板出现混合 scope（如 "track + 它所在的 region"），需 per-field
  parse 重做。这是 Slice 13+ 的事，本 slice 不打开。

  streetlight_bridge.lua 行为差异：零

  verify.check_fields 签名不变，调用顺序不变。

  VERIFY_FAILED 错误码：不动

  details.fields[] 形状不动；region scope 单字段失败增量 ≤ 256
  字节（字符串字段比 take/item 浮点稍长但仍在预算内）。

  list_templates 元数据

  region_create.expectedDelta.fields[0] 含 {scope:"region", field:"name", 
  paramPath:"name"}；不含 tolerance / optional / nullable。

  ---
  6. Decisions for user
  
  #: D1
  决策项: Slice 12 收 region_create field verify？                   
  选项: (a) yes — region scope + name only，把 H2 推到 10/11；(b) 跳过
  region，转
    H4 / H6 / H7；(c) region_create + bounds（name+start+end）一刀做 
  推荐: (a) — 是唯一能纳入 H2 的剩余模板（render_region 永久 
    carve-out）；name-only 是把 region scope 落地的最小切片，避免 two-mode
  bounds
     paramPath 决策与 region scope reader 同时落
  ────────────────────────────────────────
  #: D2
  决策项: region scope 在 Slice 12 验哪些字段？
  选项: (a) 仅 name（pipeline proof-of-life，与 Slice 10 同口径）；(b) name + 
    start + end（必须解决 item-mode paramPath 缺失，引入"两 mode 
    optional"语义）；(c) 仅 pos + rgnend（跳过 name —— 与 handler
    字段相同但不验证最关键的身份字段）
  推荐: (a) — bounds verify 留 Slice 13 独立决策；本 slice 单轴更安全（仅引入
    region scope，不引入 two-mode optional 语义）
  ────────────────────────────────────────
  #: D3
  决策项: region 在 verify.lua 的 handle 形态？
  选项: (a) synthetic struct {index, pos, rgnend, name}（与 refs.lua
    resolve_region_name 同形）；(b) 仅 name 字符串（reader 
    每次重扫并就地比对）；(c) 整数 index（不稳，markers renumber）
  推荐: (a) — 与 refs.lua 内部约定一致，reader 一次性支持 name/pos/rgnend，Slice

    13 bounds 可零修改 reader
  ────────────────────────────────────────
  #: D4
  决策项: region reader 是否复用 refs.lua resolve_region_name？
  选项: (a) 不复用，verify.lua 内部副本（同算法）；(b) verify.lua dofile
  refs.lua
    共用；(c) 把 region 扫描提到共享 lib 文件
  推荐: (a) — verify 与 refs 历来解耦（refs 处理 agent-facing ref，verify 处理
    bridge 内部 readback）；Slice 06 起 verify.lua 的 find_item_by_guid /
    find_track_by_guid 也是内部副本。一致性优先
  ────────────────────────────────────────
  #: D5
  决策项: name 字段比较语义？
  选项: (a) 字符串严格相等（无 tolerance）；(b) 大小写不敏感比较；(c) trimmed
    比较
  推荐: (a) — REAPER region name 是 user-typed 字符串，handler 用 params.name
    字面创建，verify 必须字面读回。lib/names.lua 已对 / \ NUL $ 拒，name
    内容稳定。无 tolerance
  ────────────────────────────────────────
  #: D6
  决策项: "pipeline proof-of-life" 契约写在哪？
  选项: (a) docs/TEMPLATE_SPEC.md 新子节 "Fields on region scope (Slice 12)" +
    descriptor 注释引用（推荐）；(b) 仅 PROGRESS.md 记录；(c) verify.lua
  内部注释
  推荐: (a) — agent-facing spec 必须明示 "region name verify 是 pipeline 
    活性证明，不是新断言"，避免 agent 误读为 "region 字段已严格校验"
  ────────────────────────────────────────
  #: D7
  决策项: "creates + VERIFY_FAILED 留 1 个 orphan region" 副作用，文档与 smoke
    如何覆盖？
  选项: (a) 显式记录（推荐）：handler 已 AddProjectMarker2 完毕，1 个 region
    已落在工程；verify 在 finalize 之前失败 → LAST_RESULT 不更新 → 1 个 orphan
    region 留在 REAPER 项目里。PROGRESS / TEMPLATE_SPEC 显式记录；live smoke
    各验一次（field mismatch + paramPath 错位 + structural mismatch 三类，每类留
  
    1 个 orphan region）；(b) 不区分记录，仅当 creates 类共有副作用处理
  推荐: (a) — region_create 是 Slice 09/10/11/12 四个 creates 
    类模板里副作用最显眼的（orphan region 在 REAPER timeline 
    上肉眼可见），契约要写明，smoke evidence 必须列计数

  ---
  7. Risks & regression notes
  
  region scope 引入的滑坡风险（Slice 12 最大策略点）

  - verify.lua 新增 parse_region_ref + FIELD_READERS["region"]
  后，剩余两条仍互斥的边界（deletes / multi-item all-items
  verify）必须仍由静态校验 + lua-structure grep 守住。
  - 缓解：
    - registry / manifest-alignment 双层守护 D5 三大边界 + deletes 仍拒。
    - lua-structure.test.mjs grep 守护 verify.lua 未引入 multi-item 循环（"for
  _, id in ipairs(changed_ids)" 之类），与 Slice 11 同口径。
    - HANDOFF + KERNEL_HARDENING_PLAN 更新组合矩阵：
        - ✅ creates + numeric count + fields（Slice 09）
      - ✅ maybeCreates + numeric count + fields（Slice 10）
      - ✅ creates + count:"any" + fields（Slice 11 first-item verify）
      - ✅ field scope "region" + 仅 string field "name"（Slice 12 pipeline
  proof-of-life）
      - ❌ deletes + fields（v0.1 无 deletes 模板，规则保留）
      - ❌ field scope "region" + bounds（pos/rgnend）（Slice 13，需 two-mode
  paramPath 决策）
      - ❌ count:"any" + multi-item all-items verify（未排期，需 verify.lua
  改动）
      - ❌ render_region 任何 verify（永久 carve-out）

  "Pipeline proof-of-life" 契约的可读性风险

  - region name 字段验证在 v0.1 下是结构性永真（handler 用 params.name
  创建，verify 读回必相等）—— agent 可能误读为 "region 字段已严格校验"。
  - 风险：未来读者可能在 Slice 13 看到 bounds verify 缺失时疑惑 "Slice 12
  不是验过 region 了？"。
  - 缓解：
    - D6 决策 (a) 选 "TEMPLATE_SPEC.md 显式声明 pipeline proof-of-life"；
    - 在 region-create.ts descriptor 上方注释引用 TEMPLATE_SPEC.md；
    - PROGRESS Slice 12 段明确 "region name 字段验证是 pipeline
  proof-of-life，与 Slice 10 track_create reuse path P_NAME 同口径"；
    - live smoke S6 显式触发 raw-queue field:"nameX" 来证明 mismatch
  路径确实工作（不是"verify 永远返绿"）；
    - live smoke S7 显式触发 raw-queue 把 changed_ids[1] 改成 region
  工程里不存在的名字，证明 region reader 的 "not found" 路径工作。

  parse_region_ref 与 refs.lua parse_region_name 行为漂移

  - 两处都做 ^region:(.+)$ 解析；如果未来 refs.lua 改语法（如允许
  region:GUID:{...}）但 verify.lua 没跟进 → verify 失败但 refs 成功。
  - 缓解：
    - lua-structure.test.mjs grep 守护两处函数的关键 regex
  字面（^region:），确保静态可追溯。
    - PROGRESS / TEMPLATE_SPEC 标注 "verify.lua parse_region_ref 是 refs.lua
  parse_region_name 的内部副本，未来 region ref 语法变化要双更新"。
    - HANDOFF 注："Slice 12 决策 D4=不复用 refs.lua；这是为了 verify/refs
  解耦，但代价是两处算法需手动同步"。

  Region name 多个同名（race 风险极低）

  - handler 创建前查 REGION_NAME_TAKEN；创建后 verify 重扫，find_region_by_name
  仍按首匹配返回 —— 期间另一线程（用户手动 GUI）创建同名 region
  概率几乎为零，但理论存在。
  - 风险：极端情况下 verify 读到的 region 不是 handler 创建的那个。
  - 缓解：
    - Slice 12 不引入跨线程同步（v0.1 不在范围）；
    - REAPER GUI 不会在 bridge tick 之间被用户操作（dofile
  是同步），所以实际不发生；
    - TEMPLATE_SPEC 注："region identity = first-match-wins；same-name regions
  由 region_create 的 REGION_NAME_TAKEN 阻止，但理论 race 存在"（与 refs.lua
  同口径）。

  Region name 字段读取的 "expected param vs actual" 字符串相等

  - expected = params.name；actual = find_region_by_name(parsed_ref).name。在
  happy path 必相等（handler 用 params.name 创建）。
  - 风险：handler 内部规范化 name（如 trim）但 verify 不规范化 → 假阳性。
  - 缓解：
    - 当前 region.lua handler 不规范化 name（直接 params.name）。lib/names.lua
  只 validate 不 rewrite。
    - lua-structure.test.mjs grep 守护 region.lua 仍不规范化 name（不含
  string.lower / string.trim 之类作用于 name 的调用）。

  Slice 04 的结构 verify 优先级在 region scope 上首次验证

  - 已在 Slice 11 验证 creates + count:"any" 上结构优先；本 slice 在 creates + 
  count:1 + region scope 上首次验证。
  - 风险：region scope 的结构 verify 走 count_regions() —— v0.1
  已实现，无新代码，但首次在 region_create 上做 forced structural mismatch。
  - 缓解：S9 (forced structural mismatch on region_create) 显式验证。

  create + VERIFY_FAILED 留 orphan region 副作用

  - D7 决策 (a) 推荐：每次 forced VERIFY_FAILED 留 1 个 orphan region（在 REAPER
  timeline 肉眼可见）。
  - 风险：live smoke 累积可能留 3+ 个 orphan regions。
  - 缓解：
    - S6 (field mismatch) 留 1 个 orphan region；
    - S7 (changed_ids mismatch via raw queue) 留 1 个 orphan region；
    - S8 (paramPath 错位) 留 1 个 orphan region；
    - S9 (structural mismatch) 留 1 个 orphan region；
    - 共 4 个 orphan regions，PROGRESS / 本 packet live smoke evidence
  段必须明确点名"这些是预期的 create + VERIFY_FAILED 语义副作用"。

  wire 字节稳定

  - Slice 06–11 的 9 个模板 wire 字节不变。
  - render_region wire 字节不变（仍无 expected_delta）。
  - region_create wire 在 Slice 12 之后含 fields:[{scope:"region", field:"name",
  param_path:"name"}] —— 这是本 slice 唯一的 wire
  diff，针对单个模板，预期出现。

  Error-code constants 不退化

  - 失败路径仍走 errs.VERIFY_FAILED。
  - Slice 05 audit 已 grep reaper/packs/core/**/*.lua；本 slice 改
  verify.lua，audit 必跑（新增函数不能引入字符串字面量错误码）。
  - npm run check:error-codes-fresh 必须保持 22 codes。

  REAPER bridge boot 必须 full quit/reopen

  - 本 slice 改 verify.lua（加 parse_region_ref + region reader），属于 §0.2
  "verify.lua 改动" 范畴 → 必须 完全重启 REAPER。
  - 验证 console 含 bridge ready (generation 1) — loaded error_codes (22 
  codes)。

  回归覆盖必查项

  - Slice 06 的 4 happy envelope 字节稳定（item_pitch / item_move / item_rate /
  track_rename）。
  - Slice 07 item_trim 两个 happy envelope 字节稳定。
  - Slice 08 item_fade 四个 happy envelope 字节稳定。
  - Slice 09 item_duplicate happy envelope 字节稳定。
  - Slice 10 track_create happy envelope 字节稳定（create + reuse）。
  - Slice 11 media_import happy envelope 字节稳定（含 D_POSITION first-item
  verify）。
  - Slice 04 结构 verify 仍优先于字段 verify（在 region_create 上首次验，是
  region scope 首次验证此优先级）。
  - Slice 05 errs.* 接线不退化。
  - Slice 02 get_state include 仍工作。
  - Slice 01 readonly scope 不污染 LAST_RESULT。
  - render_region 仍跳过任何 verify；changed_ids 仍是绝对路径；wire 仍无
  expected_delta。
  - region_create explicit-mode + item-mode 两种 happy path 都走 region scope
  field verify 通过。
  - last_result:region:N 仍工作（不被 verify.lua 区域 reader 改动影响）。
  - 跨类型 REF_INVALID 仍工作（item → track / region → item 等）。

  ---
  8. Static test plan
  
  绝对路径命令：

  cd /Users/Zhuanz/Documents/streetlight-reaper-mcp
  npm test
  npm run build
  npm run check:manifest
  npm run check:error-codes-fresh                            
  git -C /Users/Zhuanz/Documents/streetlight-reaper-mcp diff --check

  通过判据：

  - npm test → 基线 284 + 新增 16 ≈ 300 全绿；若 < 284 视为回归。
  - npm run build → 0 报错（pre-existing TS6310 噪声可忽略）。
  - npm run check:manifest → Streetlight manifest alignment ok (11 templates).
  - npm run check:error-codes-fresh → Streetlight error codes fresh (22 codes).
  + zero forbidden literal usage（含新加的 verify.lua region scope 代码）。
  - git diff --check → 无空白错误。

  焦点测试套件：

  - registry tests + call-template tests + list-templates tests +
  manifest-alignment tests + lua-structure tests 应组成 Slice 12 focused
  suite，独立全绿后再跑全量。

  ---
  9. Live REAPER smoke plan
  
  前置（必须）：用户完全退出 REAPER 进程（不只是关项目），重开 → Actions → Show
  action list → ReaScript: Load… → 选 start_bridge.lua → Run。console 必须有：

  [streetlight] loaded error_codes (22 codes)
  bridge ready (generation 1) — loaded error_codes (22 codes) — templates: …

  generation ≠ 1 或 22 codes 行缺失 → 不通过，回到前置。

  Smoke 步骤（保持 Slice 04–11 的"成功路径 + 故意 mismatch + 多 slice
  回归"三轨）

  S0 reachability：ping → bridge:connected, reaper_version=7.71/macOS-arm64。

  S1 list_templates：11 模板返回；断言：
  - region_create.expectedDelta 含 {count:1, creates:true, 
  fields:[{scope:"region", field:"name", paramPath:"name"}]}；不含 tolerance /
  optional / nullable。
  - Slice 06–11 已纳入的 9 个模板 metadata 字节稳定（item_pitch / item_move /
  item_rate / track_rename / item_trim / item_fade / item_duplicate /
  track_create / media_import）。
  - render_region 仍无 expectedDelta（永久 carve-out）。

  S2 prep track：track_create name:"Slice12 Live Smoke <ts>" reuse_existing:true
  → 拿到 track GUID（Slice 10 happy create 路径回归）。

  S3 prep item：media_import path:"/System/Library/Sounds/Ping.aiff" 
  track_id:"last_result:track:0" position:0 → 拿到 item GUID（Slice 11 happy
  first-item verify 回归）。

  S4 region_create happy explicit mode：region_create name:"slice12-r-<ts>" 
  start:0 end:1 →
  - 断言：changed_count=1，changed_ids=["region:slice12-r-<ts>"]，envelope
  字节稳定。
  - 验证（bridge 端）：structural verify 算出 delta_regions=+1，通过 Slice 04
  count:1 + creates 路径。
  - 验证（bridge 端）：field verify 端走新 parse_region_ref →
  find_region_by_name → read_region_field name → params.name 字符串相等通过。
  - 这是 Slice 12 的核心新行为：region scope verify 路径全程绿。

  S5 region_create happy item-mode：region_create name:"slice12-r2-<ts>" 
  item_id:"last_result:item:0" →
  - 断言：changed_ids=["region:slice12-r2-<ts>"]。
  - 验证：field verify 通过（params.name 与 changed_ids[1] 区域的 name 相等）。
  - 这条验证：item-mode 同样走 region scope verify（不被 item_id 影响）。

  S6 字段名 mismatch 强制路径（field:"nameX"，raw queue）：直接往 queue 投
  region_create name:"slice12-r3-<ts>" start:0 end:1，但 wire
  expected_delta.fields[0].field = "nameX"。
  - handler 仍正常 AddProjectMarker2 创建 1 个新 region；bridge 端 field verify
  reader 返回 false, nil, "region field 'nameX' not supported" → fields verify
  失败。 
  - 断言：VERIFY_FAILED，recoverable:false，details.fields[0].ok=false，details.
  fields[0].field="nameX"，details.fields[0].expected="slice12-r3-<ts>"，details
  .fields[0].actual="read failed"（或与 Slice 06 mismatch reason 同形），message
  含 Slice 04 恢复短语字面量。
  - 副作用：1 个 orphan region 留在工程（D7 决策 (a) 显式记录）。

  S7 changed_ids 形态 mismatch 强制路径（raw queue 伪造 changed_ids 不是
  region:NAME）：实际上 region_create handler 永远返回 region:NAME 形
  changed_ids，所以这条用 paramPath 错位代替（见 S8）。或 raw queue 伪造一个
  handler-style 调用让 changed_ids[1] 是 guid:{...}（无法在不改 handler
  情况下做到）—— 本路径留作文档说明，不做。

  S8 paramPath 错位（raw queue）：raw 发 region_create name:"slice12-r4-<ts>" 
  start:0 end:1，wire params.name 正常，但
  expected_delta.fields[0].paramPath="nameX"（不存在的 key）。
  - verify 端 params["nameX"] == nil 且 optional 不为 true → mismatch
  {expected:"present param", actual:nil} → VERIFY_FAILED。 
  - 这一步守护 "paramPath 错位" 在 region scope 上仍按 Slice 06 mismatch
  路径走。
  - 副作用：1 个 orphan region。

  S9 结构 mismatch 仍优先（Slice 04 回归 + 在 region scope 上首次验）：raw 发
  region_create name:"slice12-r5-<ts>" start:0 end:1，expected_delta = {count:2,
  creates:true, fields:[{...}]}（期望 2 个 region，但 handler 只创建 1 个）→
  结构 verify count expected 2 got 1 失败优先返回，top-level details 不含 
  fields（与 Slice 06–11 一致）。
  - 副作用：1 个 orphan region。

  S10 LAST_RESULT 不污染（region create + VERIFY_FAILED 路径）：S6 / S8 / S9
  之后，发 track_rename last_result:track:0 name:"<ts>-survived" → 仍作用于 S2
  创建的 track。
  - 断言：track_rename 成功，返回 S2 track GUID（证明 region create 路径的
  VERIFY_FAILED 不污染 LAST_RESULT.tracks，并不污染 LAST_RESULT.regions —— 同时
  LAST_RESULT.regions 仍是 S5 成功创建的 region:slice12-r2-<ts>）。

  S11 region last_result 回归：发 region_create name:"slice12-r6-<ts>" 
  item_id:"last_result:item:0"（再创一个）→ success。然后用 render_region 验
  region:<last from LAST_RESULT.regions> 仍能解析（refs.lua
  resolve_last_result_region 不被本 slice 影响）：实际上 render_region 不接
  last_result 形 ref，所以改用 raw 调用 region_create 
  item_id:"last_result:item:0" name:"<dup attempt>" 来模拟 LAST_RESULT.regions
  工作 —— 简化：S11 只验 region_create 第二次成功 + LAST_RESULT.regions 形态。

  S12 Slice 09 / 10 / 11 D5 boundary 回归：
  - item_duplicate last_result:item:0 track_id:"last_result:track:0" 
  position:5.0 → success + Slice 09 D_POSITION verify 通过。
  - track_create name:"Slice12 maybeCreates <ts>" reuse_existing:true → success
  + Slice 10 P_NAME verify（create + reuse）。
  - media_import path:"/System/Library/Sounds/Ping.aiff" 
  track_id:"last_result:track:0" position:3.0 → success + Slice 11 first-item
  D_POSITION verify。

  S13 Slice 06 / 07 / 08 回归：
  - item_pitch last_result:item:0 semitones:-3 → success + D_PITCH verify。
  - item_move last_result:item:0 position:5.0 → success + D_POSITION verify。
  - item_trim last_result:item:0 length:1.0 → success + D_LENGTH
  verify，D_STARTOFFS skip。
  - item_fade last_result:item:0 fade_in:null → success + nullable verify。

  S14 error-code constants 回归：
  - region_create name:"bad/name" start:0 end:1 → REGION_NAME_INVALID（path
  separator 拒）。
  - region_create name:"slice12-r-<ts>" start:0 end:1 第二次发 →
  REGION_NAME_TAKEN（uniqueness 拒）。
  - item_pitch selected:99 → ITEM_NOT_FOUND。
  - media_import path:"/no/such/file" → MEDIA_NOT_FOUND。

  S15 get_state include 回归：
  - get_state(tracks, include:["fx"]) → OK；
  - get_state(render, include:["fx"]) → PARAMS_INVALID；
  - get_state(render) → SCOPE_NOT_IMPLEMENTED；
  - get_state(regions) → 返回包含 S4 / S5 / S6 / S8 / S9 / S11 创建的所有
  regions 名（含 orphans —— 用户可肉眼对账）。 

  S16 render_region carve-out：render_region region:"slice12-r-<ts>" 
  output_dir:"<临时 dir>" render_pattern:"slice12-r-<ts>" → success；临时 dir
  含且仅含 .wav，无 .RPP / .RPP-bak。changed_ids 是绝对 WAV 路径。render_region
  仍跳过任何 verify。临时 render dir 用后必须删干净。

  S17 region_create / render_region metadata 终查：list_templates 重读一次，断言
  render_region 仍无 expectedDelta（永久 carve-out）；region_create metadata
  仍如 S1 所述。

  清理
  
  smoke 中创建的 track / item / region 留在 REAPER 项目里由用户手动 Cmd+Z /
  删除（沿用 Slice 04–11 惯例）；任何临时 render dir 必须删干净。

  S4 / S5 / S11 的 happy regions（3 个）+ S6 / S8 / S9 的 orphan regions（3 
  个）+ S14 的 REGION_NAME_TAKEN dup 未创建 region —— 共 6 个 regions 留在
  REAPER 项目里。PROGRESS / 本 packet live smoke evidence
  段必须明确点名"这些是预期的 'creates + verify success / verify failure'
  语义结果"，让用户知道不需要 panic。

  通过判据

  S0–S17 全绿，且：

  - S4 / S5 的 happy 路径确实进入 fields verify 且 name 通过——这是 Slice 12
  核心断言（region scope happy verify 路径完全活）。
  - S6 details 含 fields[0] 且 field:"nameX" 触发 reader 失败路径；create 路径
  handler 已经把 region 创建了，但 envelope 是 VERIFY_FAILED。
  - S8 details 含 fields[0] 且走 Slice 06 "present param expected, nil actual"
  路径。
  - S9 details 不含 fields（结构 mismatch 优先）；这是 region scope
  首次验证此优先级。
  - S10 的 LAST_RESULT 隔离——region create + VERIFY_FAILED 不更新
  LAST_RESULT.regions / LAST_RESULT.tracks，即使 handler 真的创建了 region。
  - S11 的 LAST_RESULT.regions 仍工作（refs.lua 不被本 slice 影响）。
  - S12 的 Slice 09 / 10 / 11 D5 boundary 不退化（首次在含 region scope 的
  verify.lua 上重验）。
  - S13 / S14 / S15 / S16 wire code 与 Slice 11 之前完全一致。
  - 任何 path 退化为 INTERNAL_ERROR / 错误码字面量泄漏 →
  不通过，回滚迁移并复盘。
  - list_templates 11 模板字节稳定，仅 region_create 新出现
  fields[]——render_region 必须仍无 expectedDelta。
  
  ---
  10. Rollback / commit discipline

  Architect 阶段（本 packet）

  - 不写代码、不 commit、不 push、不 reset、不 branch。
  - 仅产出本 packet（建议落盘到 /Users/Zhuanz/Documents/streetlight-reaper-mcp/d
  ocs/plans/SLICE_12_ARCHITECT_PLAN.md，由用户审核后决定是否写入）。

  Codex 执行阶段

  按 §4 文件清单与 §5 契约伪代码执行；按 §8 静态闸跑 npm test / build /
  check:manifest / check:error-codes-fresh / git diff --check 全绿后再交付。

  Reviewer 阶段

  只读复核，按 P1 / P2 / P3 分级出 finding，不直接改代码。

  Live smoke 阶段

  按 §9 步骤执行。若任何 S 步失败：
  - 绝不直接改代码，回到 Architect 提一个新 packet。
  - 失败的 raw-queue mismatch 路径留的 orphan regions / items
  不要自动清理（让用户视觉对账）。

  Commit / push

  - 完全由用户决定。本 slice 不替用户 commit、不 push、不 reset、不 branch。
  - 候选 commit message（仅参考，用户决定）：
  kernel-hardening: slice 12 region_create field verify (region scope)

  - Extend H2 field verification to region_create.
  - verify.lua adds parse_region_ref + FIELD_READERS["region"]
    (synthetic handle {index,pos,rgnend,name}; reader supports
    name/pos/rgnend, but Slice 12 descriptor declares only name).
  - registry / manifest-alignment add "region" to FIELD_CHECK_SCOPES.
  - region_create.expectedDelta gains fields:[{scope:"region",
    field:"name", paramPath:"name"}]. Pipeline proof-of-life like
    Slice 10 track_create reuse path; bounds (pos/rgnend) verify
    deferred to Slice 13.
  - 0 Lua handler changes; 0 manifest.lua / refs.lua changes.
  - Decisions: D1=a region_create only; D2=a name only; D3=a synthetic
    struct; D4=a verify-internal copy of region scanner; D5=a string
    equality; D6=a TEMPLATE_SPEC.md note; D7=a document orphan region
    side effect.

  Rollback path
  
  如果 live smoke 任何 S 步失败或 reviewer 出 P1：
  - 不 reset，不 force push（与既有纪律一致）。
  - 由用户决定是否本地 git restore 撤回未 commit 的修改。
  - 若已 commit 未 push：用户决定是否 git reset --soft HEAD~1 撤回 commit
  保留改动，或 git revert 出反向 commit。
  - 重新走 Architect 阶段提新 packet。

  守护：本 slice 不应 引入

  - verify.lua 里任何 for _, id in ipairs(changed_ids) 之类 multi-item
  循环（Slice 13+）。
  - region scope 上的 optional:true / nullable:true 字段（Slice 13 才会做）。
  - verify.lua 里 dofile(refs.lua) 之类共用调用（保持 verify/refs 解耦）。
  - region.lua handler 的任何改动（行为契约稳定）。
  - streetlight_bridge.lua 的 check_counts → check_fields → finalize_template
  顺序变化。
  - 任何对 render_region 的 expectedDelta 尝试（永久 carve-out）。

  ---
  拍板请求
  
  请就 D1–D7 拍板（推荐 (a)/(a)/(a)/(a)/(a)/(a)/(a)），其余按本 packet
  推进。Codex 执行；reviewer 只读复核；smoke 通过后由你决定是否 commit —— 本
  packet 不替你 commit、不 push、不 reset、不 branch。

  最关键的三个决策点：

  - D1：是否先做 region_create 把 H2 推到 10/11？推荐 (a) —— region_create 是
  v0.1 H2 可覆盖的最后一个模板（render_region 永久 carve-out），不收就只能转 H4
  / H6 / H7，但 H6 scaffold 后第一个生成的"区域类新模板"还是要 region scope
  先打通，不如本 slice 先做。
  - D2：region scope 在 Slice 12 验哪些字段？推荐 (a) 仅 name —— 把 region scope
  落地（verify.lua 加 parse_region_ref + region reader）和 bounds verify（解决
  two-mode paramPath 不对称）拆成两 slice，单轴更安全；bounds 留 Slice 13
  独立产品决策。
  - D7：N 个 orphan regions 副作用如何文档化？推荐 (a) 显式记录 —— region_create
  是 Slice 09–12 四个 creates 类模板里副作用最显眼的（orphan region 在 REAPER
  timeline 肉眼可见），契约必须写明，smoke evidence 必须列计数（预计 4 个 orphan
  regions 来自 S6/S8/S9 + 1 个由 S14 REGION_NAME_TAKEN 触发但未创建）。

  若想换方向

  - 直接做 region_create + bounds（name + start + end）（即候选
  B）：可以，但等于把 "region scope 落地" 和 "two-mode optional field 在 v0.1
  的语义"两件事一刀做。请准备好回答：(1) item-mode 下 start / end 在 params
  不存在，是用 optional:true 跳过还是引入新的 "mode-conditional optional"
  语义？(2) 如果 (1) = optional skip，item-mode 等于无 bounds verify，那本 slice
  在 item-mode 下的 verify 价值降低；(3) bounds 字段的 paramPath 是 start /
  end（与 end Lua 关键字冲突，descriptor 端不冲突但 verify.lua 读取要
  bracket）—— 是 2 个新决策。
  - 直接转 H4 idempotency：可以，但 H2 v0.1 收口将停在 10/11（region_create
  永远没有 field verify）。如果 v0.1 release-candidate 阈值要求 "every undoable
  mutating template has field verify"，应先做 Slice 12 再转 H4。
  - 直接转 H6 scaffold（descriptor → 代码生成）：H2 9/11 已达 H6
  启动门槛，可以。但 H6 scaffold 若不先收 region
  scope，生成的"区域类新模板"无法复用 region reader，等于 H6 scaffold 的首个
  region 模板还要回头改 verify.lua。Slice 12 先打通 region scope，H6 scaffold
  后更整齐。

