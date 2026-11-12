import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import copy from "./propertyProtectionCopy.json";
const normalize = (text) => text.replace(/\s+/g, " ").trim().toLowerCase();
export default function useProtectionText(user) {
  const { i18n } = useTranslation(),
    locale = ["tenant", "landlord", "agent", "marketing_agent"].includes(
      user?.user_type,
    )
      ? i18n.language?.split("-")[0]
      : "en";
  return useMemo(() => {
    const map = new Map();
    const scan = (english, translated) => {
      for (const [key, value] of Object.entries(english || {})) {
        if (
          typeof value === "string" &&
          typeof translated?.[key] === "string" &&
          !map.has(normalize(value))
        )
          map.set(normalize(value), translated[key]);
        else if (value && typeof value === "object")
          scan(value, translated?.[key]);
      }
    };
    scan(
      i18n.getResourceBundle("en", "translation"),
      i18n.getResourceBundle(locale, "translation"),
    );
    for (const [key, value] of Object.entries(copy.en))
      map.set(normalize(value), copy[locale]?.[key] || value);
    return (text) => {
      if (typeof text !== "string" || locale === "en") return text;
      const translated = map.get(normalize(text));
      return translated
        ? text.match(/^\s*/)[0] + translated + text.match(/\s*$/)[0]
        : text;
    };
  }, [locale, i18n]);
}
