import languageSkillsTranslations from './i18n/languageSkillsTranslations';
import legalCasesTranslations from './i18n/legalCasesTranslations';
import registrationDraftTranslations from './i18n/registrationDraftTranslations';
import volunteerTranslations from './i18n/volunteerTranslations';
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
    en: { translation: { ...en, legalCases:legalCasesTranslations.en, registrationDraft:registrationDraftTranslations.en, support:{...en.support,...languageSkillsTranslations.en.support}, careers: {...en.careers, ...volunteerTranslations.en, ...languageSkillsTranslations.en.careers}, ...dashboardUxTranslations.en, tour: tourTranslations.en } },
    ru: { translation: { ...ru, legalCases:legalCasesTranslations.ru, registrationDraft:registrationDraftTranslations.ru, support:{...ru.support,...languageSkillsTranslations.ru.support}, careers: {...ru.careers, ...volunteerTranslations.ru, ...languageSkillsTranslations.ru.careers}, ...dashboardUxTranslations.ru, tour: tourTranslations.ru } },
    fr: { translation: { ...fr, legalCases:legalCasesTranslations.fr, registrationDraft:registrationDraftTranslations.fr, support:{...fr.support,...languageSkillsTranslations.fr.support}, careers: {...fr.careers, ...volunteerTranslations.fr, ...languageSkillsTranslations.fr.careers}, ...dashboardUxTranslations.fr, tour: tourTranslations.fr } },
    ar: { translation: { ...ar, legalCases:legalCasesTranslations.ar, registrationDraft:registrationDraftTranslations.ar, support:{...ar.support,...languageSkillsTranslations.ar.support}, careers: {...ar.careers, ...volunteerTranslations.ar, ...languageSkillsTranslations.ar.careers}, ...dashboardUxTranslations.ar, tour: tourTranslations.ar } },
    zh: { translation: { ...zh, legalCases:legalCasesTranslations.zh, registrationDraft:registrationDraftTranslations.zh, support:{...zh.support,...languageSkillsTranslations.zh.support}, careers: {...zh.careers, ...volunteerTranslations.zh, ...languageSkillsTranslations.zh.careers}, ...dashboardUxTranslations.zh, tour: tourTranslations.zh } },
    ha: { translation: { ...ha, legalCases:legalCasesTranslations.ha, registrationDraft:registrationDraftTranslations.ha, support:{...ha.support,...languageSkillsTranslations.ha.support}, careers: {...ha.careers, ...volunteerTranslations.ha, ...languageSkillsTranslations.ha.careers}, ...dashboardUxTranslations.ha, tour: tourTranslations.ha } },
    yo: { translation: { ...yo, legalCases:legalCasesTranslations.yo, registrationDraft:registrationDraftTranslations.yo, support:{...yo.support,...languageSkillsTranslations.yo.support}, careers: {...yo.careers, ...volunteerTranslations.yo, ...languageSkillsTranslations.yo.careers}, ...dashboardUxTranslations.yo, tour: tourTranslations.yo } },
    ig: { translation: { ...ig, legalCases:legalCasesTranslations.ig, registrationDraft:registrationDraftTranslations.ig, support:{...ig.support,...languageSkillsTranslations.ig.support}, careers: {...ig.careers, ...volunteerTranslations.ig, ...languageSkillsTranslations.ig.careers}, ...dashboardUxTranslations.ig, tour: tourTranslations.ig } }
  },
  lng: getInitialLanguage(),
  fallbackLng: "en",
  supportedLngs: SUPPORTED_LANGUAGES,
  load: 'languageOnly',
  interpolation: { escapeValue: false }
});

export default i18n;
