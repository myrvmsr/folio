'use strict';

// Pure helpers shared by the main process, renderer and platform regression tests.
function createPathUtils(platform) {
  const windows = platform === 'win32';
  const separator = windows ? '\\' : '/';
  const clean = (p) => windows ? String(p).replace(/\//g, '\\') : String(p);
  const trim = (p) => {
    const value = clean(p);
    if (value === separator || (windows && /^[a-z]:\\$/i.test(value))) return value;
    return value.replace(windows ? /\\+$/ : /\/+$/, '');
  };
  const normPath = (p) => windows ? trim(p).toLowerCase() : trim(p);
  const samePath = (a, b) => Boolean(a && b) && normPath(a) === normPath(b);
  const isSameOrInside = (p, dir) => {
    if (!p || !dir) return false;
    const a = normPath(p), b = normPath(dir);
    return a === b || a.startsWith(b.endsWith(separator) ? b : `${b}${separator}`);
  };
  const joinPath = (dir, name) => `${trim(dir)}${trim(dir).endsWith(separator) ? '' : separator}${name}`;
  const basename = (p) => clean(p).split(separator).filter(Boolean).pop() || String(p);
  const dirname = (p) => {
    const value = trim(p), index = value.lastIndexOf(separator);
    if (index === 0) return separator;
    if (windows && index === 2 && /^[a-z]:/i.test(value)) return value.slice(0, 3);
    return index > 0 ? value.slice(0, index) : value;
  };
  const relocatePath = (p, from, to) => {
    if (!isSameOrInside(p, from)) return String(p);
    const suffix = clean(p).slice(trim(from).length).replace(windows ? /^\\+/ : /^\/+/, '');
    return suffix ? joinPath(to, suffix) : String(to);
  };
  const toFileUrl = (p) => {
    const value = windows ? clean(p).replace(/\\/g, '/') : String(p);
    const segments = (value.startsWith('/') ? value : `/${value}`).split('/')
      .map((segment) => windows && /^[a-z]:$/i.test(segment) ? segment : encodeURIComponent(segment));
    if (windows && value.startsWith('//')) return `file://${value.slice(2).split('/').map(encodeURIComponent).join('/')}`;
    return `file://${segments.join('/')}`;
  };
  const fromFileUrl = (urlString) => {
    const url = new URL(urlString);
    if (url.protocol !== 'file:') throw new Error('Expected a file URL');
    let value = decodeURIComponent(url.pathname);
    if (!windows) return url.host ? `//${url.host}${value}` : value;
    if (url.host) return `\\\\${url.host}${value.replace(/\//g, '\\')}`;
    if (/^\/[a-z]:/i.test(value)) value = value.slice(1);
    return value.replace(/\//g, '\\');
  };
  return { separator, normPath, samePath, isSameOrInside, joinPath, basename, dirname, relocatePath, toFileUrl, fromFileUrl };
}

function platformShortcut(combo, platform) {
  if (platform !== 'darwin' || /^Ctrl\+(Shift\+)?Tab$/.test(combo)) return combo;
  if (combo === 'Ctrl+Y') return 'Shift+Meta+Z';
  if (combo === 'Ctrl+H') return 'Alt+Meta+F';
  if (combo === 'F11') return 'Ctrl+Meta+F';
  const parts = combo.endsWith('++') ? [...combo.slice(0, -2).split('+'), '+'] : combo.split('+');
  const key = parts.pop();
  const modifiers = new Set(parts.map((part) => part === 'Ctrl' ? 'Meta' : part));
  return [...['Ctrl', 'Alt', 'Shift', 'Meta'].filter((part) => modifiers.has(part)), key].join('+');
}

module.exports = { createPathUtils, platformShortcut };
