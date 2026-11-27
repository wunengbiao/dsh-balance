# dsh-balance · 侧栏底部余额卡片设计

> 版本：v1 设计稿（未开发）　·　目标 DSH：0.2.2-rc.5（Desktop profile）
> 预览：`design/mockup.html`（本地 `python3 -m http.server` 打开），截图见 `design/shot-*.png`

## 1. 要解决的问题

侧栏底部现在只有一行 **`··· 更多`**（未登录态）或 `头像 + 昵称`（已登录态）。
它其实是 `dsh-client-ui-settings-account` 注册进 **`settings.launcher`** 的 `AccountMenu`，
`设置 / 联系我们 / 登录 / 退出登录` 都藏在这个按钮弹出的菜单里。

改造目标：

1. **去掉 `··· 更多` 这一行**；
2. 同一块地板换成一张卡片，**显示余额 / 费用**；
3. **设置** 与 **登录** 直接落在卡片上；
4. 余额用已配置的 **API Key** 读取，**不依赖登录 DeepSeek 账号**。

## 2. 落点与机制（关键结论，已核对源码）

| 事实 | 结论 | 依据 |
|---|---|---|
| 底部行是 `SettingsRoot` 的 `.triggerRow`：`settings.launcher` + 连接指示器 + 更新指示器 | 卡片要接管的是 **`settings.launcher`**（single slot） | `dsh-client-ui-settings-general/src/client/SettingsRoot.tsx:225-257` |
| `settings.launcher` 唯一的占用者是 `AccountMenu` | 用 **`priority` 优先级更高的注册**（数字更小）遮蔽它即可，**不需要改任何原生包** | `dsh-client-ui-settings-account/src/client/index.ts:314-317` |
| 设置面板、`Cmd+,` 快捷键、`settings.trigger` 都在 `sidebar.settings`（`SettingsRoot` 自己） | **不要**替换 `sidebar.settings`，否则设置整体失效 | 同上 `:258-266`、`contract/slots.ts:159-171` |
| 托盘宽度 / 折叠宽度 | 280px（可拖 264–420）、折叠 56px、内边距 8px ⇒ 卡片宽 264px 且随侧栏拉伸 | `dsh-client-ui-layout/src/client/columns.ts:11-25`，`SidebarRoot.module.css:9-26` |
| 余额数据 | 宿主侧 `ctx.credentials.resolve('DEEPSEEK_API_KEY')` + `GET https://api.deepseek.com/user/balance` | `dsh-credentials/README.md`「Storing, checking, and removing keys」 |
| 客户端拿数据 | 宿主用 `webServer.register` 开 `/dsh-balance/*` 路由，客户端同源 `fetch` | 已验证可用的本地插件 `dsh-claude-plugins/lib/routes.js:22-35` |

**遮蔽的代价（需接受）**：`AccountMenu` 里原有的四项不能再丢 —— 用「头像浮层」承接（见 §5）。
`settings.launcher.notifications` 由我们接管渲染（保留更新徽标）。

**退路**：插件停用后，`AccountMenu` 自动回到原位，无残留状态。

## 3. 卡片规格（A 方案 · 推荐）

```
┌──────────────────────────────────────┐  ← flex:1，宽 264px（可到 404px）
│ 余额                       登录   ⚙ │  行高 22px
│ ¥128.40                              │  19px / 620 / tabular-nums
│ 充值 ¥120.00 · 赠送 ¥8.40        用量 │  11px / 400
└──────────────────────────────────────┘
```

