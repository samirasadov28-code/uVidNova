/**
 * lang.js — Language state, translations, and DOM i18n.
 * Supports 16 languages. Persists preference in localStorage.
 * Dispatches 'langChanged' on switch.
 *
 * Batch 1 (FR, ES, DE) — full translations.
 * Remaining languages fall back to EN until their batch is added.
 */

export const LANG_META = {
  en: { flag: '🇬🇧', label: 'EN', name: 'English',            dir: 'ltr' },
  uk: { flag: '🇺🇦', label: 'UK', name: 'Українська',         dir: 'ltr' },
  fr: { flag: '🇫🇷', label: 'FR', name: 'Français',           dir: 'ltr' },
  es: { flag: '🇪🇸', label: 'ES', name: 'Español',            dir: 'ltr' },
  de: { flag: '🇩🇪', label: 'DE', name: 'Deutsch',            dir: 'ltr' },
  pt: { flag: '🇧🇷', label: 'PT', name: 'Português',          dir: 'ltr' },
  it: { flag: '🇮🇹', label: 'IT', name: 'Italiano',           dir: 'ltr' },
  nl: { flag: '🇳🇱', label: 'NL', name: 'Nederlands',         dir: 'ltr' },
  tr: { flag: '🇹🇷', label: 'TR', name: 'Türkçe',             dir: 'ltr' },
  zh: { flag: '🇨🇳', label: 'ZH', name: '中文',               dir: 'ltr' },
  ar: { flag: '🇸🇦', label: 'AR', name: 'العربية',            dir: 'rtl' },
  hi: { flag: '🇮🇳', label: 'HI', name: 'हिन्दी',             dir: 'ltr' },
  ru: { flag: null,   label: 'RU', name: 'Русский',            dir: 'ltr' },
  bn: { flag: '🇧🇩', label: 'BN', name: 'বাংলা',              dir: 'ltr' },
  ja: { flag: '🇯🇵', label: 'JA', name: '日本語',             dir: 'ltr' },
  id: { flag: '🇮🇩', label: 'ID', name: 'Bahasa Indonesia',   dir: 'ltr' },
};

