// Langue de l'interface : traduction des textes, formats de nombres et de dates.
import { LANGUAGES, createTranslator, resolveLanguage } from '../shared/i18n.js';

let translate = createTranslator('fr');
const listeners = new Set();

export { LANGUAGES };

/** Texte traduit : t('action.open'), t('tabs.count', { count: 3 }). */
export function t(key, params) {
  return translate(key, params);
}

/** Code de la langue active (« fr », « en »…), utilisable par Intl et toLocale*. */
export function lang() {
  return translate.lang;
}

/** fn() est appelée après chaque changement de langue. */
export function onLanguageChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Applique la langue choisie (« auto » : celle de Windows). Retourne true si elle a changé.
 * Les textes fixes de la page (attributs data-i18n…) sont traduits ici.
 */
export function setLanguage(setting, systemLanguages) {
  const code = resolveLanguage(setting, systemLanguages);
  const changed = code !== translate.lang;
  if (changed) translate = createTranslator(code);
  document.documentElement.lang = code;
  translateStatic(document);
  if (changed) for (const fn of listeners) fn(code);
  return changed;
}

/** Traduit les éléments marqués dans le HTML : data-i18n (texte), data-i18n-title, -aria, -placeholder. */
export function translateStatic(root) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
  for (const el of root.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria));
  for (const el of root.querySelectorAll('[data-i18n-placeholder]')) el.placeholder = t(el.dataset.i18nPlaceholder);
}

/** Nom de la langue de Windows prise en charge (pour l'option « Automatique »). */
export function systemLanguageName(systemLanguages) {
  const code = resolveLanguage(null, systemLanguages);
  return LANGUAGES.find((l) => l.code === code)?.name || code;
}
