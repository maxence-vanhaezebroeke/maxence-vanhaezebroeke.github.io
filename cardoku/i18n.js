/** @typedef {Record<string, string>} LocaleStrings */

const DEFAULT_LANG = "fr";
const STORAGE_KEY = "cardoku-lang";

/** @type {Record<string, LocaleStrings>} */
const bundles = { en: {}, fr: {} };

/** @type {"en" | "fr"} */
let currentLang = DEFAULT_LANG;

/**
 * @param {string} key
 * @param {Record<string, string | number>} [vars]
 * @param {string} [fallback]
 */
export function t(key, vars, fallback) {
  const raw =
    bundles[currentLang]?.[key]?.trim() ||
    bundles.en?.[key] ||
    fallback ||
    key;

  if (!vars) return raw;

  return Object.entries(vars).reduce(
    (str, [name, value]) => str.replaceAll(`{${name}}`, String(value)),
    raw
  );
}

/** @returns {"en" | "fr"} */
export function getLang() {
  return currentLang;
}

/**
 * @param {"en" | "fr"} lang
 */
export function setLang(lang) {
  currentLang = lang;
  localStorage.setItem(STORAGE_KEY, lang);
  document.documentElement.lang = lang;
}

export function getDefaultLang() {
  return DEFAULT_LANG;
}

/**
 * @param {"en" | "fr"} lang
 * @param {LocaleStrings} strings
 */
export function registerLocale(lang, strings) {
  bundles[lang] = strings;
}

/**
 * @param {"en" | "fr"} lang
 */
export async function loadLocale(lang) {
  const res = await fetch(`./locales/${lang}.json`);
  bundles[lang] = await res.json();
}

export function initLangFromStorage() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "en" || stored === "fr") {
    currentLang = stored;
  } else {
    currentLang = DEFAULT_LANG;
  }
  document.documentElement.lang = currentLang;
}

/**
 * @param {string} id
 * @param {string} label
 * @param {string} description
 */
export function categoryLabel(id, label, description) {
  const labelKey = `cat.${id}.label`;
  const descKey = `cat.${id}.description`;
  return {
    label: t(labelKey, undefined, label),
    description: t(descKey, undefined, description),
  };
}