| 元素 | 值 |
|---|---|
| 卡片 | `bg = --dsw-alias-bg-layer-1`，`border 1px --dsw-alias-border-l1`，`radius 12px`，`padding 9px 11px 10px`，`shadow 0 1px 2px rgba(15,17,21,.045)` |
| 「余额」标题 | 11px / 600 / `label-secondary` / `letter-spacing .02em` |
| 金额 | 19px / 620 / `label-primary` / `tabular-nums` / `letter-spacing -.02em` |
| 构成行 | 11px / 400 / `neutral-bluish-500`，金额值 `label-secondary` |
| 登录 | 文字按钮 11px / 550 / `brand-primary-new-color`（浅色 `rgb(65,118,230)`），高 22px，圆角 6px，hover 8% 蓝底 |
| 设置 | 22px 图标按钮，圆角 8px（`--dsw-radius-sm`），`label-tertiary`，hover 变 `label-secondary` + 5% 底 |
| 图标 | 16 网格、描边 1.3–2.2；正式实现直接用 `IconSettingsOutlineMedium`（`dsh-client-ui-primitives`，仅接受 `size`/`className`） |
| 状态点 | 5px，`state-success`（正常）/ `state-warn`（不足） |

**不用整宽主按钮**：余额不依赖登录，登录只是次要入口，整宽黑色按钮会把侧栏压得比会话列表还重。

## 4. 状态

| 状态 | 金额区 | 副行 | 右侧 |
|---|---|---|---|
| 正常 | `¥128.40` | `充值 ¥120.00 · 赠送 ¥8.40` | 用量 |
| 余额不足（< ¥1） | `¥0.42`，warn 色 | `● 余额不足，随时会中断` | **充值** |
| 无 API Key | `未配置 API Key`（13px `label-secondary`） | `在 设置 → 模型 里填入 DeepSeek Key` | **去设置** |
| 首次读取 | 骨架条 104×12 | 骨架条 150×9 | — |
| 读取失败 | `暂时读不到余额` | `网络或 Key 无效` | **重试** |
| 已登录 | 同上，右上角 `头像` 替换「登录」 | — | — |

规则：**失败不清空旧值**（有过成功值就继续显示，右上角挂 5px warn 点），避免余额忽隐忽现。

## 5. 头像浮层（承接「更多」的四项）

点右上角头像 → 向上弹出 172px 浮层，32px 行高、12px 圆角、`bg-layer-1` + `border-l2`：

- 账户设置 / 充值 / 联系我们
- ——— 1px 分隔线 ———
- 退出登录（`state-warn` 色）

未登录时没有头像，浮层不存在；「登录」按钮直接调 `settings.launcher` owner props 之外的动作（见 §7）。

## 6. 折叠态（56px 轨道）

| 状态 | 图标 | 角标 |
|---|---|---|
| 有余额 | 实心卡片图标（36×36、12px 圆角、`bg-layer-1` + 1px 边） | 5px success 点 |
| 余额不足 | 同上 | 5px warn 点 |
| 未配置 Key | 虚线圈卡片图标（`label-tertiary`） | 无 |

金额只在 tooltip 中出现：`余额 ¥128.40 · 充值 ¥120.00 / 赠送 ¥8.40`。36px 里不放数字。

## 7. 插件结构（`dsh-balance`）

```
dsh-balance/
├─ package.json          # dsh.bundle.patch + dsh.client{platform:web}
├─ cordis.patch.yml      # insert: dsh-balance（宿主）、dsh-balance/client（UI）
├─ index.js              # 宿主：apply(ctx) → 注册 /dsh-balance 路由
├─ lib/balance.js        # 凭据解析 + 请求 /user/balance + 60s 缓存
├─ client.js             # window.__ModuleLoader__ 工厂：遮蔽 settings.launcher
├─ locale/{zh,en}.json
├─ icon.svg + docs/DETAIL.md
```

- **宿主**：`GET /dsh-balance/balance` →
  `{ configured, currency, total, toppedUp, granted, isAvailable, fetchedAt, error? }`
  Key 解析：`ctx.credentials.resolve(credentialRef(apiKeyEnv))`，`apiKeyEnv` 默认 `DEEPSEEK_API_KEY`，可在插件配置里改。
  缓存 60s，命中不发请求；`?refresh=1` 强制刷新（卡片上的「重试」用）。
