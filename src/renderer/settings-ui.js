// Fenêtre « Paramètres » : apparence (mode, couleurs, police), langue, onglets et espaces,
// comportement (enregistrement automatique…), raccourcis clavier et intégration à Windows.
import { ACCENT_PRESETS, normalizeHex, contrast, computePalette } from '../shared/palette.js';
import {
  GROUPS,
  ACTIONS,
  actionLabel,
  groupLabel,
  effectiveBindings,
  isCustomized,
  formatCombo,
  formatModifiers,
  modifiersFromEvent,
  comboFromEvent,
  validateCombo,
  findConflict,
  withBinding,
  withDefaults,
} from './shortcuts.js';
import { state, api, updateSettings, currentMode, darkQuery } from './context.js';
import { openModal, toast, confirmModal } from './ui.js';
import { icons, brandMark } from './icons.js';
import { h } from './util.js';
import { t, lang, LANGUAGES, onLanguageChange, systemLanguageName } from './i18n.js';
import { FONT_MIN, FONT_MAX } from './documents.js';
import { openSpaceEditor, docsInSpace, switchSpace, onSpacesChanged, setTabsPanelState } from './tabs.js';
import { shortcutLabel } from './commands.js';
import { AUTOSAVE_MODES, INTERVAL_MIN, INTERVAL_MAX, autoSaveMode, autoSaveMinutes } from './autosave.js';
import { platform } from './platform.js';

const SECTIONS = [
  { id: 'appearance', label: 'settings.appearance', icon: 'palette' },
  { id: 'language', label: 'settings.language', icon: 'globe' },
  { id: 'tabs', label: 'settings.tabs', icon: 'layers' },
  { id: 'behavior', label: 'settings.behavior', icon: 'sliders' },
  { id: 'shortcuts', label: 'action.shortcuts', icon: 'keyboard' },
  { id: 'windows', label: 'settings.windows', icon: 'windows' },
].filter((section) => section.id !== 'windows' || platform === 'win32');

let current = null;

function renderNav(nav) {
  nav.setAttribute('aria-label', t('settings.categories'));
  nav.replaceChildren(
    ...SECTIONS.map((s) =>
      h(
        'button',
        {
          type: 'button',
          class: `settings-nav-item${current && current.section === s.id ? ' active' : ''}`,
          dataset: { section: s.id },
          onClick: () => showSection(s.id),
        },
        h('span', { class: 'nav-icon', html: icons[s.icon] }),
        h('span', {}, t(s.label)),
      )),
  );
}

export function openSettings(section = 'appearance') {
  if (current) {
    showSection(section);
    return;
  }
  const nav = h('nav', { class: 'settings-nav' });
  const pane = h('div', { class: 'settings-pane' });
  const onMode = () => {
    if (current && current.section === 'appearance') rerender();
  };
  darkQuery.addEventListener('change', onMode);
  const unsubscribeSpaces = onSpacesChanged(() => {
    if (current && current.section === 'tabs') rerender();
  });
  // Nouvelle langue : la fenêtre se traduit sans se fermer.
  const unsubscribeLanguage = onLanguageChange(() => {
    if (!current) return;
    const title = current.modal.dialog.querySelector('.modal-header h2');
    if (title) title.textContent = t('action.settings');
    current.modal.dialog.setAttribute('aria-label', t('action.settings'));
    renderNav(current.nav);
    rerender();
  });
  const modal = openModal({
    title: t('action.settings'),
    content: h('div', { class: 'settings-layout' }, nav, pane),
    width: 880,
    className: 'modal-settings',
    onClose: () => {
      recorder.cancel();
      darkQuery.removeEventListener('change', onMode);
      unsubscribeSpaces();
      unsubscribeLanguage();
      current = null;
    },
  });
  current = { modal, nav, pane, section: null };
  renderNav(nav);
  showSection(section);
}

function showSection(id) {
  if (!current) return;
  if (!SECTIONS.some((section) => section.id === id)) id = 'appearance';
  recorder.cancel();
  current.section = id;
  for (const button of current.nav.children) button.classList.toggle('active', button.dataset.section === id);
  const renderers = {
    appearance: renderAppearance,
    language: renderLanguage,
    tabs: renderTabsSection,
    behavior: renderBehavior,
    shortcuts: renderShortcuts,
    windows: renderWindows,
  };
  current.pane.replaceChildren(...renderers[id]().filter(Boolean));
  current.pane.scrollTop = 0;
}

