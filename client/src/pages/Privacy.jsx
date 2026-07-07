import { useTranslation } from 'react-i18next';

const Privacy = () => {
  const { t } = useTranslation();
  return (
    <div className="container mx-auto px-4 py-12 max-w-3xl">
      <h1 className="text-2xl font-bold mb-4">{t('privacy.title')}</h1>
      <p className="text-gray-700">
        {t('privacy.body')}
      </p>
    </div>
  );
};
export default Privacy;
