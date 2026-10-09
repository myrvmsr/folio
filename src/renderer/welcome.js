// Écran d'accueil : affiché quand l'espace actif n'a aucun document ouvert.
import { state, els, api } from './context.js';
import { toast } from './ui.js';
import { icons, brandMark } from './icons.js';
import { h, basename, dirname, shortenPath, timeAgo } from './util.js';
import { t } from './i18n.js';
import { openDialog, newDoc, openPath } from './documents.js';
import { activeSpace } from './tabs.js';
import { shortcutLabel } from './commands.js';
import { openFolderDialog } from './files.js';

export async function refreshWelcome() {
  const recent = await api.recent.get();
  if (state.active) return;

  const header = h(
    'div',
    { class: 'section-label' },
    h('span', {}, t('welcome.recent')),
    recent.length
      ? h('button', {
          class: 'link-btn',
          type: 'button',
          onClick: async () => {
            await api.recent.clear();
            refreshWelcome();
          },
        }, t('welcome.clearList'))
      : null,
  );

  let recentBlock;
  if (!recent.length) {
    recentBlock = h('div', { class: 'recent-empty' }, t('welcome.recentEmpty'));
  } else {
    recentBlock = h(
      'ul',
      { class: 'recent-list' },
      recent.map((r) => {
        const open = () => {
          if (r.exists) openPath(r.path);
          else toast(t('welcome.fileGone'), { type: 'error' });
        };
        return h(
          'li',
          {
            class: `recent-item${r.exists ? '' : ' missing'}`,
            title: r.path,
            tabindex: '0',
            role: 'button',
            onClick: open,
            onKeydown: (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                open();
              }
            },
          },
          h('span', { class: 'recent-icon', html: icons.fileText }),
          h(
            'span',
            { class: 'recent-text' },
            h('span', { class: 'recent-name' }, basename(r.path)),
            h('span', { class: 'recent-path' }, r.exists ? shortenPath(dirname(r.path), 72) : t('welcome.fileMissing')),
          ),
          h('span', { class: 'recent-time' }, timeAgo(r.openedAt)),
          h('button', {
            class: 'icon-btn small recent-remove',
            type: 'button',
            title: t('common.removeFromList'),
            'aria-label': t('common.removeFromList'),
            html: icons.x,
            onClick: async (e) => {
              e.stopPropagation();
              await api.recent.remove(r.path);
              refreshWelcome();
            },
          }),
        );
      }),
    );
  }

  const space = activeSpace();
  const button = (label, icon, actionId, onClick, primary = false) => {
    const key = shortcutLabel(actionId);
    return h(
      'button',
      { class: primary ? 'btn btn-primary btn-lg' : 'btn btn-lg', type: 'button', onClick },
      h('span', { class: 'btn-icon', html: icon }),
      h('span', {}, label),
      key ? h('kbd', {}, key) : null,
    );
  };
  els.welcome.replaceChildren(
    h(
      'div',
      { class: 'welcome-inner' },
      state.spaces.length > 1
        ? h(
            'div',
            { class: 'welcome-space', style: { '--space-color': space.color } },
            h('span', { class: 'space-dot' }),
            h('span', {}, t('welcome.spaceEmpty', { name: space.name })),
          )
        : null,
      h('div', { class: 'welcome-logo', html: brandMark }),
      h('h1', { class: 'welcome-title' }, 'Folio'),
      h('p', { class: 'welcome-sub' }, t('welcome.tagline')),
      h(
        'div',
        { class: 'welcome-actions' },
        button(t('action.open'), icons.fileText, 'open', openDialog, true),
        button(t('action.openFolder'), icons.folderOpen, 'openFolder', openFolderDialog),
        button(t('action.new'), icons.filePlus, 'new', newDoc),
      ),
      h('div', { class: 'welcome-recent' }, header, recentBlock),
      h('p', { class: 'welcome-hint' }, h('span', { class: 'hint-icon', html: icons.upload }), t('welcome.dropHint')),
    ),
  );
}