- **客户端**：`ctx.slots.inject('settings.launcher', () => ctx.slots.register({ name:'settings.launcher', priority: -10, locale:'dsh-balance', children:{'settings.launcher.notifications':{kind:'single',scope:'root'}} }, Card))`
  - `设置` → owner props `openSettings()`（面板与 `Cmd+,` 仍归原生包）
  - `登录` → 走 `ctx.remote.account.startSignIn(...)`（与原生 `AccountMenu` 同一入口；仅作可选入口，不影响卡片）
  - `扫码/等待/退出` 等完整账号流程仍由 `settings.account` 自己的组件负责
- **不碰**：`sidebar.settings`、`sidebar.footer.action`、`settings.trigger`。

## 8. 明确做不到 / 需要决定

1. **「今日消费 / 本月消费」接口不提供**。DeepSeek 余额接口只有 `total_balance / granted_balance / topped_up_balance`；
   DSH 客户端也没有可聚合的每日花费（token 计量明确声明「不是计费输入」）。
   → 本设计用 **充值 / 赠送构成** 表达「费用」，并提供「用量」跳平台用量页。
   若确实要金额消费：只能本地按价格表**估算**（角标注明「估算」），作为可选开关。
   等等 —— 见下方待确认项。
2. **`settings.launcher` 被遮蔽后**，原 `AccountMenu` 的 inject 是否仍会跑，未验证；若会跑，只是多一次订阅，不影响正确性。
3. **API Key 的实际可用性**：`GET https://api.deepseek.com/user/balance` 需要 `Authorization: Bearer <key>`；
   开发第一步就用真实 Key 验证，失败则回退到「用量」链接而不显示金额。

## 9. 待确认

- [ ] 选 A / B / C（推荐 A）
- [ ] 「费用」是否接受用「充值/赠送构成 + 用量链接」表达；还是要一个标注「估算」的消费金额
- [ ] 登录入口保留（次要文字按钮）还是彻底去掉（纯 API Key 用户）

---

## 实现记录（v1 · 已上线）

与设计稿的差异，以及为什么：

| 项 | 设计稿 | 实现 | 原因 |
|---|---|---|---|
| 费用 | 充值/赠送构成 | **去掉** | 用户决定「只要余额，不要费用」 |
| 登录 | 文字按钮 | 同 | 保留为次要文字按钮 |
| 插件入口 | 无 | **加在第 2 个图标位** | 用户要求把顶部「插件」搬到卡片 |
| 顶部「插件」行 | 保留 | **隐藏** | 同上；只在卡片挂载时用 `:root:has(.dshb-card)` 生效，轨道态保留该行 |
| 路由 | `/dsh-balance/balance` | `/dsh-balance/v1/balance` | 热重载后旧激活留下的路由会让同路径注册失败 |
| 头像浮层 | 四项菜单 | 未实现 | 已登录只保留「账户入口」；退出登录仍在 设置 → 账户 |

### 已实测（真实运行中的 GUI，非 mock）

- `GET /dsh-balance/v1/balance` → `200`，返回真实余额（CNY 1741.77），`isAvailable: true`。
- 卡片在 280px 侧栏里宽 264px、高 68px、白底/暗底各一次实拍，文字 `余额 / 登录 / 插件 / 设置 / ¥1,741.77`。
- 齿轮 → 打开内置设置面板（设置面板没被破坏）。
- 插件图标 → 打开内置插件页（已安装/发现/内置插件配置）。
- 登录 → 打开 DeepSeek 授权页（`platform.deepseek.com/sign_in?...authorize_id=...`），按钮切到「等待登录…」并禁用；无控制台报错。
- 点击金额 → `?refresh=1` 请求返回 200。
- 折叠到 56px → 36px 卡片图标 + 绿色状态点，tooltip「余额 ¥1,741.77」。
- 顶部「插件」行 `display: none`；`自动化任务 / 上下文洞察 / 更多` 仍在。

### 过程中修掉的两个真 bug（都来自热重载）

