/**
 * lang.js — Language state module.
 * Manages EN/UK toggle, persists preference in localStorage,
 * and dispatches 'langChanged' events for reactive re-renders.
 */

export function getLang() {
  return localStorage.getItem('uvidnova_lang') ?? 'en';
}

export function setLang(lang) {
  localStorage.setItem('uvidnova_lang', lang);
  document.documentElement.lang = lang;
  document.dispatchEvent(new CustomEvent('langChanged', { detail: { lang } }));
}

export function getName(asset) {
  const lang = getLang();
  return (lang === 'uk' && asset.name?.uk) ? asset.name.uk : (asset.name?.en ?? asset.asset_id);
}

export function initLangToggle(btn) {
  if (!btn) return;
  const update = () => {
    const lang = getLang();
    btn.textContent = lang === 'uk' ? 'EN | 🇺🇦' : '🇬🇧 | UK';
    btn.setAttribute('aria-label', lang === 'uk' ? 'Switch to English' : 'Switch to Ukrainian');
    document.documentElement.lang = lang;
  };
  update();
  btn.addEventListener('click', () => setLang(getLang() === 'uk' ? 'en' : 'uk'));
  document.addEventListener('langChanged', update);
}