const TRANSLATIONS = {
  en: {
    // Name etymology
    'name.u.label':       'Ukraine · you',
    'name.vidnova.label': 'відновa — restoration · Nova, new star',
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
    // Sector labels
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
    'chat.title':        'uVidNova AI',
    'chat.powered':      'Powered by Groq',
    'chat.welcome':      'Ask me about reconstruction costs, financing structures, or specific assets.',
    'chat.suggestion1':  'What is the Kakhovka HPP baseline cost?',
    'chat.suggestion2':  'How does MIGA war insurance work?',
    'chat.suggestion3':  'What is the build-back-better path?',
    'chat.placeholder':  'Ask about reconstruction financing…',
    // Oblast panel
    'oblast.close':           'Close',
    'oblast.capital':         'Capital',
    'oblast.famous_for':      'Known for',
    'oblast.reconstruction':  'Reconstruction focus',
    'oblast.resources':       'Key resources',
    'oblast.revenue_drivers': 'Revenue drivers',
    'oblast.history':         'History',
    // Map popups
    'popup.cost_pending':  'Cost estimate pending methodology',
    'popup.baseline':      'Baseline: {cost} central',
    'popup.redamaged':     '⚠ Re-damaged ×{n}',
    'popup.full_profile':  'Full financing profile →',
    // Asset list
    'asset.list.title':    'Reconstruction Assets',
    // Aggregation panel
    'agg.total_label':     'Pipeline baseline total',
    'agg.by_sector':       'By sector',
    'agg.by_rebuildability': 'By rebuildability',
    'agg.by_oblast':       'By oblast',
    'agg.by_financing':    'By financing class',
    'agg.no_assets':       'No assets match current filters.',
    'agg.redamaged_note':  '⚠ {n} asset re-damaged ×2 or more',
    'agg.redamaged_note_pl':'⚠ {n} assets re-damaged ×2 or more',
    'agg.disclaimer':      'All figures: USD baseline central estimate. Not guarantees.',
    // Header action buttons
    'header.finance_btn':  'Finance Projects',
    'header.trust_btn':    'Create Trust',
    // Bottom action bar
    'bar.occupied':        'Occupied territories',
    // Map view tabs
    'tab.ukraine':         'Ukraine',
    'tab.damaged':         'Damaged',
    'tab.reconstructed':   'Reconstructed',
    'tab.development':     'Development',
  },

  uk: {
    'name.u.label':       'Україна · ти',
    'name.vidnova.label': 'відновa — відновлення · Nova — нова зоря',
    'landing.sub':        'Атлас фінансування відбудови України',
    'landing.desc':       'Реєстр воєнних пошкоджень та можливостей відбудови на рівні активів — з проєктно-фінансовою точністю. Кожна цифра простежується до RDNA3, Інституту KSE та верифікованих відкритих джерел.',
    'landing.feat1':      'Детерміновані кошторисні розрахунки — три шляхи відбудови для кожного активу',
    'landing.feat2':      'Захищені структури фінансування — гранти, пільгові кредити, капітал, приватні інвестиції',
    'landing.feat3':      'Відстеження повторних пошкоджень та класифікація воєнних ризиків',
    'landing.cta':        'Відкрити атлас →',
    'landing.audience':   'Для інвестиційних офіцерів ВФУ · Інфраструктурних філантропів · Дослідників',
    'landing.disclaimer': 'Не платформа для збору коштів. Без політичного контексту. Кожна цифра має незалежне підтвердження.',
    'header.tagline':     'Атлас фінансування відбудови України',
    'nav.methodology':    'Методологія',
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
    'sector.energy_and_power':            'Енергетика та електропостачання',
    'sector.healthcare':                  'Охорона здоров\'я',
    'sector.education':                   'Освіта',
    'sector.residential':                 'Житловий сектор',
    'sector.heritage_and_culture':        'Спадщина та культура',
    'sector.transport_and_ports':         'Транспорт та порти',
    'sector.water_and_sanitation':        'Водопостачання та санітарія',
    'sector.industrial_and_agricultural': 'Промисловість та сільське господарство',
    'sector.public_administration':       'Державне управління',
    'costband.under_100':  '< $100 млн',
    'costband.100_500':    '$100 млн – $500 млн',
    'costband.500_2000':   '$500 млн – $2 млрд',
    'costband.over_2000':  '> $2 млрд',
    'financing.grant_led':        'Грантовий (≥50%)',
    'financing.concessional_led': 'Пільговий кредит',
    'financing.blended':          'Змішаний',
    'financing.private_anchored': 'Приватний (≥30%)',
    'disclaimer.text':    'Оцінки вартості та структури фінансування базуються на опублікованих орієнтирах питомих витрат (RDNA3, Інститут KSE) та порівнянних українських прецедентах. Вони не є гарантіями, тендерними пропозиціями чи заміною транзакційного due diligence.',
    'disclaimer.dismiss': 'Зрозуміло',
    'version.force_update': 'Оновити',
    'version.update_msg':   '· Нова версія —',
    'version.reload':       'оновити',
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
    'chat.btn':          'AI-чат',
    'chat.title':        'uVidNova ШІ',
    'chat.powered':      'Працює на Groq',
    'chat.welcome':      'Запитайте про витрати на відбудову, структури фінансування або конкретні активи.',
    'chat.suggestion1':  'Яка базова вартість Каховської ГЕС?',
    'chat.suggestion2':  'Як працює воєнне страхування MIGA?',
    'chat.suggestion3':  'Що таке сценарій «відбудови краще, ніж було»?',
    'chat.placeholder':  'Запитайте про фінансування відбудови…',
    'oblast.close':           'Закрити',
    'oblast.capital':         'Обласний центр',
    'oblast.famous_for':      'Відомо завдяки',
    'oblast.reconstruction':  'Пріоритети відбудови',
    'oblast.resources':       'Ключові ресурси',
    'oblast.revenue_drivers': 'Рушії доходів',
    'oblast.history':         'Історія',
    'popup.cost_pending':  'Кошторис очікується',
    'popup.baseline':      'Базовий: {cost} центральний',
    'popup.redamaged':     '⚠ Пошкоджено повторно ×{n}',
    'popup.full_profile':  'Повний фінансовий профіль →',
    'asset.list.title':    'Активи відбудови',
    'agg.total_label':     'Загальний базовий показник',
    'agg.by_sector':       'За сектором',
    'agg.by_rebuildability': 'За можливістю відбудови',
    'agg.by_oblast':       'За областю',
    'agg.by_financing':    'За класом фінансування',
    'agg.no_assets':       'Немає активів, що відповідають фільтрам.',
    'agg.redamaged_note':  '⚠ {n} актив пошкоджено повторно ×2+',
    'agg.redamaged_note_pl':'⚠ {n} активів пошкоджено повторно ×2+',
    'agg.disclaimer':      'Усі дані: базова центральна оцінка в USD. Не є гарантіями.',
    'header.finance_btn':  'Фінансувати проєкти',
    'header.trust_btn':    'Заснувати фонд',
    'bar.occupied':        'Окуповані території',
    'tab.ukraine':         'Україна',
    'tab.damaged':         'Пошкоджено',
    'tab.reconstructed':   'Відбудовано',
    'tab.development':     'Розвиток',
  },

  // ── Batch 1 ───────────────────────────────────────────────────────────────

  fr: {
    'name.u.label':       'Ukraine · vous',
    'name.vidnova.label': 'відновa — restauration · Nova, nouvelle étoile',
    'landing.sub':        'Atlas du financement de la reconstruction en Ukraine',
    'landing.desc':       'Un registre des dommages de guerre et des opportunités de reconstruction à l\'échelle des actifs, de qualité financement de projet. Chaque chiffre traçable jusqu\'à RDNA3, KSE Institute et renseignements vérifiés en source ouverte.',
    'landing.feat1':      'Estimations de coûts déterministes — trois voies de reconstruction par actif',
    'landing.feat2':      'Structures de financement défendables — subvention, concessionnel, capitaux propres, privé',
    'landing.feat3':      'Suivi des re-dommages et classification des risques de guerre',
    'landing.cta':        'Explorer l\'atlas →',
    'landing.audience':   'Pour les chargés d\'investissement des IFD · Philanthropies d\'infrastructure · Chercheurs en politiques',
    'landing.disclaimer': 'Pas une plateforme de collecte de fonds. Aucun cadrage politique. Chaque chiffre sourcé indépendamment.',
    'header.tagline':     'Atlas du financement de la reconstruction en Ukraine',
    'nav.methodology':    'Méthodologie',
    'filter.title':       'Filtres',
    'filter.reset':       'Réinitialiser',
    'filter.sector':      'Secteur',
    'filter.oblast':      'Oblast',
    'filter.rebuildability':        'Reconstructibilité',
    'filter.chip.rebuildable':      'Reconstructible',
    'filter.chip.recently_liberated': 'Récemment libéré',
    'filter.chip.frontline_adjacent': 'Proche du front',
    'filter.chip.occupied':         'Occupé',
    'filter.lifecycle':             'Cycle de vie',
    'filter.chip.documented':       'Documenté',
    'filter.chip.assessed':         'Évalué',
    'filter.chip.in_pipeline':      'En cours',
    'filter.chip.funded':           'Financé',
    'filter.chip.under_reconstruction': 'En reconstruction',
    'filter.chip.complete':         'Terminé',
    'filter.cost_band':             'Besoins en capital (central de référence)',
    'filter.financing_class':       'Classe de financement (référence)',
    'filter.redamage_label':        'Actifs re-endommagés uniquement',
    'filter.redamage_chip':         '⚠ Re-endommagé ×2+',
    'filter.loading':               'Chargement…',
    'sector.energy_and_power':            'Énergie et électricité',
    'sector.healthcare':                  'Santé',
    'sector.education':                   'Éducation',
    'sector.residential':                 'Résidentiel',
    'sector.heritage_and_culture':        'Patrimoine et culture',
    'sector.transport_and_ports':         'Transport et ports',
    'sector.water_and_sanitation':        'Eau et assainissement',
    'sector.industrial_and_agricultural': 'Industrie et agriculture',
    'sector.public_administration':       'Administration publique',
    'costband.under_100':  '< 100 M$',
    'costband.100_500':    '100 M$ – 500 M$',
    'costband.500_2000':   '500 M$ – 2 Md$',
    'costband.over_2000':  '> 2 Md$',
    'financing.grant_led':        'Subvention (≥50%)',
    'financing.concessional_led': 'Concessionnel',
    'financing.blended':          'Mixte',
    'financing.private_anchored': 'Privé (≥30%)',
    'disclaimer.text':    'Les chiffres de coûts et de structures de financement sont des estimations dérivées de références de coûts unitaires publiées (RDNA3, KSE Institute) et de précédents ukrainiens comparables. Ils ne constituent pas des garanties, des devis ni un substitut à la due diligence transactionnelle.',
    'disclaimer.dismiss': 'Compris',
    'version.force_update': 'Forcer la mise à jour',
    'version.update_msg':   '· Nouvelle version disponible —',
    'version.reload':       'recharger',
    'feedback.btn':              'Commentaires',
    'feedback.title':            'Envoyer un commentaire',
    'feedback.name_label':       'Nom',
    'feedback.name_ph':          'Votre nom',
    'feedback.email_label':      'E-mail',
    'feedback.email_ph':         'votre@email.com',
    'feedback.message_label':    'Message',
    'feedback.message_ph':       'Votre commentaire, correction ou question…',
    'feedback.submit':           'Envoyer',
    'feedback.sent':             'Merci — votre message a été envoyé.',
    'chat.btn':          'Demander à l\'IA',
    'chat.title':        'uVidNova IA',
    'chat.powered':      'Propulsé par Groq',
    'chat.welcome':      'Posez-moi des questions sur les coûts de reconstruction, les structures de financement ou des actifs spécifiques.',
    'chat.suggestion1':  'Quel est le coût de référence de la HPP Kakhovka ?',
    'chat.suggestion2':  'Comment fonctionne l\'assurance guerre MIGA ?',
    'chat.suggestion3':  'Qu\'est-ce que le scénario « reconstruire mieux » ?',
    'chat.placeholder':  'Posez une question sur le financement de la reconstruction…',
    'oblast.close':           'Fermer',
    'oblast.capital':         'Capitale',
    'oblast.famous_for':      'Connu pour',
    'oblast.reconstruction':  'Priorités de reconstruction',
    'oblast.resources':       'Ressources clés',
    'oblast.revenue_drivers': 'Moteurs de revenus',
    'oblast.history':         'Histoire',
    'popup.cost_pending':  'Estimation en attente',
    'popup.baseline':      'Référence : {cost} central',
    'popup.redamaged':     '⚠ Re-endommagé ×{n}',
    'popup.full_profile':  'Profil de financement complet →',
    'asset.list.title':    'Actifs de reconstruction',
    'agg.total_label':     'Total du pipeline de référence',
    'agg.by_sector':       'Par secteur',
    'agg.by_rebuildability': 'Par reconstructibilité',
    'agg.by_oblast':       'Par oblast',
    'agg.by_financing':    'Par classe de financement',
    'agg.no_assets':       'Aucun actif ne correspond aux filtres actuels.',
    'agg.redamaged_note':  '⚠ {n} actif re-endommagé ×2 ou plus',
    'agg.redamaged_note_pl':'⚠ {n} actifs re-endommagés ×2 ou plus',
    'agg.disclaimer':      'Tous les chiffres : estimation centrale de référence en USD. Non garantis.',
    'header.finance_btn':  'Financer des projets',
    'header.trust_btn':    'Créer un fonds',
    'bar.occupied':        'Territoires occupés',
    'tab.ukraine':         'Ukraine',
    'tab.damaged':         'Endommagé',
    'tab.reconstructed':   'Reconstruit',
    'tab.development':     'Développement',
  },

  es: {
    'name.u.label':       'Ucrania · tú',
    'name.vidnova.label': 'відновa — restauración · Nova, nueva estrella',
    'landing.sub':        'Atlas de Financiamiento de la Reconstrucción de Ucrania',
    'landing.desc':       'Un registro de daños de guerra y oportunidades de reconstrucción a nivel de activos, con calidad de financiamiento de proyectos. Cada cifra trazable a RDNA3, KSE Institute e inteligencia verificada de fuentes abiertas.',
    'landing.feat1':      'Estimaciones de costos deterministas — tres vías de reconstrucción por activo',
    'landing.feat2':      'Estructuras de financiamiento sólidas — subvención, concesional, capital, privado',
    'landing.feat3':      'Seguimiento de daños repetidos y clasificación de riesgos bélicos',
    'landing.cta':        'Explorar el atlas →',
    'landing.audience':   'Para oficiales de inversión de IFD · Filantropías de infraestructura · Investigadores de políticas',
    'landing.disclaimer': 'No es una plataforma de recaudación de fondos. Sin encuadre político. Cada cifra con fuente independiente.',
    'header.tagline':     'Atlas de Financiamiento de la Reconstrucción de Ucrania',
    'nav.methodology':    'Metodología',
    'filter.title':       'Filtros',
    'filter.reset':       'Restablecer',
    'filter.sector':      'Sector',
    'filter.oblast':      'Oblast',
    'filter.rebuildability':        'Reconstruibilidad',
    'filter.chip.rebuildable':      'Reconstruible',
    'filter.chip.recently_liberated': 'Recientemente liberado',
    'filter.chip.frontline_adjacent': 'Adyacente al frente',
    'filter.chip.occupied':         'Ocupado',
    'filter.lifecycle':             'Ciclo de vida',
    'filter.chip.documented':       'Documentado',
    'filter.chip.assessed':         'Evaluado',
    'filter.chip.in_pipeline':      'En proceso',
    'filter.chip.funded':           'Financiado',
    'filter.chip.under_reconstruction': 'En reconstrucción',
    'filter.chip.complete':         'Completo',
    'filter.cost_band':             'Requerimiento de capital (central de referencia)',
    'filter.financing_class':       'Clase de financiamiento (referencia)',
    'filter.redamage_label':        'Solo activos re-dañados',
    'filter.redamage_chip':         '⚠ Re-dañado ×2+',
    'filter.loading':               'Cargando…',
    'sector.energy_and_power':            'Energía y electricidad',
    'sector.healthcare':                  'Salud',
    'sector.education':                   'Educación',
    'sector.residential':                 'Residencial',
    'sector.heritage_and_culture':        'Patrimonio y cultura',
    'sector.transport_and_ports':         'Transporte y puertos',
    'sector.water_and_sanitation':        'Agua y saneamiento',
    'sector.industrial_and_agricultural': 'Industrial y agrícola',
    'sector.public_administration':       'Administración pública',
    'costband.under_100':  '< $100M',
    'costband.100_500':    '$100M – $500M',
    'costband.500_2000':   '$500M – $2MM',
    'costband.over_2000':  '> $2MM',
    'financing.grant_led':        'Subvención (≥50%)',
    'financing.concessional_led': 'Concesional',
    'financing.blended':          'Mixto',
    'financing.private_anchored': 'Privado (≥30%)',
    'disclaimer.text':    'Las cifras de costos y estructuras de financiamiento son estimaciones derivadas de referencias de costos unitarios publicadas (RDNA3, KSE Institute) y precedentes ucranianos comparables. No son garantías, cotizaciones de adquisición ni sustitutos de la debida diligencia transaccional.',
    'disclaimer.dismiss': 'Entendido',
    'version.force_update': 'Forzar actualización',
    'version.update_msg':   '· Nueva versión disponible —',
    'version.reload':       'recargar',
    'feedback.btn':              'Comentarios',
    'feedback.title':            'Enviar comentarios',
    'feedback.name_label':       'Nombre',
    'feedback.name_ph':          'Tu nombre',
    'feedback.email_label':      'Correo electrónico',
    'feedback.email_ph':         'tu@correo.com',
    'feedback.message_label':    'Mensaje',
    'feedback.message_ph':       'Tu comentario, corrección o pregunta…',
    'feedback.submit':           'Enviar',
    'feedback.sent':             'Gracias — tu mensaje ha sido enviado.',
    'chat.btn':          'Preguntar a IA',
    'chat.title':        'uVidNova IA',
    'chat.powered':      'Impulsado por Groq',
    'chat.welcome':      'Pregúntame sobre costos de reconstrucción, estructuras de financiamiento o activos específicos.',
    'chat.suggestion1':  '¿Cuál es el costo base de la HPP de Kakhovka?',
    'chat.suggestion2':  '¿Cómo funciona el seguro de guerra MIGA?',
    'chat.suggestion3':  '¿Qué es el escenario "reconstruir mejor"?',
    'chat.placeholder':  'Pregunta sobre financiamiento de reconstrucción…',
    'oblast.close':           'Cerrar',
    'oblast.capital':         'Capital',
    'oblast.famous_for':      'Conocido por',
    'oblast.reconstruction':  'Enfoque de reconstrucción',
    'oblast.resources':       'Recursos clave',
    'oblast.revenue_drivers': 'Impulsores de ingresos',
    'oblast.history':         'Historia',
    'popup.cost_pending':  'Estimación de costo pendiente',
    'popup.baseline':      'Referencia: {cost} central',
    'popup.redamaged':     '⚠ Re-dañado ×{n}',
    'popup.full_profile':  'Perfil de financiamiento completo →',
    'asset.list.title':    'Activos de reconstrucción',
    'agg.total_label':     'Total del pipeline de referencia',
    'agg.by_sector':       'Por sector',
    'agg.by_rebuildability': 'Por reconstruibilidad',
    'agg.by_oblast':       'Por oblast',
    'agg.by_financing':    'Por clase de financiamiento',
    'agg.no_assets':       'No hay activos que coincidan con los filtros actuales.',
    'agg.redamaged_note':  '⚠ {n} activo re-dañado ×2 o más',
    'agg.redamaged_note_pl':'⚠ {n} activos re-dañados ×2 o más',
    'agg.disclaimer':      'Todos los valores: estimación central de referencia en USD. No son garantías.',
    'header.finance_btn':  'Financiar proyectos',
    'header.trust_btn':    'Crear fondo',
    'bar.occupied':        'Territorios ocupados',
    'tab.ukraine':         'Ucrania',
    'tab.damaged':         'Dañado',
    'tab.reconstructed':   'Reconstruido',
    'tab.development':     'Desarrollo',
  },

  de: {
    'name.u.label':       'Ukraine · du',
    'name.vidnova.label': 'відновa — Wiederherstellung · Nova, neuer Stern',
    'landing.sub':        'Atlas der Ukraine-Wiederaufbaufinanzierung',
    'landing.desc':       'Ein Schadensregister und Chancenregister für den Wiederaufbau auf Anlagenbasis mit Projekt-Finanzierungsqualität. Jede Zahl rückverfolgbar auf RDNA3, KSE Institute und verifizierte Open-Source-Intelligence.',
    'landing.feat1':      'Deterministische Kostenschätzungen — drei Wiederaufbaupfade pro Anlage',
    'landing.feat2':      'Vertretbare Finanzierungsstrukturen — Zuschüsse, Konzessional, Eigenkapital, Privat',
    'landing.feat3':      'Erfassung von Mehrfachschäden und Kriegsrisikoklassifizierung',
    'landing.cta':        'Atlas erkunden →',
    'landing.audience':   'Für DFI-Investmentbeauftragte · Infrastruktur-Philanthropien · Politikforscher',
    'landing.disclaimer': 'Keine Spendenplattform. Kein politischer Rahmen. Jede Zahl unabhängig belegt.',
    'header.tagline':     'Atlas der Ukraine-Wiederaufbaufinanzierung',
    'nav.methodology':    'Methodik',
    'filter.title':       'Filter',
    'filter.reset':       'Zurücksetzen',
    'filter.sector':      'Sektor',
    'filter.oblast':      'Oblast',
    'filter.rebuildability':        'Wiederaufbaubarkeit',
    'filter.chip.rebuildable':      'Wiederaufbaubar',
    'filter.chip.recently_liberated': 'Kürzlich befreit',
    'filter.chip.frontline_adjacent': 'Frontnah',
    'filter.chip.occupied':         'Besetzt',
    'filter.lifecycle':             'Lebenszyklus',
    'filter.chip.documented':       'Dokumentiert',
    'filter.chip.assessed':         'Bewertet',
    'filter.chip.in_pipeline':      'In Planung',
    'filter.chip.funded':           'Finanziert',
    'filter.chip.under_reconstruction': 'Im Wiederaufbau',
    'filter.chip.complete':         'Abgeschlossen',
    'filter.cost_band':             'Kapitalbedarf (Basiszentral)',
    'filter.financing_class':       'Finanzierungsklasse (Basis)',
    'filter.redamage_label':        'Nur mehrfach beschädigte Anlagen',
    'filter.redamage_chip':         '⚠ Mehrfach beschädigt ×2+',
    'filter.loading':               'Laden…',
    'sector.energy_and_power':            'Energie und Strom',
    'sector.healthcare':                  'Gesundheitswesen',
    'sector.education':                   'Bildung',
    'sector.residential':                 'Wohnbereich',
    'sector.heritage_and_culture':        'Kulturerbe und Kultur',
    'sector.transport_and_ports':         'Verkehr und Häfen',
    'sector.water_and_sanitation':        'Wasser und Abwasser',
    'sector.industrial_and_agricultural': 'Industrie und Landwirtschaft',
    'sector.public_administration':       'Öffentliche Verwaltung',
    'costband.under_100':  '< 100 Mio.$',
    'costband.100_500':    '100–500 Mio.$',
    'costband.500_2000':   '500 Mio.–2 Mrd.$',
    'costband.over_2000':  '> 2 Mrd.$',
    'financing.grant_led':        'Zuschuss-geführt (≥50%)',
    'financing.concessional_led': 'Konzessional',
    'financing.blended':          'Gemischt',
    'financing.private_anchored': 'Privat (≥30%)',
    'disclaimer.text':    'Kosten- und Finanzierungsstrukturschätzungen basieren auf veröffentlichten Einheitskostenbenchmarks (RDNA3, KSE Institute) und vergleichbaren ukrainischen Präzedenzfällen. Sie sind keine Garantien, keine Ausschreibungsangebote und kein Ersatz für transaktionsbezogene Due-Diligence-Prüfungen.',
    'disclaimer.dismiss': 'Verstanden',
    'version.force_update': 'Update erzwingen',
    'version.update_msg':   '· Neue Version bereit —',
    'version.reload':       'neu laden',
    'feedback.btn':              'Feedback',
    'feedback.title':            'Feedback senden',
    'feedback.name_label':       'Name',
    'feedback.name_ph':          'Ihr Name',
    'feedback.email_label':      'E-Mail',
    'feedback.email_ph':         'ihre@email.com',
    'feedback.message_label':    'Nachricht',
    'feedback.message_ph':       'Ihr Feedback, Korrektur oder Frage…',
    'feedback.submit':           'Senden',
    'feedback.sent':             'Danke — Ihre Nachricht wurde gesendet.',
    'chat.btn':          'KI fragen',
    'chat.title':        'uVidNova KI',
    'chat.powered':      'Betrieben von Groq',
    'chat.welcome':      'Fragen Sie mich zu Wiederaufbaukosten, Finanzierungsstrukturen oder spezifischen Anlagen.',
    'chat.suggestion1':  'Was sind die Basiskosten des Kakhovka-HPP?',
    'chat.suggestion2':  'Wie funktioniert die MIGA-Kriegsversicherung?',
    'chat.suggestion3':  'Was ist der "besser wiederaufbauen"-Pfad?',
    'chat.placeholder':  'Frage zur Wiederaufbaufinanzierung…',
    'oblast.close':           'Schließen',
    'oblast.capital':         'Hauptstadt',
    'oblast.famous_for':      'Bekannt für',
    'oblast.reconstruction':  'Wiederaufbauschwerpunkte',
    'oblast.resources':       'Schlüsselressourcen',
    'oblast.revenue_drivers': 'Einnahmetreiber',
    'oblast.history':         'Geschichte',
    'popup.cost_pending':  'Kostenschätzung ausstehend',
    'popup.baseline':      'Basis: {cost} zentral',
    'popup.redamaged':     '⚠ Mehrfach beschädigt ×{n}',
    'popup.full_profile':  'Vollständiges Finanzierungsprofil →',
    'asset.list.title':    'Wiederaufbauobjekte',
    'agg.total_label':     'Pipeline-Gesamtsumme (Basis)',
    'agg.by_sector':       'Nach Sektor',
    'agg.by_rebuildability': 'Nach Wiederaufbaubarkeit',
    'agg.by_oblast':       'Nach Oblast',
    'agg.by_financing':    'Nach Finanzierungsklasse',
    'agg.no_assets':       'Keine Anlagen entsprechen den aktuellen Filtern.',
    'agg.redamaged_note':  '⚠ {n} Anlage mehrfach beschädigt ×2+',
    'agg.redamaged_note_pl':'⚠ {n} Anlagen mehrfach beschädigt ×2+',
    'agg.disclaimer':      'Alle Angaben: USD-Basis-Zentralschätzung. Keine Garantien.',
    'header.finance_btn':  'Projekte finanzieren',
    'header.trust_btn':    'Fonds gründen',
    'bar.occupied':        'Besetzte Gebiete',
    'tab.ukraine':         'Ukraine',
    'tab.damaged':         'Beschädigt',
    'tab.reconstructed':   'Wiederaufgebaut',
    'tab.development':     'Entwicklung',
  },
};