function rerender() {
  if (!current) return;
  const top = current.pane.scrollTop;
  showSection(current.section);
  current.pane.scrollTop = top;
}

// --- Petits composants ------------------------------------------------------------------

const title = (text) => h('h3', { class: 'settings-title' }, text);
const subtitle = (text, hint) =>
  h('div', { class: 'settings-subtitle' }, h('span', {}, text), hint ? h('span', { class: 'settings-hint' }, hint) : null);

function settingRow(label, description, control, extraClass = '') {
  return h(
    'div',
    { class: `setting${extraClass ? ` ${extraClass}` : ''}` },
    h('div', { class: 'setting-text' }, h('div', { class: 'setting-label' }, label), description ? h('div', { class: 'setting-desc' }, description) : null),
    control,
  );
}

function segmented(options, value, onChange) {
  const wrap = h('div', { class: 'seg', role: 'radiogroup' });
  for (const [key, label] of options) {
    wrap.append(
      h(
        'button',
        {
          type: 'button',
          role: 'radio',
          'aria-checked': key === value ? 'true' : 'false',
          class: key === value ? 'active' : '',
          onClick: (e) => {
            for (const b of wrap.children) {
              b.classList.remove('active');
              b.setAttribute('aria-checked', 'false');
            }
            e.currentTarget.classList.add('active');
            e.currentTarget.setAttribute('aria-checked', 'true');
            onChange(key);
          },
        },
        label,
      ),
    );
  }
  return wrap;
}

function select(options, value, onChange, ariaLabel) {
  const el = h(
    'select',
    { class: 'select', 'aria-label': ariaLabel },
    options.map(([key, label]) => h('option', { value: key, selected: key === value }, label)),
  );
  el.addEventListener('change', () => onChange(el.value));
  return el;
}

function settingSwitch(key, { invert = false } = {}) {
  const value = invert ? state.settings[key] === false : state.settings[key] !== false && Boolean(state.settings[key]);
  const input = h('input', { type: 'checkbox', class: 'switch', role: 'switch', checked: value });
  input.addEventListener('change', () => updateSettings({ [key]: invert ? !input.checked : input.checked }));
  return input;
}

/** Pastille de couleur : sélecteur natif + code hexadécimal modifiable. */
function colorPill(value, onChange) {
  let currentValue = value;
  const picker = h('input', { type: 'color', value, tabindex: '-1' });
  const swatch = h('span', { class: 'pill-swatch' });
  const hex = h('input', {
    type: 'text',
    class: 'pill-hex',
    value: value.toUpperCase(),
    maxlength: '7',
    spellcheck: 'false',
    'aria-label': t('settings.colorCode'),
  });
  const set = (v, notify) => {
    currentValue = v;
    swatch.style.background = v;
    picker.value = v;
    hex.value = v.toUpperCase();
    if (notify) onChange(v);
  };
  picker.addEventListener('input', () => set(picker.value, true));
  hex.addEventListener('change', () => {
    const v = normalizeHex(hex.value);
    if (v) set(v, true);
    else hex.value = currentValue.toUpperCase();
  });
  hex.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      hex.blur();
    }
  });
  set(value, false);
  return {
    el: h('div', { class: 'color-pill' }, h('label', { class: 'pill-picker', title: t('settings.pickColor') }, picker, swatch), hex),
    set,
  };
}

// --- Apparence ----------------------------------------------------------------------------

function miniWindow(kind) {
  return h(
    'span',
    { class: `mini mini-${kind}` },
    h('span', { class: 'mini-bar' }),
    h('span', { class: 'mini-side' }),
    h('span', { class: 'mini-main' }, h('span', { class: 'mini-line w70' }), h('span', { class: 'mini-line w90' }), h('span', { class: 'mini-line w50 accent' })),
  );
}

function modeCards() {
  const wrap = h('div', { class: 'mode-cards', role: 'radiogroup', 'aria-label': t('settings.mode') });
  const options = [
    ['system', t('settings.modeAuto')],
    ['light', t('settings.modeLight')],
    ['dark', t('settings.modeDark')],
  ];
  for (const [value, label] of options) {
    const active = state.settings.theme === value;
    wrap.append(
      h(
        'button',
        {
          type: 'button',
          role: 'radio',
          'aria-checked': active ? 'true' : 'false',
          class: `mode-card${active ? ' active' : ''}`,
          onClick: () => {
            if (state.settings.theme === value) return;
            updateSettings({ theme: value });
            setTimeout(rerender, 80);
          },
        },
        h('span', { class: `mode-preview mode-${value}` }, value === 'system' ? [miniWindow('light'), miniWindow('dark')] : miniWindow(value)),
        h('span', { class: 'mode-label' }, label),
      ),
    );
  }
  return wrap;
}

