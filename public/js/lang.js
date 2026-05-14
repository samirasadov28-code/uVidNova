/**
 * lang.js — Language state, translations, and DOM i18n.
 * Supports EN (default) and UK (Ukrainian).
 * Persists preference in localStorage; dispatches 'langChanged' on switch.
 */

const TRANSLATIONS = {
  en: {
    // Name etymology
    'name.u.label':       'Ukraine',
    'name.vidnova.label': 'відновa — restoration',
    // Landing
    'landing.sub':        'Ukraine Reconstruction Finance Atlas',
    'landing.desc':       'An asset-level, project-finance-grade register of wartime damage and reconstruction opportunities. Every figure traceable to RDNA3, KSE Institute, and verified open-source intelligence.',
    'landing.feat1':      'Deterministic cost estimates — three reconstruction paths per asset',
    'landing.feat2':      'Defensible financing structures — grant, concessional, equity, private',
    'landing.feat3':      'Re-damage tracking and wartime risk classification',
    'landing.cta':        'Explore the atlas →',
    'landing.audience':   'For DFI investment officers · Infrastructure philanthropies · Policy researchers',
    'landing.disclaimer': 'Not a fundraising platform. No political framing. Every figure independently sourced.',
    // Header / nav
    'header.tagline':     'Ukraine Reconstruction Finance Atlas',
    'nav.methodology':    'Methodology',
    // Filters
    'filter.title':       'Filters',
    'filter.reset':       'Reset',
    'filter.sector':      'Sector',
    'filter.oblast':      'Oblast',
    'filter.rebuildability':        'Rebuildability',
    'filter.chip.rebuildable':      'Rebuildable',
    'filter.chip.recently_liberated': 'Recently liberated',
    'filter.chip.frontline_adjacent': 'Frontline adjacent',
    'filter.chip.occupied':         'Occupied',
    'filter.lifecycle':             'Lifecycle',
    'filter.chip.documented':       'Documented',
    'filter.chip.assessed':         'Assessed',
    'filter.chip.in_pipeline':      'In pipeline',
    'filter.chip.funded':           'Funded',
    'filter.chip.under_reconstruction': 'Under reconstruction',
    'filter.chip.complete':         'Complete',
    'filter.cost_band':             'Capital requirement (baseline central)',
    'filter.financing_class':       'Financing class (baseline)',
    'filter.redamage_label':        'Re-damaged assets only',
    'filter.redamage_chip':         '⚠ Re-damaged ×2+',
    'filter.loading':               'Loading…',
    // Sector labels (used in chips + map popups)
    'sector.energy_and_power':            'Energy & Power',
    'sector.healthcare':                  'Healthcare',
    'sector.education':                   'Education',
    'sector.residential':                 'Residential',
    'sector.heritage_and_culture':        'Heritage & Culture',
    'sector.transport_and_ports':         'Transport & Ports',
    'sector.water_and_sanitation':        'Water & Sanitation',
    'sector.industrial_and_agricultural': 'Industrial & Agricultural',
    'sector.public_administration':       'Public Administration',
    // Cost band labels
    'costband.under_100':  '< $100M',
    'costband.100_500':    '$100M – $500M',
    'costband.500_2000':   '$500M – $2B',
    'costband.over_2000':  '> $2B',
    // Financing class labels
    'financing.grant_led':        'Grant-led (≥50%)',
    'financing.concessional_led': 'Concessional-led',
    'financing.blended':          'Blended',
    'financing.private_anchored': 'Private (≥30%)',
    // Disclaimer
    'disclaimer.text':    'Cost and financing-structure figures are estimates derived from published unit-cost benchmarks (RDNA3, KSE Institute) and named comparable Ukrainian precedents. They are not guarantees, not procurement quotes, and not a substitute for transaction-level due diligence.',
    'disclaimer.dismiss': 'Understood',
    // Version bar
    'version.force_update': 'Force update',
    'version.update_msg':   '· New version ready —',
    'version.reload':       'reload',
    // Feedback
    'feedback.btn':              'Feedback',
    'feedback.title':            'Send feedback',
    'feedback.name_label':       'Name',
    'feedback.name_ph':          'Your name',
    'feedback.email_label':      'Email',
    'feedback.email_ph':         'your@email.com',
    'feedback.message_label':    'Message',
    'feedback.message_ph':       'Your feedback, correction, or question…',
    'feedback.submit':           'Send',
    'feedback.sent':             'Thank you — your message has been sent.',
    // Chat
    'chat.btn':          'Ask AI',
    'chat.powered':      'Powered by Groq',
    'chat.welcome':      'Ask me about reconstruction costs, financing structures, or specific assets.',
    'chat.suggestion1':  'What is the Kakhovka HPP baseline cost?',
    'chat.suggestion2':  'How does MIGA war insurance work?',
    'chat.suggestion3':  'What is the build-back-better path?',
    'chat.placeholder':  'Ask about reconstruction financing…',
    // Oblast panel
    'oblast.close':      'Close',
    'oblast.capital':    'Capital',
    'oblast.famous_for': 'Known for',
    'oblast.reconstruction': 'Reconstruction focus',
  },
  uk: {
    // Name etymology
    'name.u.label':       'Україна',
    'name.vidnova.label': 'відновa — відновлення',
    // Landing
    'landing.sub':        'Атлас фінансування відбудови України',
    'landing.desc':       'Реєстр воєнних пошкоджень та можливостей відбудови на рівні активів — з проєктно-фінансовою точністю. Кожна цифра простежується до RDNA3, Інституту KSE та верифікованих відкритих джерел.',
    'landing.feat1':      'Детерміновані кошторисні розрахунки — три шляхи відбудови для кожного активу',
    'landing.feat2':      'Захищені структури фінансування — гранти, пільгові кредити, капітал, приватні інвестиції',
    'landing.feat3':      'Відстеження повторних пошкоджень та класифікація воєнних ризиків',
    'landing.cta':        'Відкрити атлас →',
    'landing.audience':   'Для інвестиційних офіцерів ВФУ · Інфраструктурних філантропів · Дослідників',
    'landing.disclaimer': 'Не платформа для збору коштів. Без політичного контексту. Кожна цифра має незалежне підтвердження.',
    // Header / nav
    'header.tagline':     'Атлас фінансування відбудови України',
    'nav.methodology':    'Методологія',
    // Filters
    'filter.title':       'Фільтри',
    'filter.reset':       'Скинути',
    'filter.sector':      'Сектор',
    'filter.oblast':      'Область',
    'filter.rebuildability':        'Можливість відбудови',
    'filter.chip.rebuildable':      'Можна відбудувати',
    'filter.chip.recently_liberated': 'Нещодавно звільнено',
    'filter.chip.frontline_adjacent': 'Прилегле до фронту',
    'filter.chip.occupied':         'Окуповано',
    'filter.lifecycle':             'Етап',
    'filter.chip.documented':       'Задокументовано',
    'filter.chip.assessed':         'Оцінено',
    'filter.chip.in_pipeline':      'У плані',
    'filter.chip.funded':           'Профінансовано',
    'filter.chip.under_reconstruction': 'На відбудові',
    'filter.chip.complete':         'Завершено',
    'filter.cost_band':             'Потреба в капіталі (базовий сценарій)',
    'filter.financing_class':       'Клас фінансування (базовий)',
    'filter.redamage_label':        'Лише повторно пошкоджені',
    'filter.redamage_chip':         '⚠ Повторно пошкоджено ×2+',
    'filter.loading':               'Завантаження…',
    // Sector labels
    'sector.energy_and_power':            'Енергетика та електропостачання',
    'sector.healthcare':                  'Охорона здоров\'я',
    'sector.education':                   'Освіта',
    'sector.residential':                 'Житловий сектор',
    'sector.heritage_and_culture':        'Спадщина та культура',
    'sector.transport_and_ports':         'Транспорт та порти',
    'sector.water_and_sanitation':        'Водопостачання та санітарія',
    'sector.industrial_and_agricultural': 'Промисловість та сільське господарство',
    'sector.public_administration':       'Державне управління',
    // Cost band labels
    'costband.under_100':  '< $100 млн',
    'costband.100_500':    '$100 млн – $500 млн',
    'costband.500_2000':   '$500 млн – $2 млрд',
    'costband.over_2000':  '> $2 млрд',
    // Financing class labels
    'financing.grant_led':        'Грантовий (≥50%)',
    'financing.concessional_led': 'Пільговий кредит',
    'financing.blended':          'Змішаний',
    'financing.private_anchored': 'Приватний (≥30%)',
    // Disclaimer
    'disclaimer.text':    'Оцінки вартості та структури фінансування базуються на опублікованих орієнтирах питомих витрат (RDNA3, Інститут KSE) та порівнянних українських прецедентах. Вони не є гарантіями, тендерними пропозиціями чи заміною транзакційного due diligence.',
    'disclaimer.dismiss': 'Зрозуміло',
    // Version bar
    'version.force_update': 'Оновити',
    'version.update_msg':   '· Нова версія —',
    'version.reload':       'оновити',
    // Feedback
    'feedback.btn':              'Відгук',
    'feedback.title':            'Надіслати відгук',
    'feedback.name_label':       'Ім\'я',
    'feedback.name_ph':          'Ваше ім\'я',
    'feedback.email_label':      'Email',
    'feedback.email_ph':         'ваш@email.com',
    'feedback.message_label':    'Повідомлення',
    'feedback.message_ph':       'Ваш відгук, виправлення або запитання…',
    'feedback.submit':           'Надіслати',
    'feedback.sent':             'Дякуємо — ваше повідомлення надіслано.',
    // Chat
    'chat.btn':          'AI-чат',
    'chat.powered':      'Працює на Groq',
    'chat.welcome':      'Запитайте про витрати на відбудову, структури фінансування або конкретні активи.',
    'chat.suggestion1':  'Яка базова вартість Каховської ГЕС?',
    'chat.suggestion2':  'Як працює воєнне страхування MIGA?',
    'chat.suggestion3':  'Що таке сценарій «відбудови краще, ніж було»?',
    'chat.placeholder':  'Запитайте про фінансування відбудови…',
    // Oblast panel
    'oblast.close':          'Закрити',
    'oblast.capital':        'Обласний центр',
    'oblast.famous_for':     'Відомо завдяки',
    'oblast.reconstruction': 'Пріоритети відбудови',
  }
};

