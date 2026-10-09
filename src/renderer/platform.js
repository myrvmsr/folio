export const platform = window.folio.platform;
export const isMac = platform === 'darwin';
export const primaryModifier = (event) => isMac ? event.metaKey : event.ctrlKey;
