# Architect Plan Packet — Slice 01

ROLE: Architect (no code, no commit). Source:
`docs/plans/KERNEL_HARDENING_PLAN.md` +
`docs/plans/KERNEL_HARDENING_EXECUTION.md`.

Scope locked by 总工程师:
H1 最小安全切片 + H3 readonly `get_state(tracks/regions/project)` 前置设计。

## 1. Goal

交付第一刀，两件事：

**A. H1 最小安全切片** — 把 `entity_kind` 的 `LAST_RESULT` 分桶路由与 ref 解析从硬编码改为数据驱动，且行为完全不变（仍是 item/track/region/render 四桶、11 个模板行为零变化），并用一个仅测试用的假实体证明：未来新增实体家族无需触碰 `DISPATCH.template` / `finalize_template` 主体。

**B. H3 readonly 三 scope** — 实现 `get_state` 的 `project` / `tracks` / `regions`，复用现有 response-budget 截断 backstop，解锁工程感知 / 轨道发现。前置设计 `include` / `fields` / `cursor` 的挂载点，但本刀不实现。

## 2. Non-Goals

- 不发布任何真实新实体家族（fx/midi/note）——只做机制 + 假实体测试。
- 不实现 `include:["fx"]` / `fields` 投影 / `cursor` 分页（留给 Slice 02 / H3-b）。
- 不碰任何写能力，不读 FX 参数，不做 H2 校验闭环 / H4 幂等 / H6 工厂 / H7 传输。
- 不改 5 工具面（I1）。不改 11 个既有模板行为。
- 本刀不把“未知 `entity_kind` 静默 fallback 到 items”改成运行期硬失败——只在启动/注册期加严格校验（运行期保留 loud-log fallback）。

## 3. User-Facing Behavior

- `get_state(project)` → 返回 BPM、拍号、采样率、工程长度。不再 `SCOPE_NOT_IMPLEMENTED`。
- `get_state(tracks)` → 返回有界的轨道描述符列表。不含 FX。
- `get_state(regions)` → 返回有界的 region 描述符列表（name 为句柄）。
- `get_state(selection)` 不变；`get_state(render)` 仍 `SCOPE_NOT_IMPLEMENTED`。
- 三个 read scope 沿用 selection 的信封形状（`items` / `total` / `returned` / `truncated` / `response_bytes`）。
- `call_template` 及所有 mutating 模板行为零变化。

## 4. Files Likely To Change

TS:

- `packages/mcp-server/src/tools/get-state.ts` — 放行 project/tracks/regions；定义三个 scope 的 Result 载荷类型。
- `packages/core/src/*`（ProjectState 类型所在处）— 增三个 scope 的载荷 TS 类型。

Lua:

- `reaper/streetlight_bridge.lua` — `DISPATCH.get_state` 实现三 scope + 描述符构造 + 复用 `read_selection` 的字节边界截断；`ENTITY_BUCKET` / `LAST_RESULT` 初始化改为由已声明 `entity_kind` 集合派生；启动期严格 manifest 校验。
- `reaper/packs/core/refs.lua` — 增 `M.RESOLVERS` 注册表 + `M.resolve(kind, ref, last_result)` 统一入口（附加式，保留并注册现有 `resolve_item` / `resolve_track` / `resolve_region`）。
- `reaper/packs/core/manifest.lua` — 暴露已声明 `entity_kind` 集合作为单一来源（供分桶派生）；模板行为不变。

Tests:

- `packages/mcp-server/src/tools/__tests__/get-state.test.ts` — 三 scope 新测试。
- 新增数据驱动实体路由测试（假 `entity_kind` 经 registry 解析 + 启动校验拒绝未知 kind）。

## 5. Contract / Schema / Error-Code Changes

- `get_state` 输入 schema：`project` / `tracks` / `regions` 从“已知未实现”变为“已实现”。
- `include` / `fields` / `cursor` — 建议本刀完全不加入 schema（不发布无效参数），Slice 02 再加。
- 新增三个 `get_state` 结果载荷 schema（project/tracks/regions）——附加式 schema 变更，属契约变更。
- 无新错误码。scope 区分语义保持：未知 scope → `PARAMS_INVALID`；已知未实现 → `SCOPE_NOT_IMPLEMENTED`（render 本刀后仍走此路）。
- 新增配置面 `STREETLIGHT_STRICT_MANIFEST`（默认 ON）。
- region 描述符：以 name 为句柄，不暴露易变 index。
- 重申 I7：read scope 不得触碰 `LAST_RESULT`。

## 6. Decisions For User

- **D-A:** `tracks` / `regions` 信封是否逐字复用 selection 的 `{items,total,returned,truncated,response_bytes}` 形状？建议：是。
- **D-B:** track 描述符 v1 字段集 = `{id(guid), name, depth(folder 深度), volume, pan, mute, solo, recarm}`？FX 排除。建议：采纳。
- **D-C:** `include:["fx"]` / `fields` / `cursor` 本刀从 schema 省略（Slice 02 再加）vs 现在就放进 schema 但返回未实现？建议：省略。
- **D-D:** project 描述符字段集 = `{bpm, time_sig_num, time_sig_den, sample_rate, length_seconds}`？render 设置摘要本刀不含。建议：采纳。
- **D-E:** `STREETLIGHT_STRICT_MANIFEST` 名称 + 默认 ON，确认。
- **D-F:** H1 本刀只加启动期严格校验，运行期保留 loud-log fallback（不硬失败），确认。

## 7. Risks & Regression Notes

- **R1 高:** Lua 重载陷阱：H1 动了 `ENTITY_BUCKET` / `LAST_RESULT` 结构 → 测试前必须完全重启 REAPER，仅重 Run 不够（generation guard / split LAST_RESULT，HANDOFF 6-3）。
- **R2:** 本刀保持同样的四桶（item/track/region/render），派生结果必须正好是这四个，各初始化为 `{}`。假实体测试要用隔离的测试 manifest，不得给生产加第 5 个桶。
- **R3:** response-budget：tracks/regions 必须逐描述符累加字节（照搬 `read_selection`），不得整体序列化后再截断；project 为单一有界对象，无需截断。
- **R4:** I7：read scope 全留在 `DISPATCH.get_state`，绝不碰 `LAST_RESULT`；加一条回归断言 —— tracks/regions 读之后 `last_result:item:N` 行为不变。
- **R5:** region index 易变（`refs.lua` 警告）——不得作为稳定 id 暴露。
- **R6:** scope 区分：render 本刀后仍 `SCOPE_NOT_IMPLEMENTED`；乱填 scope → `PARAMS_INVALID`。
- **R7:** HANDOFF 路径过时风险；勿硬编码本机路径。

PROGRESS 回归备注：

1. entity_kind 路由改数据驱动，行为保持，假实体测试验证。
2. get_state project/tracks/regions 落地；fx/分页/fields 显式延后。

