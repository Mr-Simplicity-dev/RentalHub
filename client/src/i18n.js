import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./i18n/en.json";
import ru from "./i18n/ru.json";
import fr from "./i18n/fr.json";
import ar from "./i18n/ar.json";
import zh from "./i18n/zh.json";

const getInitialLanguage = () => {
  if (typeof window === 'undefined') return 'en';
  const storedLanguage = window.localStorage.getItem('rentalhub_language');
  const normalizedLanguage = String(storedLanguage || '').split('-')[0].toLowerCase();
  return ['en', 'ru', 'fr', 'ar', 'zh'].includes(normalizedLanguage)
    ? normalizedLanguage
    : 'en';
};

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ru: { translation: ru },
    fr: { translation: fr },
    ar: { translation: ar },
    zh: { translation: zh }
  },
  lng: getInitialLanguage(),
  fallbackLng: "en",
  supportedLngs: ['en', 'ru', 'fr', 'ar', 'zh'],
  load: 'languageOnly',
  interpolation: { escapeValue: false }
});

export default i18n;
