import React from 'react';
import { Link } from 'react-router-dom';
import { FaFacebook, FaTwitter, FaInstagram, FaLinkedin } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';

const Footer = () => {
  const { t } = useTranslation();

  return (
    <footer className="bg-gray-900 text-white">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* About */}
          <div>
            <h3 className="text-lg font-bold mb-4">RentalHub NG</h3>
            <p className="text-sm text-gray-400">
              {t('footer.about')}
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-lg font-bold mb-4">
              {t('footer.quick_links')}
            </h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link to="/properties" className="text-gray-400 hover:text-white">
                  {t('footer.browse')}
                </Link>
              </li>
              <li>
                <Link to="/about" className="text-gray-400 hover:text-white">
                  {t('footer.about_us')}
                </Link>
              </li>
              <li>
                <Link to="/how-it-works" className="text-gray-400 hover:text-white">
                  {t('footer.how')}
                </Link>
              </li>
              <li>
                <Link to="/faq" className="text-gray-400 hover:text-white">
                  {t('footer.faq')}
                </Link>
              </li>
            </ul>
          </div>

          {/* For Landlords */}
          <div>
            <h3 className="text-lg font-bold mb-4">
              {t('footer.landlords')}
            </h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link to="/list-property" className="text-gray-400 hover:text-white">
                  {t('footer.list')}
                </Link>
              </li>
              <li>
                <Link to="/pricing" className="text-gray-400 hover:text-white">
                  {t('footer.pricing')}
                </Link>
              </li>
              <li>
                <Link to="/landlord-guide" className="text-gray-400 hover:text-white">
                  {t('footer.guide')}
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="text-lg font-bold mb-4">
              {t('footer.contact')}
            </h3>
            <ul className="space-y-2 text-sm text-gray-400">
              <li>{t('footer.email')}: support@rentalhub.ng</li>
              <li>{t('footer.phone')}: +234 706 701 2884</li>
              <li className="flex space-x-4 mt-4">
                <a href="#" className="hover:text-white">
                  <FaFacebook className="text-xl" />
                </a>
                <a href="#" className="hover:text-white">
                  <FaTwitter className="text-xl" />
                </a>
                <a href="#" className="hover:text-white">
                  <FaInstagram className="text-xl" />
                </a>
                <a href="#" className="hover:text-white">
                  <FaLinkedin className="text-xl" />
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-800 mt-8 pt-8 text-center text-sm text-gray-400">
          <p>&copy; 2024 RentalHub NG. {t('footer.rights')}</p>
          <div className="mt-2 space-x-4">
            <Link to="/privacy" className="hover:text-white">
              {t('footer.privacy')}
            </Link>
            <Link to="/terms" className="hover:text-white">
              {t('footer.terms')}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
