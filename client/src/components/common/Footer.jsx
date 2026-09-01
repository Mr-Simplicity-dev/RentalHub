import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FaEnvelope, FaFacebook, FaInstagram, FaLinkedin, FaPhoneAlt, FaTwitter, FaYoutube } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';

const Footer = () => {
  const { t } = useTranslation();
  const [mobileContactLinksEnabled, setMobileContactLinksEnabled] = useState(false);
  const [careerLinkVisible, setCareerLinkVisible] = useState(false);
  const [surveyLinkVisible, setSurveyLinkVisible] = useState(false);

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

  useEffect(() => {
    let active = true;

    api.get('/recruitment/status')
      .then((res) => {
        if (active) setCareerLinkVisible(Boolean(res.data?.data?.is_active));
      })
      .catch(() => {
        if (active) setCareerLinkVisible(false);
      });

    api.get('/survey/public-flags')
      .then((res) => {
        if (active) setSurveyLinkVisible(Boolean(res.data?.data?.survey_public_enabled));
      })
      .catch(() => {
        if (active) setSurveyLinkVisible(false);
      });

    return () => {
      active = false;
    };
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
              <a href="https://web.facebook.com/profile.php?id=61589790625725" target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center text-[#1877F2] hover:bg-[#1877F2] hover:text-white transition-all duration-300 hover:scale-110">
                <FaFacebook size={18} />
              </a>
              <a href="https://twitter.com" target="_blank" rel="noopener noreferrer" aria-label="Twitter" className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center text-gray-300 hover:bg-gray-900 hover:text-white transition-all duration-300 hover:scale-110">
                <FaTwitter size={18} />
              </a>
              <a href="https://www.instagram.com/rentalhubng" target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center text-[#E4405F] hover:bg-gradient-to-br hover:from-[#833AB4] hover:via-[#FD1D1D] hover:to-[#F77737] hover:text-white transition-all duration-300 hover:scale-110">
                <FaInstagram size={18} />
              </a>
              <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn" className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center text-[#0A66C2] hover:bg-[#0A66C2] hover:text-white transition-all duration-300 hover:scale-110">
                <FaLinkedin size={18} />
              </a>
              <a href="https://youtube.com/@rentalhubng" target="_blank" rel="noopener noreferrer" aria-label="YouTube" className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center text-[#FF0000] hover:bg-[#FF0000] hover:text-white transition-all duration-300 hover:scale-110">
                <FaYoutube size={18} />
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
              {surveyLinkVisible && <li><FooterLink to="/survey" label={t('footer.survey', 'Survey')} /></li>}
              {careerLinkVisible && <li><FooterLink to="/careers" label="Career" /></li>}
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
                  <span dir="ltr" className="inline-block">support@rentalhub.com.ng</span>
                </FooterContact>
              </li>
              <li>
                <FooterContact
                  href="tel:+234 8030601238"
                  enabled={mobileContactLinksEnabled}
                >
                  <FaPhoneAlt className="text-primary-400 mt-1 shrink-0" />
                  <span dir="ltr" className="inline-block">+234 8030601238</span>
                </FooterContact>
              </li>
              <li>
                <FooterContact
                  href="tel:+234 9052187099"
                  enabled={mobileContactLinksEnabled}
                >
                  <FaPhoneAlt className="text-primary-400 mt-1 shrink-0" />
                  <span dir="ltr" className="inline-block">+234 9052187099</span>
                </FooterContact>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-800 mt-12 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-gray-400">&copy; 2024 RentalHub NG. {t('footer.rights')}</p>
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm md:justify-end">
            <Link
              to="/privacy"
              onClick={() => handleFooterNavigation('/privacy')}
              className="text-gray-400 hover:text-white transition-colors duration-200"
            >
              {t('footer.privacy')}
            </Link>
            <Link
              to="/terms"
              onClick={() => handleFooterNavigation('/terms')}
              className="text-gray-400 hover:text-white transition-colors duration-200"
            >
              {t('footer.terms')}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
};

const handleFooterNavigation = (to) => {
  if (typeof window === 'undefined') return;

  window.setTimeout(() => {
    const hash = typeof to === 'string' && to.includes('#')
      ? to.slice(to.indexOf('#') + 1)
      : '';

    if (hash) {
      const target = document.getElementById(decodeURIComponent(hash));
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
    }

    window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
  }, 0);
};

const FooterLink = ({ to, label }) => (
  <Link
    to={to}
    onClick={() => handleFooterNavigation(to)}
    className="text-gray-400 hover:text-white transition-all duration-200 flex items-center gap-1 group"
  >
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
