'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);
const listen = (channel) => (callback) => {
  const handler = (_event, ...args) => callback(...args);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld('folio', {
  platform: process.platform,
  ready: () => invoke('app:ready'),
  closeConfirmed: () => invoke('app:close-confirmed'),
  closeCanceled: () => invoke('app:close-canceled'),
  snapReady: (result) => invoke('app:snap-ready', result),
  setSettings: (patch) => invoke('settings:set', patch),

  openDialog: () => invoke('file:open-dialog'),
  saveDialog: (suggested) => invoke('file:save-dialog', suggested),
  readFile: (path) => invoke('file:read', path),
  writeFile: (path, text, encoding) => invoke('file:write', path, text, encoding),
  watch: (path) => invoke('file:watch', path),
  unwatch: (path) => invoke('file:unwatch', path),
  isDirectory: (path) => invoke('fs:is-directory', path),

  folders: {
    pick: () => invoke('folders:pick'),
    list: (dir) => invoke('folders:list', dir),
    watch: (roots) => invoke('folders:watch', roots),
    createFile: (dir, name) => invoke('folders:create-file', dir, name),
    createFolder: (dir, name) => invoke('folders:create-folder', dir, name),
    rename: (path, name) => invoke('folders:rename', path, name),
    move: (path, toDir) => invoke('folders:move', path, toDir),
    trash: (path) => invoke('folders:trash', path),
    onChanged: listen('folders:changed'),
  },

  openExternal: (url) => invoke('shell:open-external', url),
  openPath: (path) => invoke('shell:open-path', path),
  showInFolder: (path) => invoke('shell:show-in-folder', path),
  openDefaultApps: () => invoke('shell:default-apps'),
  integrationStatus: () => invoke('integration:status'),
  setIntegration: (enabled) => invoke('integration:set', enabled),
  copyText: (text) => invoke('clipboard:write', text),

  recent: {
    get: () => invoke('recent:get'),
    add: (path) => invoke('recent:add', path),
    remove: (path) => invoke('recent:remove', path),
    relocate: (from, to) => invoke('recent:relocate', from, to),
    clear: () => invoke('recent:clear'),
  },

  confirmUnsaved: (name) => invoke('dialog:unsaved', name),
  print: () => invoke('doc:print'),
  exportPdf: (suggested) => invoke('doc:export-pdf', suggested),
  toggleFullscreen: () => invoke('win:fullscreen'),
  toggleDevTools: () => invoke('win:devtools'),

  pathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return '';
    }
  },

  onOpenFiles: listen('app:open-files'),
  onFileChanged: listen('file:changed'),
  onBeforeClose: listen('app:before-close'),
  onSelectAll: listen('app:select-all'),
  onFind: listen('app:find'),
});
