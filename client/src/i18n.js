import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./i18n/en.json";
import ru from "./i18n/ru.json";
import fr from "./i18n/fr.json";
import ar from "./i18n/ar.json";
import zh from "./i18n/zh.json";
import ha from "./i18n/ha.json";
import yo from "./i18n/yo.json";
import ig from "./i18n/ig.json";
import tourTranslations from './i18n/tourTranslations';
import dashboardUxTranslations from './i18n/dashboardUxTranslations';

const SUPPORTED_LANGUAGES = ['en', 'ru', 'fr', 'ar', 'zh', 'ha', 'yo', 'ig'];

const getInitialLanguage = () => {
  if (typeof window === 'undefined') return 'en';
  const storedLanguage = window.localStorage.getItem('rentalhub_language');
  const normalizedLanguage = String(storedLanguage || '').split('-')[0].toLowerCase();
  return SUPPORTED_LANGUAGES.includes(normalizedLanguage)
    ? normalizedLanguage
    : 'en';
};

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: { ...en, ...dashboardUxTranslations.en, tour: tourTranslations.en } },
    ru: { translation: { ...ru, ...dashboardUxTranslations.ru, tour: tourTranslations.ru } },
    fr: { translation: { ...fr, ...dashboardUxTranslations.fr, tour: tourTranslations.fr } },
    ar: { translation: { ...ar, ...dashboardUxTranslations.ar, tour: tourTranslations.ar } },
    zh: { translation: { ...zh, ...dashboardUxTranslations.zh, tour: tourTranslations.zh } },
    ha: { translation: { ...ha, ...dashboardUxTranslations.ha, tour: tourTranslations.ha } },
    yo: { translation: { ...yo, ...dashboardUxTranslations.yo, tour: tourTranslations.yo } },
    ig: { translation: { ...ig, ...dashboardUxTranslations.ig, tour: tourTranslations.ig } }
  },
  lng: getInitialLanguage(),
  fallbackLng: "en",
  supportedLngs: SUPPORTED_LANGUAGES,
  load: 'languageOnly',
  interpolation: { escapeValue: false }
});

export default i18n;
