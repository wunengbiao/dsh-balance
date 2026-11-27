/**
 * Client half of dsh-balance: the sidebar-foot balance card.
 *
 * Replaces the account launcher row (the signed-out "··· More" button) with a
 * card that keeps the balance, Settings, and the sign-in entry in one place.
 * The Settings panel and its shortcut stay owned by the shipped packages — only
 * this launcher row changes hands. Disabling the plugin restores the original
 * launcher without migration.
 */
window.__ModuleLoader__.load({
  id: 'dsh-balance',
  factory (require) {
    'use strict'
    const React = require('react')
    const h = React.createElement

    const BALANCE_ROUTE = '/dsh-balance/v1/balance'
    const REFRESH_MS = 5 * 60 * 1000
    const LOW_BALANCE = 1

    /** Primitives are optional: the card still renders with local glyphs. */
    let primitives
    try { primitives = require('@deepseek-ai/dsh-client-ui-primitives') } catch (_error) { primitives = undefined }
    /** Slot helpers, used to resolve a registrant's locale-aware label. */
    let slotsModule
    try { slotsModule = require('@deepseek-ai/dsh-client-ui-slots') } catch (_error) { slotsModule = undefined }

    /**
     * Read the composer's chat/code mode from its pressed segment.
     * @returns {'chat' | 'code' | null} the active mode, or null when the
     *   composer is not composed (no switch to mirror).
     */
    function readMode () {
      const segments = document.querySelectorAll('.dpc-switch .dpc-seg')
      if (segments.length < 2) return null
      for (let index = 0; index < 2; index += 1) {
        if (segments[index].getAttribute('aria-pressed') === 'true') return index === 0 ? 'chat' : 'code'
      }
      return 'chat'
    }

    /**
     * Resolve the visible label of one `sidebar.panellist` registration.
     * @param {{ options?: { label?: unknown, id?: string } }} entry - slot entry.
     * @returns {string} label text, falling back to the panel id.
     */
    function labelOf (entry) {
      const raw = entry === undefined ? undefined : entry.options?.label
      try {
        const resolved = slotsModule === undefined ? undefined : slotsModule.resolveSlotLabel(raw)
        if (typeof resolved === 'string' && resolved.length > 0) return resolved
      } catch (_error) { /* fall through to the raw forms */ }
      if (typeof raw === 'string' && raw.length > 0) return raw
      if (typeof raw === 'function') {
        try {
          const value = raw()
          if (typeof value === 'string' && value.length > 0) return value
        } catch (_error) { /* label callbacks may read their own state */ }
      }
      return typeof entry?.options?.id === 'string' ? entry.options.id : ''
    }

    const zh = {
      balance: '余额',
      login: '登录',
      signingIn: '等待登录…',
      settings: '设置',
      missingKey: '未配置 API Key',
      goSettings: '去设置',
      unavailable: '暂时读不到余额',
      retry: '重试',
      lowBalance: '余额不足',
      account: '账户设置',
      refresh: '刷新余额',
      railLabel: '余额',
      plugins: '插件',
      more: '更多',
      panels: '面板',
      themeToLight: '切换到浅色',
      themeToDark: '切换到深色',
      importChats: '导入会话',
      modeChat: '对话模式',
      modeCode: '写代码模式',
      modeChatLabel: '对话',
      modeCodeLabel: '写代码',
      modeGroup: '输入模式',
      eyebrow: 'BALANCE · 余额',
    }
    const en = {
      balance: 'Balance',
      login: 'Sign in',
      signingIn: 'Waiting…',
      settings: 'Settings',
      missingKey: 'No API key',
      goSettings: 'Open settings',
      unavailable: 'Balance unavailable',
      retry: 'Retry',
      lowBalance: 'Low balance',
      account: 'Account settings',
      refresh: 'Refresh balance',
      railLabel: 'Balance',
      plugins: 'Plugins',
      more: 'More',
      panels: 'Panels',
      themeToLight: 'Switch to light',
      themeToDark: 'Switch to dark',
      importChats: 'Import chats',
      modeChat: 'Chat mode',
      modeCode: 'Code mode',
      modeChatLabel: 'Chat',
      modeCodeLabel: 'Code',
      modeGroup: 'Composer mode',
      eyebrow: 'BALANCE',
    }

    /** Base stylesheet; the panel-list override is appended only when this plugin can replace it. */
    const BASE_CSS = [
      '.dshb-root{position:relative;flex:1;min-width:0}',
      '.dshb-root[data-rail="true"]{flex:none;width:36px}',
      // Brand-tinted pane: one alpha-based gradient over the layer-1 surface, so
      // the same declaration reads as a cool wash on light and a deep tint on
      // dark without a second colour list.
      '.dshb-card{box-sizing:border-box;display:block;width:100%;min-width:0;margin:0;padding:9px 11px 10px;',
      'border:1px solid rgba(86,134,254,.26);border-radius:12px;',
      'background-image:linear-gradient(152deg,rgba(86,134,254,.16) 0%,rgba(86,134,254,.05) 46%,rgba(86,134,254,0) 100%);',
      'background-color:var(--dsw-alias-bg-layer-1);',
      'box-shadow:inset 0 1px 0 rgba(255,255,255,.55),0 1px 2px rgba(15,17,21,.05);',
      'color:var(--dsw-alias-label-primary);font:inherit;text-align:start}',
      'body[data-ds-dark-theme] .dshb-card{',
      'background-image:linear-gradient(152deg,rgba(86,134,254,.26) 0%,rgba(86,134,254,.09) 48%,rgba(86,134,254,0) 100%);',
      'border-color:rgba(86,134,254,.34);',
      'box-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 1px 2px rgba(0,0,0,.32)}',
      '.dshb-top{display:flex;align-items:center;justify-content:space-between;min-height:22px;gap:6px}',
      '.dshb-cap{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:600;letter-spacing:.12em;',
      'text-transform:uppercase;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden}',
      // Magazine hero: the number carries the card, everything else is a hairline apart.
      '.dshb-hero{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-top:2px;',
      'font-size:26px;font-weight:620;letter-spacing:-.025em;line-height:1.16;',
      'font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary)}',
      '.dshb-hero[data-warn="true"]{color:var(--dsw-alias-state-warn-primary)}',
      '.dshb-hero[data-muted="true"]{font-size:13px;font-weight:550;letter-spacing:0;line-height:1.6;',
      'color:var(--dsw-alias-label-secondary)}',
      '.dshb-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:9px;padding-top:8px;',
      'border-top:1px solid var(--dsw-alias-border-l1)}',
      '.dshb-modes{display:inline-flex;align-items:center;gap:2px;padding:2px;flex:none;border:0;border-radius:999px}',
      '.dshb-modes button{display:inline-flex;align-items:center;justify-content:center;width:24px;height:18px;padding:0;border:0;',
      'border-radius:999px;background:transparent;color:var(--dsw-alias-label-tertiary,rgb(151,157,166));cursor:pointer}',
      '.dshb-modes button[data-active="true"]{background:var(--dsw-alias-bg-skeleton,rgba(127,127,127,.18));',
      'color:var(--dsw-alias-label-primary)}',
      '.dshb-modes button:hover:not([data-active="true"]){background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05));',
      'color:var(--dsw-alias-label-secondary)}',
      '.dshb-tools{display:flex;align-items:center;gap:2px;margin-right:-5px;flex:none}',
      // Chat/code switch: a full-width segmented bar at the foot of the card, so
      // it reads as a mode selector instead of two tiny glyphs.
      '.dshb-mode{display:flex;align-items:center;gap:2px;margin-top:9px;padding:2px;',
      'border:1px solid var(--dsw-alias-border-l2);border-radius:9px;flex:none}',
      '.dshb-mode button{flex:1;display:inline-flex;align-items:center;justify-content:center;gap:5px;height:26px;padding:0 6px;border:0;',
      'border-radius:7px;background:transparent;font:inherit;font-size:11.5px;font-weight:500;',
      'color:var(--dsw-alias-label-secondary);cursor:pointer;white-space:nowrap}',
      '.dshb-mode button[data-active="true"]{background:var(--dsw-alias-bg-skeleton,rgba(127,127,127,.18));',
      'color:var(--dsw-alias-label-primary);font-weight:600}',
      '.dshb-mode button:hover:not([data-active="true"]){background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05));',
      'color:var(--dsw-alias-label-primary)}',
      // The account entry shares the value row instead of joining the icon strip,
      // so the top row is always exactly three icons.
      '.dshb-account{height:20px;padding:0 5px;border:0;border-radius:6px;background:transparent;cursor:pointer;',
      'font:inherit;font-size:11px;font-weight:500;color:var(--dsw-alias-label-secondary);',
      'max-width:88px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:none}',
      '.dshb-account:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05))}',
      '.dshb-account[data-tone="accent"]{color:var(--dsw-alias-brand-primary-new-color,rgb(65,118,230));font-weight:550}',
      '.dshb-msg{display:inline-flex;align-items:center;gap:8px;min-width:0;overflow:hidden}',
      // The value row's trailing group: account entry, then the panel list.
      '.dshb-tail{display:inline-flex;align-items:center;gap:2px;flex:none}',
      '.dshb-msg-text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}',
      '.dshb-login{height:22px;padding:0 7px;border:0;border-radius:6px;background:transparent;',
      'color:var(--dsw-alias-brand-primary-new-color,rgb(65,118,230));font:inherit;font-size:11px;font-weight:550;cursor:pointer;white-space:nowrap}',
      '.dshb-login:hover{background:rgba(86,134,254,.10)}',
      '.dshb-login[disabled]{color:var(--dsw-alias-label-tertiary,rgb(151,157,166));cursor:default}',
      // Signed in, the entry is a destination rather than a call to action: drop
      // the accent and keep long profile names inside the row.
      '.dshb-login[data-tone="quiet"]{color:var(--dsw-alias-label-secondary);font-weight:500;max-width:84px;overflow:hidden;text-overflow:ellipsis}',
      '.dshb-icon{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;padding:0;border:0;border-radius:8px;',
      'background:transparent;color:var(--dsw-alias-label-tertiary,rgb(151,157,166));cursor:pointer}',
      '.dshb-icon:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05));color:var(--dsw-alias-label-secondary)}',
      '.dshb-value{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:19px;font-weight:620;',
      'letter-spacing:-.02em;line-height:1.32;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary)}',
      '.dshb-value[data-muted="true"]{font-size:13px;font-weight:550;letter-spacing:0;line-height:1.6;color:var(--dsw-alias-label-secondary)}',
      '.dshb-value[data-warn="true"]{color:var(--dsw-alias-state-warn-primary)}',
      '.dshb-amount{border:0;background:none;padding:0;font:inherit;color:inherit;letter-spacing:inherit;cursor:pointer;text-align:start}',
      '.dshb-dot{display:inline-block;flex:none;width:5px;height:5px;border-radius:50%;background:var(--dsw-alias-state-success-primary)}',
      '.dshb-dot[data-warn="true"]{background:var(--dsw-alias-state-warn-primary)}',
      '.dshb-hint{font-size:11px;font-weight:500;color:var(--dsw-alias-label-tertiary,rgb(151,157,166));white-space:nowrap}',
      '.dshb-hint[data-warn="true"]{color:var(--dsw-alias-state-warn-primary)}',
      '.dshb-action{border:0;background:none;padding:0;font:inherit;font-size:11px;font-weight:500;',
      'color:var(--dsw-alias-brand-primary-new-color,rgb(65,118,230));cursor:pointer;white-space:nowrap}',
      '.dshb-action:hover{text-decoration:underline;text-underline-offset:2px}',
      '.dshb-sk{display:block;height:12px;border-radius:4px;background:var(--dsw-alias-bg-skeleton,rgba(0,0,0,.07))}',
      '.dshb-rail{display:flex;align-items:center;justify-content:center;position:relative;width:36px;height:36px;padding:0;',
      'border:1px solid rgba(86,134,254,.26);border-radius:12px;',
      'background-image:linear-gradient(152deg,rgba(86,134,254,.16) 0%,rgba(86,134,254,.04) 60%,rgba(86,134,254,0) 100%);',
      'background-color:var(--dsw-alias-bg-layer-1);',
      'color:var(--dsw-alias-label-primary);box-shadow:inset 0 1px 0 rgba(255,255,255,.55),0 1px 2px rgba(15,17,21,.045);cursor:pointer}',
      'body[data-ds-dark-theme] .dshb-rail{',
      'background-image:linear-gradient(152deg,rgba(86,134,254,.26) 0%,rgba(86,134,254,.07) 60%,rgba(86,134,254,0) 100%);',
      'border-color:rgba(86,134,254,.34);',
      'box-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 1px 2px rgba(0,0,0,.32)}',
      '.dshb-rail[data-muted="true"]{color:var(--dsw-alias-label-tertiary,rgb(151,157,166));background:transparent;border-style:dashed}',
      '.dshb-rail:hover{background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-layer-1))}',
      '.dshb-rail-dot{position:absolute;right:3px;bottom:3px;width:7px;height:7px;border-radius:50%;',
      'background:var(--dsw-alias-state-success-primary);border:1.5px solid var(--dsw-alias-bg-layer-1)}',
      '.dshb-rail-dot[data-warn="true"]{background:var(--dsw-alias-state-warn-primary)}',
      '.dshb-more-menu{min-width:156px}',
      '.dshb-more-menu [role="menuitem"]{min-height:34px;font-size:13px}',
      // The Plugins launcher now lives on this card. Hide the shipped panel row
      // only while the wide card is mounted, matched by accessible name so a
      // renamed row simply reappears instead of leaving a dead gap.
      ':root:has(.dshb-card) [data-sidebar-scrollport] nav div:has(> button[aria-label="插件"]),',
      ':root:has(.dshb-card) [data-sidebar-scrollport] nav div:has(> button[aria-label="Plugins"]),',
      ':root:has(.dshb-card) [data-sidebar-scrollport] nav div:has(> button[aria-label="Complementos"]),',
      ':root:has(.dshb-card) [data-sidebar-scrollport] nav div:has(> button[aria-label="Плагины"]),',
      ':root:has(.dshb-card) [data-sidebar-scrollport] nav div:has(> button[aria-label="Plug-ins"]),',
      ':root:has(.dshb-card) [data-sidebar-scrollport] nav div:has(> button[aria-label="プラグイン"])',
      '{display:none}',
      // The DeepSeek session importer moves onto this card; its own trigger is
      // hidden by accessible name in every shipped locale.
      ':root:has(.dshb-card) button[aria-label="导入 DeepSeek 会话"],',
      ':root:has(.dshb-card) button[aria-label="Import DeepSeek chats"],',
      ':root:has(.dshb-card) button[aria-label="DeepSeek のチャットをインポート"],',
      ':root:has(.dshb-card) button[aria-label="Importar chats de DeepSeek"],',
      ':root:has(.dshb-card) button[aria-label="Importer des discussions DeepSeek"],',
      ':root:has(.dshb-card) button[aria-label="DeepSeek-Chats importieren"],',
      ':root:has(.dshb-card) button[aria-label="Импортировать чаты DeepSeek"],',
      ':root:has(.dshb-card) button[aria-label="Importar conversas do DeepSeek"]',
      '{display:none}',
      // The New Session row is gone too; the brand mark and each workspace row
      // still start sessions, so the action stays reachable.
      ':root:has(.dshb-card) [class*="_newSessionRow"]',
      '{display:none}',
      // Every panel entry now lives in this card's panel menu, so the panel
      // navigation list is empty space above the workspaces; drop it and keep
      // the brand row tight against the workspace header.
      // The composer's chat/code switch moves onto this card.
      ':root:has(.dshb-card) .dpc-mode',
      '{display:none!important}',
      // The chat plugin reserves 70px at the right of the workspace header for
      // that fixed-position switch; with the switch gone the reservation would
      // leave the section actions stranded in the middle, so release it.
      ':root:has(.dshb-card) [data-sidebar-workspace-header] [class*="headerActions"]',
      '{margin-right:0!important}',
      ':root:has(.dshb-card) [data-sidebar-scrollport] nav',
      '{display:none}',

      ':root:has(.dshb-card) [class*="_scrollRegion"]',
      '{margin-top:-10px!important}',
      // Anything the shipped shell kept between the brand row and the first
      // section collapses too: the nav contributes no height and the section
      // header loses its top padding.
      ':root:has(.dshb-card) [data-sidebar-scrollport] nav',
      '{display:none!important;height:0!important;margin:0!important;padding:0!important}',
      ':root:has(.dshb-card) [class*="_scrollArea"]',
      '{padding-top:0!important}',
      ':root:has(.dshb-card) [class*="_sectionHeader"]',
      '{padding-top:0!important;margin-top:0!important}',
    ].join('')

    /**
     * The panel list's own More launcher is identified by its menu semantics,
     * not by a hashed class or a localized label: hiding it is unconditional
     * once the card owns that menu.
     */
    const MORE_ROW_HIDE_CSS = ':root:has(.dshb-card) [data-sidebar-scrollport] nav span:has(> button[aria-haspopup="menu"]){display:none}'

    /**
     * Resolve one dictionary key, preferring the Client locale service.
     * @param {((key: string) => string) | undefined} t - slot locale seat.
     * @param {string} active - active locale id.
     * @param {string} key - dictionary key.
     * @returns {string} visible text.
     */
    function text (t, active, key) {
      if (typeof t === 'function') {
        const value = t(key)
        if (typeof value === 'string' && value.length > 0 && value !== key) return value
      }
      const dict = /^zh/i.test(active) ? zh : en
      return dict[key] ?? key
    }

    /**
     * Format a decimal amount the way the platform does: two decimals, grouped,
     * sub-cent values shown as `<0.01`.
     * @param {string} amount - decimal string from the balance payload.
     * @param {string} currency - ISO currency reported by the platform.
     * @returns {string} display text.
     */
    function formatMoney (amount, currency) {
      const symbol = currency === 'USD' ? '$' : '¥'
      const value = Number(amount)
      if (!Number.isFinite(value)) return symbol + '—'
      if (value === 0) return symbol + '0.00'
      if (value < 0.01) return '<' + symbol + '0.01'
      const [integer, fraction] = value.toFixed(2).split('.')
      return symbol + Number(integer).toLocaleString('en-US') + '.' + fraction
    }

    /** Local copy of the settings gear, used when primitives are unavailable. */
    function GearGlyph ({ size = 14 }) {
      const Icon = primitives === undefined ? undefined : primitives.IconSettingsOutlineMedium
      if (typeof Icon === 'function') return h(Icon, { size })
      return h('svg', {
        width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true,
      },
      h('circle', { cx: 8, cy: 8, r: 3.9, stroke: 'currentColor', strokeWidth: 2.2 }),
      h('g', { stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' },
      h('path', { d: 'M12.9 8h1.3M3.1 8H1.8M8 12.9v1.3M8 3.1V1.8M11.46 11.46l.94.94M4.54 11.46l-.94.94M4.54 4.54l-.94-.94M11.46 4.54l.94-.94' })))
    }

    /** Card glyph for the collapsed rail. */
    function CardGlyph ({ size = 16, dashed = false }) {
      return h('svg', {
        width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true,
      },
      h('rect', {
        x: 1.9, y: 3.9, width: 12.2, height: 8.4, rx: 2.3,
        stroke: 'currentColor', strokeWidth: 1.35,
        ...(dashed ? { strokeDasharray: '2.2 1.8' } : {}),
      }),
      dashed ? null : h('circle', { cx: 11.2, cy: 8.1, r: 1.05, fill: 'currentColor' }))
    }

    /** Chat-mode glyph (speech bubble). */
    function ChatGlyph () {
      return h('svg', { width: 12, height: 12, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinejoin: 'round', 'aria-hidden': true },
        h('path', { d: 'M2.4 4.1a1.7 1.7 0 0 1 1.7-1.7h7.8a1.7 1.7 0 0 1 1.7 1.7v5a1.7 1.7 0 0 1-1.7 1.7H7.4L4.2 13.6v-2.8h-.1a1.7 1.7 0 0 1-1.7-1.7z' }))
    }

    /** Code-mode glyph (angle brackets). */
    function CodeGlyph () {
      return h('svg', { width: 12, height: 12, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
        h('path', { d: 'M6.1 4.6 2.8 8l3.3 3.4M9.9 4.6 13.2 8l-3.3 3.4' }))
    }

    /** Session-import glyph. */
    function ImportGlyph ({ size = 14 }) {
      const Icon = primitives === undefined
        ? undefined
        : (primitives.IconImportOutlineMedium ?? primitives.IconUploadOutlineMedium)
      if (typeof Icon === 'function') return h(Icon, { size })
      return h('svg', { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', 'aria-hidden': true },
        h('path', { d: 'M8 2.2v7.4M5.2 4.9 8 2.2l2.8 2.7' }),
        h('path', { d: 'M3 9.6v2.6a1.4 1.4 0 0 0 1.4 1.4h7.2a1.4 1.4 0 0 0 1.4-1.4V9.6' }))
    }

    /** Theme toggle glyph: shows the scheme the button switches TO. */
    function ThemeGlyph ({ to, size = 14 }) {
      const Icon = primitives === undefined
        ? undefined
        : (to === 'light' ? primitives.IconLightOutlineMedium : primitives.IconDarkOutlineMedium)
      if (typeof Icon === 'function') return h(Icon, { size })
      return to === 'light'
        ? h('svg', { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.35, strokeLinecap: 'round', 'aria-hidden': true },
          h('circle', { cx: 8, cy: 8, r: 3, fill: 'none' }),
          h('path', { d: 'M8 1.4v1.4M8 13.2v1.4M1.4 8h1.4M13.2 8h1.4M3.4 3.4l1 1M11.6 11.6l1 1M12.6 3.4l-1 1M4.4 11.6l-1 1' }))
        : h('svg', { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.35, strokeLinecap: 'round', 'aria-hidden': true },
          h('path', { d: 'M12.8 9.6A5.2 5.2 0 0 1 6.4 3.2a5.4 5.4 0 1 0 6.4 6.4Z' }))
    }

    /** Panel-list "more" glyph. */
    function MoreGlyph ({ size = 14 }) {
      const Icon = primitives === undefined
        ? undefined
        : (primitives.IconEllipsisOutlineMedium ?? primitives.IconMoreOutlineMedium)
      if (typeof Icon === 'function') return h(Icon, { size })
      return h('svg', { width: size, height: size, viewBox: '0 0 16 16', fill: 'currentColor', 'aria-hidden': true },
        h('circle', { cx: 3.2, cy: 8, r: 1.25 }),
        h('circle', { cx: 8, cy: 8, r: 1.25 }),
        h('circle', { cx: 12.8, cy: 8, r: 1.25 }))
    }

    /** Plugins panel glyph, mirroring the sidebar's pinwheel. */
    function PluginGlyph ({ size = 14 }) {
      const Icon = primitives === undefined ? undefined : primitives.IconPluginPinwheelOutlineMedium
      if (typeof Icon === 'function') return h(Icon, { size })
      const petal = (cx, cy) => h('circle', { cx, cy, r: 2.35, fill: 'currentColor', key: cx + ':' + cy })
      return h('svg', {
        width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true,
      },
      h('g', { opacity: 0.92 }, petal(5.6, 5.6), petal(10.4, 5.6), petal(5.6, 10.4), petal(10.4, 10.4)),
      h('circle', { cx: 8, cy: 8, r: 1.5, fill: 'var(--dsw-alias-bg-layer-1,rgb(255,255,255))' }))
    }

    /**
     * Build the card component bound to this plugin context.
     * @param {object} ctx - client plugin context.
     * @returns {Function} React component registered into `settings.launcher`.
     */
    function componentFor (ctx, css, canMore) {
      /**
       * Balance card.
       * @param {object} props - `settings.launcher` owner props plus the locale seat.
       * @returns {object} React element.
       */
      return function BalanceCard (props) {
        const { wide = true, openSettings, t } = props
        const active = ctx.locale.getSnapshot().active
        const tr = (key) => text(t, active, key)

        const [payload, setPayload] = React.useState(undefined)
        const [panels, setPanels] = React.useState([])
        const [menuOpen, setMenuOpen] = React.useState(false)
        const [mode, setMode] = React.useState(() => readMode())
        const [hasMode, setHasMode] = React.useState(() => mode !== null)
        const [scheme, setScheme] = React.useState(() => {
          try { return ctx.get('theme')?.getTheme().active.colorScheme ?? 'light' } catch (_error) { return 'light' }
        })
        const [busy, setBusy] = React.useState(false)
        const alive = React.useRef(true)

        const load = React.useCallback(async (force) => {
          setBusy(true)
          try {
            const response = await fetch(BALANCE_ROUTE + (force === true ? '?refresh=1' : ''), {
              headers: { accept: 'application/json' }, cache: 'no-store',
            })
            const next = await response.json()
            if (alive.current) setPayload(next)
          } catch (error) {
            if (!alive.current) return
            setPayload((previous) => previous !== undefined && previous.ok === true
              ? { ...previous, ok: false, reason: 'network', stale: previous }
              : { ok: false, reason: 'network', error: String(error) })
          } finally {
            if (alive.current) setBusy(false)
          }
        }, [])

        React.useEffect(() => {
          alive.current = true
          void load(false)
          const timer = setInterval(() => { if (!document.hidden) void load(false) }, REFRESH_MS)
          const onFocus = () => { void load(false) }
          window.addEventListener('focus', onFocus)
          return () => {
            alive.current = false
            clearInterval(timer)
            window.removeEventListener('focus', onFocus)
          }
        }, [load])

        // The card owns the panel list's More launcher, so it reads the live
        // registrations instead of copying a static list.
        React.useEffect(() => {
          if (!canMore) return undefined
          const read = () => {
            let entries = []
            try { entries = ctx.slots.entriesOfSlot('sidebar.panellist') ?? [] } catch (_error) { entries = [] }
            setPanels(entries
              .map((entry) => ({ id: entry.options?.id, label: labelOf(entry), order: entry.options?.order ?? 0 }))
              .filter((entry) => typeof entry.id === 'string' && entry.id.length > 0 && entry.id !== 'plugins')
              .sort((a, b) => a.order - b.order))
          }
          read()
          let off
          try { off = ctx.slots.subscribe('sidebar.panellist', read) } catch (_error) { off = undefined }
          return typeof off === 'function' ? off : undefined
        }, [])

        React.useEffect(() => {
          let theme
          try { theme = ctx.get('theme') } catch (_error) { theme = undefined }
          if (theme === undefined) return undefined
          const read = () => {
            try { setScheme(theme.getTheme().active.colorScheme) } catch (_error) { /* keep the last scheme */ }
          }
          read()
          const off = ctx.on('theme/change', read)
          return typeof off === 'function' ? off : undefined
        }, [])

        const wallets = payload?.ok === true && payload.configured === true && Array.isArray(payload.wallets) ? payload.wallets : []
        const primary = wallets[0]
        const stale = payload?.ok === false ? undefined : undefined
        const shown = primary ?? stale?.wallets?.[0]
        const amount = shown === undefined ? undefined : formatMoney(shown.total, shown.currency)
        const low = shown !== undefined && Number(shown.total) < LOW_BALANCE
        const failed = payload !== undefined && payload.ok === false
        const missingKey = payload !== undefined && payload.ok === true && payload.configured === false
        const loading = payload === undefined || (busy && shown === undefined)

        const caption = h('span', { className: 'dshb-cap' },
          h('span', { className: 'dshb-dot', 'data-warn': low || failed ? 'true' : 'false' }),
          tr('eyebrow'))

        // `pluginNavigation` is the plugin manager's own entry point: it selects
        // the Plugins panel and resets it to the Installed list. The layout
        // service is the fallback; Settings is the last resort.
        const openPlugins = () => {
          try {
            const navigation = ctx.get('pluginNavigation')
            if (navigation !== undefined && typeof navigation.openList === 'function') {
              navigation.openList()
              return
            }
            const layout = ctx.get('layout')
            if (layout !== undefined && typeof layout.selectPanel === 'function') {
              layout.selectPanel('plugins')
              return
            }
            throw new Error('plugins entry unavailable')
          } catch (_error) {
            if (typeof openSettings === 'function') openSettings()
          }
        }

        const pluginsButton = h('button', {
          type: 'button', className: 'dshb-icon', title: tr('plugins'), 'aria-label': tr('plugins'),
          onClick: openPlugins,
        }, h(PluginGlyph, { size: 14 }))

        const openPanel = (id) => {
          try {
            const layout = ctx.get('layout')
            if (layout === undefined || typeof layout.selectPanel !== 'function') throw new Error('layout unavailable')
            layout.selectPanel(id)
          } catch (_error) {
            if (typeof openSettings === 'function') openSettings()
          }
        }

        const MenuPrimitive = canMore && primitives !== undefined ? primitives.Menu : undefined
        const moreControl = panels.length === 0 || typeof MenuPrimitive !== 'function'
          ? null
          : h(MenuPrimitive, {
            open: menuOpen,
            side: 'top',
            portal: true,
            autoFocus: true,
            listClassName: 'dshb-more-menu',
            anchor: h('button', {
              type: 'button', className: 'dshb-icon', title: tr('more'), 'aria-label': tr('more'),
              'aria-haspopup': 'menu', 'aria-expanded': menuOpen,
              onClick: () => setMenuOpen((value) => !value),
            }, h(MoreGlyph, { size: 14 })),
            items: panels.map((panel) => ({ id: panel.id, label: panel.label })),
            onClose: () => setMenuOpen(false),
            onSelect: (id) => { setMenuOpen(false); openPanel(id) },
          })

        // The composer owns the mode switch and its session-opening flow, so the
        // card mirrors its pressed state and activates the same buttons.
        React.useEffect(() => {
          const read = () => {
            const next = readMode()
            setMode(next)
            setHasMode(next !== null)
          }
          read()
          const observer = new MutationObserver(read)
          observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['aria-pressed', 'class'] })
          return () => observer.disconnect()
        }, [])

        const chooseMode = (index) => {
          const buttons = document.querySelectorAll('.dpc-switch .dpc-seg')
          const target = buttons[index]
          if (target !== undefined) target.click()
        }

        // Two icon buttons in a pill: the mode is a switch, not a label.
        const modeControl = hasMode
          ? h('span', { className: 'dshb-modes', role: 'group', 'aria-label': tr('modeGroup') },
            h('button', {
              type: 'button', title: tr('modeChat'), 'aria-label': tr('modeChat'),
              'data-active': mode === 'chat' ? 'true' : 'false',
              onClick: () => chooseMode(0),
            }, h(ChatGlyph)),
            h('button', {
              type: 'button', title: tr('modeCode'), 'aria-label': tr('modeCode'),
              'data-active': mode === 'code' ? 'true' : 'false',
              onClick: () => chooseMode(1),
            }, h(CodeGlyph)))
          : null

        const targetScheme = scheme === 'dark' ? 'light' : 'dark'
        const themeButton = h('button', {
          type: 'button', className: 'dshb-icon',
          title: targetScheme === 'light' ? tr('themeToLight') : tr('themeToDark'),
          'aria-label': targetScheme === 'light' ? tr('themeToLight') : tr('themeToDark'),
          onClick: () => {
            try { ctx.get('theme')?.setTheme(targetScheme) } catch (_error) { /* theme service absent */ }
          },
        }, h(ThemeGlyph, { to: targetScheme, size: 14 }))

        // The importer owns its dialog and exposes no service, so the card
        // activates its trigger. The trigger stays in the DOM (hidden) for this.
        const IMPORT_LABELS = [
          '导入 DeepSeek 会话', 'Import DeepSeek chats', 'DeepSeek のチャットをインポート',
          'Importar chats de DeepSeek', 'Importer des discussions DeepSeek', 'DeepSeek-Chats importieren',
          'Импортировать чаты DeepSeek', 'Importar conversas do DeepSeek',
        ]
        const importButton = h('button', {
          type: 'button', className: 'dshb-icon', title: tr('importChats'), 'aria-label': tr('importChats'),
          onClick: () => {
            for (const label of IMPORT_LABELS) {
              const trigger = document.querySelector('button[aria-label="' + label + '"]')
              if (trigger !== null) { trigger.click(); return }
            }
            if (typeof openSettings === 'function') openSettings()
          },
        }, h(ImportGlyph, { size: 14 }))

        const gear = h('button', {
          type: 'button', className: 'dshb-icon', title: tr('settings'), 'aria-label': tr('settings'),
          onClick: () => { if (typeof openSettings === 'function') openSettings() },
        }, h(GearGlyph, { size: 14 }))

        if (!wide) {
          const label = shown === undefined ? tr('railLabel') : tr('railLabel') + ' ' + amount
          return h('div', { className: 'dshb-root', 'data-rail': 'true' },
            h('style', null, css),
            h('button', {
              type: 'button', className: 'dshb-rail', title: label, 'aria-label': label,
              'data-muted': shown === undefined ? 'true' : 'false',
              onClick: () => { void load(true) },
            },
            h(CardGlyph, { size: 16, dashed: shown === undefined }),
            shown === undefined ? null : h('span', { className: 'dshb-rail-dot', 'data-warn': low ? 'true' : 'false' })))
        }

        // One row, two zones: whatever the card has to say on the left, the
        // account entry on the right. The icon strip above never carries text.
        let leading
        if (loading) {
          leading = h('span', { className: 'dshb-sk', style: { width: 96 } })
        } else if (missingKey) {
          leading = h('span', { className: 'dshb-msg' },
            h('span', { className: 'dshb-msg-text' }, tr('missingKey')),
            h('button', {
              type: 'button', className: 'dshb-action',
              onClick: () => { if (typeof openSettings === 'function') openSettings() },
            }, tr('goSettings')))
        } else if (shown === undefined) {
          leading = h('span', { className: 'dshb-msg' },
            h('span', { className: 'dshb-msg-text' }, tr('unavailable')),
            h('button', { type: 'button', className: 'dshb-action', onClick: () => { void load(true) } }, tr('retry')))
        } else {
          leading = h('button', {
            type: 'button', className: 'dshb-amount', title: tr('refresh'),
            onClick: () => { void load(true) },
          }, amount)
        }

        const muted = loading || missingKey || shown === undefined
        const hero = h('div', {
          className: 'dshb-hero',
          'data-muted': muted ? 'true' : 'false',
          'data-warn': !muted && low ? 'true' : 'false',
        }, leading)

        return h('div', { className: 'dshb-root' },
          h('style', null, css),
          h('div', { className: 'dshb-card' },
            h('div', { className: 'dshb-top' }, caption, h('span', { className: 'dshb-tools' }, gear)),
            hero,
            h('div', { className: 'dshb-foot' },
              h('span', { className: 'dshb-tools' }, importButton, pluginsButton, themeButton, moreControl),
              modeControl)))
      }
    }

    return {
      // `layout` opens the Plugins panel; Settings and sign-in stay inside the
      // shipped Settings panel, so this card needs no account service.
      inject: ['slots', 'locale', 'layout'],
      apply (ctx) {
        ctx.effect(() => ctx.locale.register('dsh-balance', { en, zh }), 'dsh-balance: dictionaries')
        const canMore = primitives !== undefined && typeof primitives.Menu === 'function'
          && typeof ctx.slots.entriesOfSlot === 'function'
        const Card = componentFor(ctx, canMore ? BASE_CSS + MORE_ROW_HIDE_CSS : BASE_CSS, canMore)
        ctx.slots.inject('settings.launcher', () => ctx.slots.register({
          name: 'settings.launcher',
          priority: -10,
          locale: 'dsh-balance',
        }, Card))
      },
    }
  },
})