// ── Core functions ─────────────────────────────────────────────────────────

export function getLang() {
  try { return localStorage.getItem('uvidnova_lang') ?? 'en'; } catch { return 'en'; }
}

export function setLang(lang) {
  if (!LANG_META[lang]) return;
  try { localStorage.setItem('uvidnova_lang', lang); } catch { /* storage unavailable */ }
  const meta = LANG_META[lang];
  document.documentElement.lang = lang;
  document.documentElement.dir  = meta.dir ?? 'ltr';
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

// ── Language picker ────────────────────────────────────────────────────────

export function initLangToggle(btn) {
  if (!btn) return;

  // Wrap btn in a picker container
  const wrapper = document.createElement('div');
  wrapper.className = 'lang-picker';
  if (btn.classList.contains('landing-lang-toggle')) {
    wrapper.classList.add('landing-lang-picker');
  }
  btn.parentNode.insertBefore(wrapper, btn);
  wrapper.appendChild(btn);

  // Convert btn to trigger styling
  btn.classList.remove('lang-toggle', 'landing-lang-toggle');
  btn.classList.add('lang-picker-btn');

  // Build dropdown grid
  const dropdown = document.createElement('div');
  dropdown.className = 'lang-picker-dropdown';
  dropdown.setAttribute('role', 'listbox');
  wrapper.appendChild(dropdown);

  for (const [code, meta] of Object.entries(LANG_META)) {
    const opt = document.createElement('button');
    opt.className = 'lang-option';
    opt.dataset.lang = code;
    opt.setAttribute('role', 'option');
    opt.title = meta.name;
    if (meta.flag) {
      opt.innerHTML = `<span class="lo-flag">${meta.flag}</span><span class="lo-code">${meta.label}</span>`;
    } else {
      opt.innerHTML = `<span class="lo-noflag">${meta.label}</span><span class="lo-code">${meta.label}</span>`;
    }
    dropdown.appendChild(opt);
  }

  const syncUI = () => {
    const lang = getLang();
    const meta = LANG_META[lang] ?? LANG_META.en;
    const flagHtml = meta.flag
      ? `<span class="lpb-flag">${meta.flag}</span>`
      : `<span class="lpb-noflag">${meta.label}</span>`;
    btn.innerHTML = `${flagHtml}<span class="lpb-code">${meta.label}</span><span class="lpb-chevron">▾</span>`;
    for (const opt of dropdown.querySelectorAll('.lang-option')) {
      opt.classList.toggle('active', opt.dataset.lang === lang);
    }
  };

  syncUI();
  applyTranslations();

  btn.addEventListener('click', e => {
    e.stopPropagation();
    // Close any other open pickers
    document.querySelectorAll('.lang-picker-dropdown.open').forEach(d => {
      if (d !== dropdown) d.classList.remove('open');
    });
    dropdown.classList.toggle('open');
  });

  dropdown.addEventListener('click', e => {
    const opt = e.target.closest('.lang-option');
    if (!opt) return;
    setLang(opt.dataset.lang);
    dropdown.classList.remove('open');
  });

  document.addEventListener('click', () => dropdown.classList.remove('open'));
  dropdown.addEventListener('click', e => e.stopPropagation());

  document.addEventListener('langChanged', () => {
    syncUI();
    applyTranslations();
  });
}
