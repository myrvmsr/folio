'use strict';

// Traductions de Folio, partagées entre l'interface et le processus principal.
//
// Chaque langue est un dictionnaire clé → texte (src/shared/locales/*.js). Les textes
// peuvent contenir des paramètres « {nom} ». Les pluriels utilisent des clés suffixées
// selon les règles de la langue (Intl.PluralRules) : « clé_one », « clé_other »…
// Une clé absente d'une traduction est cherchée en anglais, puis en français.

const LOCALES = {
  fr: require('./locales/fr'),
  en: require('./locales/en'),
  es: require('./locales/es'),
  de: require('./locales/de'),
  nl: require('./locales/nl'),
  it: require('./locales/it'),
  pt: require('./locales/pt'),
};

// Nom de chaque langue dans cette langue (pour le sélecteur des paramètres) et
// dictionnaire du correcteur orthographique de Chromium correspondant.
const LANGUAGES = [
  { code: 'fr', name: 'Français', spell: 'fr' },
  { code: 'en', name: 'English', spell: 'en-US' },
  { code: 'es', name: 'Español', spell: 'es' },
  { code: 'de', name: 'Deutsch', spell: 'de' },
  { code: 'nl', name: 'Nederlands', spell: 'nl' },
  { code: 'it', name: 'Italiano', spell: 'it' },
  { code: 'pt', name: 'Português', spell: 'pt-PT' },
];

const FALLBACK = 'en';

const isSupported = (code) => Object.prototype.hasOwnProperty.call(LOCALES, code);

/** Langue de l'interface : celle choisie, sinon la première langue de Windows prise en charge. */
function resolveLanguage(setting, systemLanguages) {
  if (isSupported(setting)) return setting;
  for (const tag of systemLanguages || []) {
    const primary = String(tag).toLowerCase().split(/[-_]/)[0];
    if (isSupported(primary)) return primary;
  }
  return FALLBACK;
}

function createTranslator(code) {
  const lang = isSupported(code) ? code : FALLBACK;
  const chain = [...new Set([lang, 'en', 'fr'])].map((c) => LOCALES[c]);
  let rules = null;
  try {
    rules = new Intl.PluralRules(lang);
  } catch {
    rules = null;
  }

  const find = (keys) => {
    for (const dict of chain) {
      for (const key of keys) {
        if (Object.prototype.hasOwnProperty.call(dict, key)) return dict[key];
      }
    }
    return null;
  };

  function t(key, params) {
    let text;
    if (params && typeof params.count === 'number') {
      const form = rules ? rules.select(params.count) : params.count === 1 ? 'one' : 'other';
      text = find([`${key}_${form}`, `${key}_other`, key]);
    } else {
      text = find([key]);
    }
    if (text == null) return key;
    if (!params) return text;
    return text.replace(/\{(\w+)\}/g, (match, name) => (params[name] != null ? String(params[name]) : match));
  }

  /** La clé existe-t-elle (dans la langue ou ses replis) ? */
  t.has = (key) => find([key]) != null;
  t.lang = lang;
  return t;
}

module.exports = { LANGUAGES, FALLBACK, isSupported, resolveLanguage, createTranslator };
