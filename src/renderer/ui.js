import { h } from './util.js';
import { icons } from './icons.js';
import { t } from './i18n.js';

// --- Notifications ---------------------------------------------------------------

export function toast(message, { type = 'info', action = null, duration = 2600 } = {}) {
  const container = document.getElementById('toasts');
  const el = h(
    'div',
    { class: `toast toast-${type}`, role: 'status' },
    type === 'error' ? h('span', { class: 'toast-icon', html: icons.alert }) : null,
    type === 'success' ? h('span', { class: 'toast-icon', html: icons.check }) : null,
    h('span', { class: 'toast-text' }, message),
  );
  let timer = null;
  const dismiss = () => {
    clearTimeout(timer);
    el.classList.remove('show');
    setTimeout(() => el.remove(), 220);
  };
  if (action) {
    el.append(
      h('button', {
        class: 'toast-action',
        type: 'button',
        onClick: () => {
          dismiss();
          action.run();
        },
      }, action.label),
    );
  }
  container.append(el);
  while (container.children.length > 3) container.firstElementChild.remove();
  requestAnimationFrame(() => el.classList.add('show'));
  timer = setTimeout(dismiss, duration);
  return dismiss;
}

// --- Menu déroulant --------------------------------------------------------------

let openMenuState = null;

export function closeMenu({ restoreFocus = false } = {}) {
  if (!openMenuState) return false;
  const { menu, anchor, cleanup, onClose } = openMenuState;
  openMenuState = null;
  cleanup();
  menu.remove();
  if (anchor instanceof Element) {
    anchor.classList.remove('pressed');
    if (restoreFocus) anchor.focus();
  }
  if (onClose) onClose();
  return true;
}

export function isMenuOpen() {
  return Boolean(openMenuState);
}

/** Le menu ouvert a-t-il été déclenché depuis cet élément (ou l'un de ses descendants) ? */
export function menuAnchoredIn(container) {
  const anchor = openMenuState && openMenuState.anchor;
  return Boolean(anchor instanceof Element && container.contains(anchor));
}

/**
 * items : [{ label, icon, shortcut, run, disabled, checked, danger }] ou 'separator' ou { header }.
 * anchor : un élément (menu aligné sous lui, à droite) ou un point { x, y } (clic droit).
 */