function colorsBlock() {
  const mode = currentMode();
  const dark = mode === 'dark';
  const colors = state.settings.colors || {};
  const palette = computePalette(mode, colors);
  const perMode = colors[mode] || {};
  const warning = h('div', { class: 'contrast-warning', hidden: true });

  const lowContrast = (ratio) => t('settings.lowContrast', { ratio: ratio.toLocaleString(lang(), { maximumFractionDigits: 1, minimumFractionDigits: 1 }) });
  const updateColors = (next, { live = true } = {}) => {
    updateSettings({ colors: next }, { live });
    const p = computePalette(mode, next);
    const ratio = contrast(p.foreground, p.background);
    warning.hidden = ratio >= 4.5;
    warning.textContent = lowContrast(ratio);
  };
  const setModeColor = (key, value, options) => {
    const latest = state.settings.colors || {};
    updateColors({ ...latest, [mode]: { ...(latest[mode] || {}), [key]: value } }, options);
  };

  // Accentuation : couleurs proposées + couleur libre.
  const accentSetting = colors.accent || null;
  const swatches = h('div', { class: 'swatches small', role: 'radiogroup', 'aria-label': t('settings.presetColors') });
  for (const preset of ACCENT_PRESETS) {
    const value = preset.id === 'terracotta' ? null : `preset:${preset.id}`;
    const active = accentSetting === value;
    const name = t(`color.${preset.id}`);
    swatches.append(
      h('button', {
        type: 'button',
        role: 'radio',
        'aria-checked': active ? 'true' : 'false',
        class: `swatch${active ? ' active' : ''}`,
        title: preset.id === 'terracotta' ? t('settings.defaultSuffix', { name }) : name,
        style: { '--swatch': preset[mode] },
        onClick: () => {
          updateColors({ ...(state.settings.colors || {}), accent: value }, { live: false });
          rerender();
        },
      }),
    );
  }
  const accentPill = colorPill(palette.accent, (v) => {
    for (const sw of swatches.children) {
      sw.classList.remove('active');
      sw.setAttribute('aria-checked', 'false');
    }
    updateColors({ ...(state.settings.colors || {}), accent: v });
  });

  const resetButton = (key) =>
    perMode[key]
      ? h('button', {
          type: 'button',
          class: 'icon-btn small',
          title: t('settings.resetColor'),
          html: icons.reset,
          onClick: () => {
            setModeColor(key, null, { live: false });
            rerender();
          },
        })
      : null;
  const background = colorPill(palette.background, (v) => setModeColor('background', v));
  const foreground = colorPill(palette.foreground, (v) => setModeColor('foreground', v));

  const ratio = contrast(palette.foreground, palette.background);
  warning.hidden = ratio >= 4.5;
  warning.textContent = lowContrast(ratio);

  const customized = Boolean(colors.accent || perMode.background || perMode.foreground);
  return [
    subtitle(t('settings.colors'), dark ? t('settings.colorsHintDark') : t('settings.colorsHintLight')),
    h(
      'div',
      { class: 'settings-card' },
      settingRow(t('settings.accent'), t('settings.accentDesc'), h('div', { class: 'color-control' }, swatches, accentPill.el)),
      settingRow(t('settings.background'), null, h('div', { class: 'color-control' }, resetButton('background'), background.el)),
      settingRow(t('settings.foreground'), null, h('div', { class: 'color-control' }, resetButton('foreground'), foreground.el)),
      warning,
    ),
    customized
      ? h(
          'div',
          { class: 'settings-actions' },
          h('button', {
            type: 'button',
            class: 'link-btn',
            onClick: () => {
              const latest = { ...(state.settings.colors || {}) };
              delete latest.accent;
              delete latest[mode];
              updateSettings({ colors: latest });
              rerender();
            },
          }, dark ? t('settings.resetColorsDark') : t('settings.resetColorsLight')),
        )
      : null,
  ];
}