export function getLang() {
  return localStorage.getItem('uvidnova_lang') ?? 'en';
}

export function setLang(lang) {
  localStorage.setItem('uvidnova_lang', lang);
  document.documentElement.lang = lang;
  document.dispatchEvent(new CustomEvent('langChanged', { detail: { lang } }));
}

export function t(key) {
  const lang = getLang();
  return TRANSLATIONS[lang]?.[key] ?? TRANSLATIONS.en[key] ?? key;
}

export function getName(asset) {
  const lang = getLang();
  return (lang === 'uk' && asset.name?.uk) ? asset.name.uk : (asset.name?.en ?? asset.asset_id);
}

export function applyTranslations() {
  for (const el of document.querySelectorAll('[data-i18n]')) {
    el.textContent = t(el.dataset.i18n);
  }
  for (const el of document.querySelectorAll('[data-i18n-placeholder]')) {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  }
  for (const el of document.querySelectorAll('[data-i18n-aria]')) {
    el.setAttribute('aria-label', t(el.dataset.i18nAria));
  }
}

export function initLangToggle(btn) {
  if (!btn) return;
  const update = () => {
    const lang = getLang();
    btn.textContent  = lang === 'uk' ? '🇬🇧 English' : '🇺🇦 Українська';
    btn.setAttribute('aria-label', lang === 'uk' ? 'Switch to English' : 'Переключити на українську');
    document.documentElement.lang = lang;
    applyTranslations();
  };
  update();
  btn.addEventListener('click', () => setLang(getLang() === 'uk' ? 'en' : 'uk'));
  document.addEventListener('langChanged', update);
}
