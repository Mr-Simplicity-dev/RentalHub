import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FaEnvelope, FaFacebook, FaInstagram, FaLinkedin, FaPhoneAlt, FaTwitter } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';

const Footer = () => {
  const { t } = useTranslation();
  const [mobileContactLinksEnabled, setMobileContactLinksEnabled] = useState(false);

  useEffect(() => {
    const detectMobilePhone = () => {
      if (typeof window === 'undefined' || typeof navigator === 'undefined') {
        return false;
      }

      const userAgent = navigator.userAgent || '';
      const looksLikePhone = /Android.*Mobile|iPhone|iPod|Windows Phone|BlackBerry|Opera Mini|IEMobile/i.test(userAgent);
      const hasMobilePointer = window.matchMedia?.('(hover: none) and (pointer: coarse)')?.matches;
      const phoneSizedViewport = window.matchMedia?.('(max-width: 820px)')?.matches;

      return Boolean(looksLikePhone || (hasMobilePointer && phoneSizedViewport));
    };

    const updateContactMode = () => {
      setMobileContactLinksEnabled(detectMobilePhone());
    };

    updateContactMode();
    window.addEventListener('resize', updateContactMode);

    return () => window.removeEventListener('resize', updateContactMode);
  }, []);

  return (
    <footer className="bg-gray-900 text-white">
      <div className="container mx-auto px-4 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
          <div className="space-y-4">
            <h3 className="text-xl font-bold bg-gradient-to-r from-primary-400 to-primary-200 bg-clip-text text-transparent">
              RentalHub NG
            </h3>
            <p className="text-sm text-gray-400 leading-relaxed">
              {t('footer.about')}
            </p>
            <div className="flex space-x-3 pt-2">
              <a href="https://web.facebook.com/profile.php?id=61589790625725" target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="w-9 h-9 rounded-lg bg-gray-800 flex items-center justify-center text-gray-400 hover:bg-primary-600 hover:text-white transition-all duration-300 hover:scale-110">
                <FaFacebook />
              </a>
              <a href="https://twitter.com" target="_blank" rel="noopener noreferrer" aria-label="Twitter" className="w-9 h-9 rounded-lg bg-gray-800 flex items-center justify-center text-gray-400 hover:bg-primary-600 hover:text-white transition-all duration-300 hover:scale-110">
                <FaTwitter />
              </a>
              <a href="https://www.instagram.com/rentalhubng" target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="w-9 h-9 rounded-lg bg-gray-800 flex items-center justify-center text-gray-400 hover:bg-primary-600 hover:text-white transition-all duration-300 hover:scale-110">
                <FaInstagram />
              </a>
              <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn" className="w-9 h-9 rounded-lg bg-gray-800 flex items-center justify-center text-gray-400 hover:bg-primary-600 hover:text-white transition-all duration-300 hover:scale-110">
                <FaLinkedin />
              </a>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-bold">{t('footer.quick_links')}</h3>
            <ul className="space-y-3">
              <li><FooterLink to="/properties" label={t('footer.browse')} /></li>
              <li><FooterLink to="/about" label={t('footer.about_us')} /></li>
              <li><FooterLink to="/how-it-works" label={t('footer.how')} /></li>
              <li><FooterLink to="/faq" label={t('footer.faq')} /></li>
            </ul>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-bold">{t('footer.landlords')}</h3>
            <ul className="space-y-3">
              <li><FooterLink to="/list-property" label={t('footer.list')} /></li>
              <li><FooterLink to="/pricing" label={t('footer.pricing')} /></li>
              <li><FooterLink to="/landlord-guide" label={t('footer.guide')} /></li>
            </ul>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-bold">{t('footer.contact')}</h3>
            <ul className="space-y-3 text-sm text-gray-400">
              <li>
                <FooterContact
                  href="mailto:support@rentalhub.com.ng"
                  enabled={mobileContactLinksEnabled}
                >
                  <FaEnvelope className="text-primary-400 mt-1 shrink-0" />
                  <span>support@rentalhub.com.ng</span>
                </FooterContact>
              </li>
              <li>
                <FooterContact
                  href="tel:+234 8030601238"
                  enabled={mobileContactLinksEnabled}
                >
                  <FaPhoneAlt className="text-primary-400 mt-1 shrink-0" />
                  <span>+234 8030601238</span>
                </FooterContact>
              </li>
              <li>
                <FooterContact
                  href="tel:+234 9052187099"
                  enabled={mobileContactLinksEnabled}
                >
                  <FaPhoneAlt className="text-primary-400 mt-1 shrink-0" />
                  <span>+234 9052187099</span>
                </FooterContact>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-800 mt-12 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-gray-400">&copy; 2024 RentalHub NG. {t('footer.rights')}</p>
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm md:justify-end">
            <Link to="/privacy" className="text-gray-400 hover:text-white transition-colors duration-200">
              {t('footer.privacy')}
            </Link>
            <Link to="/terms" className="text-gray-400 hover:text-white transition-colors duration-200">
              {t('footer.terms')}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
};

const FooterLink = ({ to, label }) => (
  <Link to={to} className="text-gray-400 hover:text-white transition-all duration-200 flex items-center gap-1 group">
    <span className="text-xs opacity-0 -ml-4 group-hover:opacity-100 group-hover:ml-0 transition-all duration-200 text-primary-400">{'>'}</span>
    {label}
  </Link>
);

const FooterContact = ({ href, enabled, children }) => {
  const className = enabled
    ? 'flex min-w-0 items-start gap-2 break-words hover:text-white transition-colors duration-200'
    : 'flex min-w-0 items-start gap-2 break-words';

  if (!enabled) {
    return <span className={className}>{children}</span>;
  }

  return (
    <a href={href} className={className}>
      {children}
    </a>
  );
};

export default Footer;