function fontCards() {
  const fonts = h('div', { class: 'font-options', role: 'radiogroup' });
  const choices = [
    ['serif', t('settings.fontSerif'), 'var(--font-serif)'],
    ['sans', t('settings.fontSans'), 'var(--font-sans)'],
    ['system', t('settings.fontSystem'), 'var(--font-system)'],
    ['mono', t('settings.fontMono'), 'var(--font-mono)'],
  ];
  for (const [key, label, family] of choices) {
    const active = state.settings.font === key;
    fonts.append(
      h(
        'button',
        {
          type: 'button',
          role: 'radio',
          class: `font-option${active ? ' active' : ''}`,
          'aria-checked': active ? 'true' : 'false',
          onClick: (e) => {
            for (const b of fonts.children) {
              b.classList.remove('active');
              b.setAttribute('aria-checked', 'false');
            }
            e.currentTarget.classList.add('active');
            e.currentTarget.setAttribute('aria-checked', 'true');
            updateSettings({ font: key });
          },
        },
        h('span', { class: 'sample', style: { fontFamily: family } }, 'Aa'),
        h('span', { class: 'name' }, label),
      ),
    );
  }
  return fonts;
}

function renderAppearance() {
  const s = state.settings;
  const sizeValue = h('span', { class: 'range-value' }, `${s.fontSize} px`);
  const slider = h('input', { type: 'range', min: FONT_MIN, max: FONT_MAX, step: 1, value: s.fontSize, 'aria-label': t('settings.fontSize') });
  slider.addEventListener('input', () => {
    sizeValue.textContent = `${slider.value} px`;
    updateSettings({ fontSize: Number(slider.value) }, { live: true });
  });
  return [
    title(t('settings.appearance')),
    subtitle(t('settings.mode')),
    modeCards(),
    ...colorsBlock(),
    subtitle(t('settings.font')),
    fontCards(),
    h(
      'div',
      { class: 'settings-card' },
      settingRow(t('settings.fontSize'), t('settings.fontSizeDesc'), h('div', { class: 'range' }, slider, sizeValue)),
      settingRow(
        t('settings.width'),
        null,
        segmented(
          [
            ['narrow', t('settings.widthNarrow')],
            ['normal', t('settings.widthNormal')],
            ['wide', t('settings.widthWide')],
            ['full', t('settings.widthFull')],
          ],
          s.width,
          (v) => updateSettings({ width: v }),
        ),
      ),
    ),
  ];
}

// --- Langue -------------------------------------------------------------------------------------

function renderLanguage() {
  const choice = state.settings.language && state.settings.language !== 'auto' ? state.settings.language : 'auto';
  const option = (value, name, detail) => {
    const active = choice === value;
    return h(
      'button',
      {
        type: 'button',
        role: 'radio',
        'aria-checked': active ? 'true' : 'false',
        class: `lang-option${active ? ' active' : ''}`,
        onClick: () => {
          if (active) return;
          updateSettings({ language: value });
        },
      },
      h('span', { class: 'lang-radio' }),
      h('span', { class: 'lang-text' }, h('span', { class: 'lang-name' }, name), detail ? h('span', { class: 'lang-detail' }, detail) : null),
      active ? h('span', { class: 'lang-check', html: icons.check }) : null,
    );
  };
  return [
    title(t('settings.language')),
    h('p', { class: 'settings-intro' }, t('settings.languageIntro')),
    h(
      'div',
      { class: 'settings-card lang-list', role: 'radiogroup', 'aria-label': t('settings.language') },
      option('auto', t('settings.languageAuto'), t('settings.languageAutoDetail', { name: systemLanguageName(state.info?.systemLanguages) })),
      ...LANGUAGES.map((l) => option(l.code, l.name, l.code === lang() ? null : t(`lang.${l.code}`))),
    ),
  ];
}

// --- Onglets et espaces -------------------------------------------------------------------------