1. **reader 被销毁后不恢复**：`dispose()` 曾把实例置为永久 `disposed`，旧路由指向它 → 永远返回
   `{"ok":false,"error":"disposed"}`。现在 dispose 只清缓存，且路由通过模块级 `current` 读最新实例。
2. **路由没有返回 disposer**：`webServer.register()` 返回的释放函数被丢掉 → 禁用插件后路由残留，
   再启用时报 `duplicate exact route`。现在如实转交，并用 `test/wiring.mjs` 锁住这四条行为。

### 未覆盖

- 未配置 Key / 读取失败两个状态只在代码路径上实现，没有真的摘掉凭据去实测。
- 完整登录成功后的卡片切换（头像位）没有走完：需要真人在授权页点击，我只验证到「授权页打开」。
- 已登录态的第 3 个图标位（头像/账户）按 `accountUi` 快照推导，未在已登录账号下实拍。

---

## 第二轮改动（用户反馈）

### 1. 「更多」也进卡片

卡片右上角变成 `登录 / 账户设置 · ⋯ · ✿ · ⚙` 四个入口。⋯ 用内置 `Menu` 向上弹出侧栏面板列表，
条目来自 `ctx.slots.entriesOfSlot('sidebar.panellist')` + `ctx.slots.subscribe(...)`，**不写死**；
选中后走 `ctx.layout.selectPanel(id)`。

顶部那一行「更多」用**语义选择器**隐藏，而不是本地化文案：
`:root:has(.dshb-card) [data-sidebar-scrollport] nav span:has(> button[aria-haspopup="menu"])`。
比上一版按「插件」标签匹配更稳。仍然只在整卡挂载时生效，轨道态保留原行。

菜单项实测：`自动化任务`、`上下文洞察`；点击后 `自动化任务` 面板确实被打开。

### 2. 表面改成渐变

| 之前 | 现在 |
|---|---|
| `background: layer-1` 实色 + `border-l1` | `linear-gradient(180deg, layer-1 → sidebar-fill)` + `border-l2` + `inset 0 1px 0 rgba(255,255,255,.55)` 顶高光 |

- 浅色：`#FFFFFF → #F9FAFB`，顶部托起、底部融进侧栏。
- 暗色：`#232324 → #1B1B1C`，同样的公式，全 token，无写死颜色。
- 暗色下另有 `body[data-ds-dark-theme]` 分支把内高光降到 5%、阴影加深，避免发灰。
- 轨道态 36px 药丸用同一套渐变。

`border` 从 `l1` 提到 `l2` 是刻意的：渐变会让卡片边界变软，`l2` 保证形状还认得出来。

---

## 第三轮改动：重新排版

用户反馈「排成一排有点丑」。原布局是 `账户名 · ✿ · ⋯ · ⚙` 四个东西挤在一行，
其中第一个是宽度不定的文字，右边三个是图标，视觉重量和节奏都不齐。

改成**两个区域**：

```
余额                        ✿ ⋯ ⚙     ← 上排只放图标，永远三个，等距
¥1,739.96                  账户设置     ← 下排左边是数据，右边是账户入口
```

- **上排不再出现文字**：账户入口移到下排右侧，与金额同一基线，11px 中性色（未登录时是 accent 的「登录」）。
- **图标簇收成 0 间距**：每个 22×22、圆角 8、hover 才有底色，视觉上像一组而不是散装。
- **状态点改成按需出现**：只有低余额或读取失败时，`余额` 前面才出现 warn 点；正常时什么都不加（原来常驻绿点反而抢视线）。
- **下排一个容器两种内容**：左侧 `dshb-value` 承载金额，或「未配置 API Key + 去设置」「暂时读不到余额 + 重试」，右侧固定账户入口，任何状态都不换位。
- 高度没变（68px），没多占会话列表的空间。

实测（真实 GUI）：卡片文本为 `余额 / ¥1,739.96 / 账户设置`，图标簇为 `插件 / ⋯ / 设置`，
⋯ 菜单仍正常弹出 `自动化任务 / 上下文洞察`。浅色、暗色各一张。

---

## 第四轮改动