export function openMenu(anchor, items, { onClose = null } = {}) {
  if (openMenuState && anchor instanceof Element && openMenuState.anchor === anchor) {
    closeMenu();
    return;
  }
  closeMenu();
  const menu = h('div', { class: 'menu', role: 'menu' });
  for (const item of items) {
    if (!item) continue;
    if (item === 'separator') {
      menu.append(h('div', { class: 'menu-sep', role: 'separator' }));
    } else if (item.header) {
      menu.append(h('div', { class: 'menu-header' }, item.header));
    } else {
      menu.append(
        h(
          'button',
          {
            class: item.danger ? 'menu-item danger' : 'menu-item',
            type: 'button',
            role: 'menuitem',
            disabled: item.disabled,
            onClick: () => {
              closeMenu();
              item.run();
            },
          },
          h('span', { class: 'menu-icon', html: item.icon || '' }),
          h('span', { class: 'menu-label' }, item.label),
          item.shortcut ? h('span', { class: 'menu-shortcut' }, item.shortcut) : null,
          item.checked ? h('span', { class: 'menu-check', html: icons.check }) : null,
        ),
      );
    }
  }
  document.body.append(menu);

  const isElement = anchor instanceof Element;
  const width = menu.offsetWidth;
  const height = menu.offsetHeight;
  let left;
  let top;
  if (isElement) {
    const rect = anchor.getBoundingClientRect();
    const alignStart = rect.left + rect.width / 2 < window.innerWidth / 2;
    left = alignStart ? rect.left : rect.right - width;
    top = rect.bottom + 6;
    anchor.classList.add('pressed');
  } else {
    left = anchor.x;
    top = anchor.y + 2;
    if (top + height > window.innerHeight - 8) top = Math.max(8, anchor.y - height - 2);
  }
  menu.style.left = `${Math.max(8, Math.min(left, window.innerWidth - width - 8))}px`;
  menu.style.top = `${top}px`;
  menu.style.maxHeight = `${window.innerHeight - top - 12}px`;

  const buttons = () => [...menu.querySelectorAll('.menu-item:not(:disabled)')];
  const onKey = (e) => {
    const list = buttons();
    const i = list.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      list[(i + 1) % list.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      list[(i - 1 + list.length) % list.length]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      list[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      list[list.length - 1]?.focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeMenu({ restoreFocus: true });
    } else if (e.key === 'Tab') {
      closeMenu();
    }
  };
  const onDown = (e) => {
    if (menu.contains(e.target)) return;
    if (isElement && anchor.contains(e.target)) return;
    closeMenu();
  };
  const onBlur = () => closeMenu();
  menu.addEventListener('keydown', onKey);
  document.addEventListener('mousedown', onDown, true);
  window.addEventListener('blur', onBlur);
  window.addEventListener('resize', onBlur);
  openMenuState = {
    menu,
    anchor,
    onClose,
    cleanup: () => {
      document.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('resize', onBlur);
    },
  };
  buttons()[0]?.focus({ preventScroll: true });
}

// --- Fenêtres modales --------------------------------------------------------------

const modalStack = [];

export function closeTopModal() {
  const top = modalStack[modalStack.length - 1];
  if (!top) return false;
  top.close();
  return true;
}

export function hasOpenModal() {
  return modalStack.length > 0;
}

export function openModal({ title, content, width = 560, className = '', onClose = null }) {
  const previousFocus = document.activeElement;
  const overlay = h('div', { class: 'modal-overlay' });
  const closeBtn = h('button', { class: 'icon-btn', type: 'button', title: t('common.close'), 'aria-label': t('common.close'), html: icons.x });
  const dialog = h(
    'div',
    { class: `modal ${className}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title, style: { width: `${width}px` } },
    h('div', { class: 'modal-header' }, h('h2', {}, title), closeBtn),
    h('div', { class: 'modal-body' }, content),
  );
  overlay.append(dialog);
  document.body.append(overlay);

  let closed = false;
  const entry = {
    dialog,
    close() {
      if (closed) return;
      closed = true;
      const i = modalStack.indexOf(entry);
      if (i !== -1) modalStack.splice(i, 1);
      overlay.classList.add('closing');
      setTimeout(() => overlay.remove(), 120);
      if (previousFocus && previousFocus.focus) previousFocus.focus({ preventScroll: true });
      if (onClose) onClose();
    },
  };
  modalStack.push(entry);
  closeBtn.addEventListener('click', () => entry.close());
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) entry.close();
  });
  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      entry.close();
    }
  });
  requestAnimationFrame(() => {
    const focusable =
      dialog.querySelector('[data-autofocus]') ||
      dialog.querySelector('.modal-body button, .modal-body input, .modal-body [tabindex]');
    (focusable || closeBtn).focus({ preventScroll: true });
    if (focusable && focusable.select && focusable.matches('[data-autofocus]')) focusable.select();
  });
  return entry;
}

/** Demande une confirmation ; résout true (confirmé) ou false. */
export function confirmModal({ title, message, confirm = t('common.confirm'), cancel = t('common.cancel'), danger = false }) {
  return new Promise((resolve) => {
    let answer = false;
    let modal = null;
    const done = (value) => {
      answer = value;
      modal.close();
    };
    const content = h(
      'div',
      { class: 'confirm' },
      h('p', {}, message),
      h(
        'div',
        { class: 'confirm-actions' },
        h('button', { class: 'btn', type: 'button', onClick: () => done(false) }, cancel),
        h('button', { class: danger ? 'btn btn-danger' : 'btn btn-primary', type: 'button', 'data-autofocus': true, onClick: () => done(true) }, confirm),
      ),
    );
    modal = openModal({ title, content, width: 440, onClose: () => resolve(answer) });
  });
}

// --- Visionneuse (images et diagrammes agrandis) -----------------------------------

export function openLightbox(node) {
  const overlay = h('div', { class: 'lightbox', role: 'dialog', 'aria-modal': 'true' }, node);
  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey, true);
  };
  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  };
  overlay.addEventListener('click', close);
  document.addEventListener('keydown', onKey, true);
  document.body.append(overlay);
}