function renderTabsSection() {
  const s = state.settings;
  const spaces = state.spaces.map((space) => {
    const count = docsInSpace(space.id).length;
    const active = space.id === state.activeSpaceId;
    return h(
      'div',
      { class: `space-row${active ? ' active' : ''}` },
      h('span', { class: 'space-row-dot', style: { background: space.color } }),
      h('span', { class: 'space-row-name' }, space.name),
      h('span', { class: 'space-row-count' }, active ? t('settings.currentSpace') : t('tabs.count', { count })),
      active ? null : h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onClick: () => switchSpace(space.id) }, t('common.open')),
      h('button', { type: 'button', class: 'btn btn-sm', onClick: () => openSpaceEditor(space) }, t('common.edit')),
    );
  });
  const hiddenKey = shortcutLabel('toggleTabsHidden');
  return [
    title(t('settings.tabs')),
    h(
      'div',
      { class: 'settings-card' },
      settingRow(
        t('settings.tabLayout'),
        t('settings.tabLayoutDesc'),
        segmented([['horizontal', t('settings.horizontal')], ['vertical', t('settings.vertical')]], s.tabLayout || 'horizontal', (v) => updateSettings({ tabLayout: v })),
      ),
      settingRow(
        t('settings.vtabsPanel'),
        hiddenKey ? t('settings.vtabsPanelDescKey', { key: hiddenKey }) : t('settings.vtabsPanelDesc'),
        segmented([['expanded', t('settings.expanded')], ['collapsed', t('settings.collapsed')], ['hidden', t('settings.hidden')]], s.vtabsState || 'expanded', (v) =>
          setTabsPanelState(v, state.settings.tabLayout === 'vertical' ? {} : { tabLayout: 'vertical' })),
      ),
      settingRow(
        t('settings.outlineSide'),
        null,
        segmented([['left', t('settings.left')], ['right', t('settings.right')]], s.outlineSide || 'left', (v) => updateSettings({ outlineSide: v })),
      ),
      settingRow(t('settings.restoreSession'), t('settings.restoreSessionDesc'), settingSwitch('restoreSession', { invert: false })),
    ),
    subtitle(t('spaces.title'), t('settings.spacesHint')),
    h('div', { class: 'settings-card spaces-list' }, spaces),
    h(
      'div',
      { class: 'settings-actions' },
      h('button', { type: 'button', class: 'btn btn-sm', onClick: () => openSpaceEditor(), html: `${icons.plus}<span>${t('spaces.new')}</span>` }),
    ),
  ];
}

// --- Comportement ---------------------------------------------------------------------------------

function autoSaveRows() {
  const mode = autoSaveMode();
  const rows = [
    settingRow(
      t('autosave.label'),
      t('autosave.desc'),
      select(
        AUTOSAVE_MODES.map((m) => [m, t(`autosave.${m}`)]),
        mode,
        (v) => {
          updateSettings({ autoSave: v });
          rerender();
        },
        t('autosave.label'),
      ),
    ),
  ];
  if (mode === 'interval') {
    const input = h('input', {
      type: 'number',
      class: 'number-input',
      min: String(INTERVAL_MIN),
      max: String(INTERVAL_MAX),
      step: '1',
      value: String(autoSaveMinutes()),
      'aria-label': t('autosave.intervalLabel'),
    });
    const commit = () => {
      const n = Math.round(Number(input.value));
      const value = Number.isFinite(n) ? Math.max(INTERVAL_MIN, Math.min(INTERVAL_MAX, n)) : autoSaveMinutes();
      input.value = String(value);
      if (value !== state.settings.autoSaveInterval) updateSettings({ autoSaveInterval: value });
    };
    input.addEventListener('change', commit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commit();
      }
    });
    rows.push(
      settingRow(
        t('autosave.intervalLabel'),
        null,
        h('div', { class: 'number-control' }, input, h('span', { class: 'number-unit' }, t('autosave.minutes'))),
        'setting-sub',
      ),
    );
  }
  return rows;
}

function renderBehavior() {
  return [
    title(t('settings.behavior')),
    h(
      'div',
      { class: 'settings-card' },
      ...autoSaveRows(),
      settingRow(t('settings.autoReload'), t('settings.autoReloadDesc'), settingSwitch('autoReload')),
      settingRow(t('settings.breaks'), t('settings.breaksDesc'), settingSwitch('breaks')),
      settingRow(t('settings.spellcheck'), t('settings.spellcheckDesc'), settingSwitch('spellcheck')),
      settingRow(t('files.showAll'), t('files.showAllDesc'), settingSwitch('filesShowAll')),
    ),
  ];
}

// --- Raccourcis clavier -----------------------------------------------------------------------------

function commitShortcut(actionId, change) {
  updateSettings({ shortcuts: withBinding(state.settings.shortcuts, actionId, change) });
  rerender();
  const row = current && current.pane.querySelector(`.sc-row[data-action="${actionId}"]`);
  row?.classList.add('saved');
}

function showMessage(session, text, kind = 'error', buttons = []) {
  session.message.className = `sc-message ${kind}`;
  session.message.replaceChildren(h('span', {}, text), ...buttons);
  session.message.hidden = false;
}