1. **余额左侧常驻状态点**：绿点 `state-success`，余额低于 1 或读取失败时变 `state-warn`。
2. **「更多」移到账户入口右边**：上排只剩 `插件 / 主题 / 设置` 三个图标；下排变成 `金额 …… 账户 · ⋯`。
3. **新增主题切换**：太阳/月亮图标调 `ctx.theme.setTheme('light'|'dark')`，走内置主题服务，
   与 设置 → 外观 同一条路径（会持久化）。图标显示的是"点了会切到哪"，并订阅 `theme/change` 保持同步。

实测：点「切换到浅色」→ `body[data-ds-dark-theme]` 消失、卡片渐变解析为 `#FFF→#F9FAFB`、按钮标签变为「切换到深色」；
再点回来恢复深色（用户原设定已复原）。

---

## 第五轮：去掉账户入口

用户决定卡片不显示登录。账户/登录不再出现在卡片上，只剩 `设置` 里的入口。

```
● 余额                    ✿ ☀ ⚙
¥1,738.58                     ⋯
```

顺带简化：删掉 `accountUi` 订阅、`signIn` 流程与 `pending` 状态；`inject` 从
`slots/locale/layout/remote/remote.account` 收窄为 `slots/locale/layout` —— 卡片不再依赖账户服务，
账户服务缺席时也不会停在 pending。登录入口仍在内置 设置 → 账户 里。

## 第六轮：导入会话进卡片

顶部「导入会话」按钮隐藏（按 8 种语言的 `aria-label` 匹配，`:root:has(.dshb-card)` 作用域），
卡片上新增导入图标 `导入会话 → 插件 → 主题 → 设置`。

导入插件没有对外服务（只注册了 `sidebar.session.action` 的 HOC），所以卡片是**代点它自己的触发器**：
触发器保留在 DOM 里（`display:none`），点击时按标签找到并 `.click()`，弹窗仍由它自己管理。
实测：点卡片上的导入图标 → 「导入 DeepSeek 会话记录」对话框正常弹出。


---

## 第七轮：模式切换进卡片 + 重排版

输入框左侧那个「对话 / 写代码」分段控件来自 `dsh-plugin-chat`（`.dpc-mode > .dpc-switch > button.dpc-seg`），
它没有对外服务，只有按钮本身触发建会话的流程。

做法：`display:none` 掉 `.dpc-mode`，卡片渲染一个同语义的分段控件：
- 状态：读 `.dpc-seg[aria-pressed="true"]` 的索引，MutationObserver 同步；
- 点击：按索引 `.click()` 源按钮（不复制它的建会话逻辑）；
- 插件没装（找不到 `.dpc-switch`）时不渲染这段。

排版改成两段式：

```
● 余额                 💬  <>   ⚙      ← 模式 + 设置
¥1,153.14        ⬆  ✿  ☾   ⋯         ← 金额 + 导入/插件/主题/更多
```

激活态用 `--dsw-alias-bg-skeleton` 做药丸底色（`bg-layer-2` 在浅色下是白色，等于没有）。
实测：源控件隐藏、卡片分段存在且 `对话模式` 为 active、点击卡片 `写代码` 会转发到源按钮
（用 click 间谍验证，没有真的触发建会话）。


## 第八轮：工作区头部动作回到右边

搬走 `dsh-plugin-chat` 的模式切换后，工作区头部那三个动作（搜索/视图/新建）挤到了中间。
根因不是我的排版，而是那个插件给头部动作留了 `margin-right:70px` 给它的固定定位控件：

```css
[data-sidebar-workspace-header] [class*="headerActions"]{margin-right:70px !important}
```

控件被我隐藏后，这 70px 变成右侧空洞。修法是在卡片存在时释放这段预留：
`:root:has(.dshb-card) [data-sidebar-workspace-header] [class*="headerActions"]{margin-right:0!important}`。
实测计算样式 `margin-right: 0px`，动作右边界 271 / 头部右边界 276，回到右对齐。