/** Saisie d'une nouvelle combinaison (activée par un clic sur un raccourci ou sur +). */
export const recorder = {
  session: null,
  get active() {
    return Boolean(this.session);
  },
  start(session) {
    this.cancel();
    this.session = session;
    if (!session.chip) {
      session.chip = h('span', { class: 'sc-chip' });
      session.addButton.before(session.chip);
      session.temporary = true;
    } else {
      session.original = session.chip.textContent;
    }
    session.chip.classList.add('recording');
    session.chip.textContent = t('shortcuts.pressKeys');
    session.row.classList.add('recording');
    session.message.hidden = true;
    session.onDown = (e) => {
      if (session.chip.contains(e.target) || session.message.contains(e.target)) return;
      this.cancel();
    };
    document.addEventListener('mousedown', session.onDown, true);
  },
  stop() {
    const s = this.session;
    if (!s) return null;
    this.session = null;
    document.removeEventListener('mousedown', s.onDown, true);
    s.row.classList.remove('recording');
    s.chip.classList.remove('recording');
    return s;
  },
  cancel() {
    const s = this.stop();
    if (!s) return;
    if (s.temporary) s.chip.remove();
    else s.chip.textContent = s.original;
  },
  handle(e) {
    const s = this.session;
    if (!s || e.type !== 'keydown') return;
    e.preventDefault();
    e.stopPropagation();
    const noModifier = !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey;
    if (e.key === 'Escape') {
      this.cancel();
      s.message.hidden = true;
      return;
    }
    if ((e.key === 'Backspace' || e.key === 'Delete') && noModifier) {
      if (s.index >= 0) {
        this.stop();
        commitShortcut(s.action.id, { index: s.index, combo: null });
      } else {
        this.cancel();
      }
      return;
    }
    const combo = comboFromEvent(e);
    if (!combo) {
      const mods = modifiersFromEvent(e);
      s.chip.textContent = mods.length ? formatModifiers(mods) : t('shortcuts.pressKeys');
      return;
    }
    const error = validateCombo(combo);
    if (error) {
      s.chip.textContent = formatCombo(combo);
      showMessage(s, error);
      return;
    }
    const keys = effectiveBindings(state.settings.shortcuts)[s.action.id];
    const existing = keys.indexOf(combo);
    if (existing !== -1 && existing !== s.index) {
      s.chip.textContent = formatCombo(combo);
      showMessage(s, t('shortcuts.alreadyUsed'));
      return;
    }
    const conflict = findConflict(state.settings.shortcuts, combo, s.action.id);
    this.stop();
    s.chip.textContent = formatCombo(combo);
    if (!conflict) {
      commitShortcut(s.action.id, { index: s.index, combo });
      return;
    }
    s.chip.classList.add('pending');
    showMessage(s, t('shortcuts.conflict', { combo: formatCombo(combo), action: actionLabel(conflict) }), 'conflict', [
      h('button', {
        type: 'button',
        class: 'btn btn-sm btn-primary',
        onClick: () => commitShortcut(s.action.id, { index: s.index, combo, stealFrom: conflict.id }),
      }, t('shortcuts.replace')),
      h('button', { type: 'button', class: 'btn btn-sm', onClick: () => rerender() }, t('common.cancel')),
    ]);
  },
};

function shortcutRow(action, keys, customized) {
  const keysEl = h('span', { class: 'sc-keys' });
  const message = h('div', { class: 'sc-message', hidden: true });
  const label = actionLabel(action);
  const row = h(
    'div',
    { class: `sc-row${action.fixed ? ' fixed' : ''}`, dataset: { action: action.id } },
    h('span', { class: 'sc-label' }, label, customized ? h('span', { class: 'sc-badge' }, t('shortcuts.modified')) : null),
    keysEl,
    h(
      'span',
      { class: 'sc-tools' },
      customized
        ? h('button', {
            type: 'button',
            class: 'icon-btn small',
            title: t('shortcuts.resetOne'),
            html: icons.reset,
            onClick: () => {
              updateSettings({ shortcuts: withDefaults(state.settings.shortcuts, action.id) });
              rerender();
            },
          })
        : null,
    ),
  );
  if (action.fixed) {
    for (const k of keys) keysEl.append(h('kbd', { class: 'sc-chip locked', title: t('shortcuts.locked') }, formatCombo(k)));
    keysEl.append(h('span', { class: 'sc-lock', title: t('shortcuts.lockedShort'), html: icons.lock }));
  } else {
    keys.forEach((k, index) => {
      keysEl.append(
        h('button', {
          type: 'button',
          class: 'sc-chip',
          title: t('shortcuts.clickToChange'),
          onClick: (e) => recorder.start({ action, index, chip: e.currentTarget, row, message }),
        }, formatCombo(k)),
      );
    });
    if (!keys.length) keysEl.append(h('span', { class: 'sc-none' }, t('shortcuts.none')));
    const add = h('button', {
      type: 'button',
      class: 'sc-add',
      title: t('shortcuts.add'),
      'aria-label': t('shortcuts.addFor', { action: label }),
      html: icons.plus,
    });
    add.addEventListener('click', () => recorder.start({ action, index: -1, chip: null, addButton: add, row, message }));
    keysEl.append(add);
  }
  return h('div', { class: 'sc-item' }, row, message);
}

function renderShortcuts() {
  const overrides = state.settings.shortcuts || {};
  const bindings = effectiveBindings(overrides);
  const groups = GROUPS.map((group) =>
    h(
      'section',
      { class: 'sc-group' },
      h('h4', {}, groupLabel(group)),
      h('div', { class: 'settings-card' }, ACTIONS.filter((a) => a.group === group.id).map((a) => shortcutRow(a, bindings[a.id], isCustomized(overrides, a.id)))),
    ));
  const hasCustom = Object.keys(overrides).length > 0;
  return [
    title(t('action.shortcuts')),
    h('p', { class: 'settings-intro' }, t('shortcuts.intro')),
    ...groups,
    h(
      'div',
      { class: 'settings-actions' },
      h('button', {
        type: 'button',
        class: 'btn btn-sm',
        disabled: !hasCustom,
        onClick: async () => {
          const ok = await confirmModal({
            title: t('shortcuts.resetAllTitle'),
            message: t('shortcuts.resetAllMessage'),
            confirm: t('shortcuts.resetConfirm'),
          });
          if (!ok) return;
          updateSettings({ shortcuts: {} });
          rerender();
        },
      }, t('shortcuts.resetAll')),
    ),
  ];
}

// --- Windows ----------------------------------------------------------------------------------------

function renderWindows() {
  const wrap = h('div', { class: 'settings-card' });
  const render = async () => {
    const st = await api.integrationStatus();
    let description;
    if (st.managedByStore) description = t('windows.storeManaged');
    else if (!st.available) description = t('windows.notAvailable');
    else if (st.registered) description = t('windows.registered');
    else description = t('windows.notRegistered');
    const toggle = st.available
      ? h('button', {
          class: st.registered ? 'btn btn-sm' : 'btn btn-sm btn-primary',
          type: 'button',
          onClick: async (e) => {
            e.currentTarget.disabled = true;
            const res = await api.setIntegration(!st.registered);
            if (!res.ok) toast(t('windows.failed', { error: res.error }), { type: 'error', duration: 5000 });
            else toast(res.registered ? t('windows.done') : t('windows.removed'), { type: 'success' });
            render();
          },
        }, st.registered ? t('windows.remove') : t('windows.integrate'))
      : null;
    wrap.replaceChildren(
      settingRow(t('windows.integration'), description, toggle),
      settingRow(
        t('windows.defaultApp'),
        t('windows.defaultAppDesc'),
        h('button', { class: 'btn btn-sm', type: 'button', onClick: () => api.openDefaultApps() }, t('windows.openSettings')),
      ),
    );
  };
  render();
  return [title(t('settings.windows')), wrap];
}

// --- À propos -----------------------------------------------------------------------------------------

export function openAbout() {
  const v = state.info?.versions || {};
  const content = h(
    'div',
    { class: 'about' },
    h('div', { class: 'about-logo', html: brandMark }),
    h('div', { class: 'about-name' }, 'Folio'),
    h('div', { class: 'about-version' }, t('about.version', { version: state.info?.version || '' })),
    h('p', {}, t('about.description')),
    h('p', { class: 'about-tech' }, `Electron ${v.electron || '?'} · Chromium ${(v.chrome || '?').split('.')[0]} · markdown-it, highlight.js, KaTeX, Mermaid, CodeMirror`),
  );
  openModal({ title: t('about.title'), content, width: 460, className: 'modal-about' });
}
