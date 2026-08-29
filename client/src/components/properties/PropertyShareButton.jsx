import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FaShareAlt } from 'react-icons/fa';
import ShareMenu from '../common/ShareMenu';

const PropertyShareButton = ({ property, detailLink, className = '' }) => {
  const { t } = useTranslation();

  const shareUrl = useMemo(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}${detailLink}`;
  }, [detailLink]);

  const locationLabel = [property?.area, property?.city, property?.state_name]
    .filter(Boolean)
    .join(', ');
  const shareTitle = locationLabel
    ? `${property?.title} in ${locationLabel}`
    : property?.title || t('property_share.fallback_title', 'Property listing');
  const shareText = t('property_share.text', 'Check out this property on RentalHub NG: {{title}}', { title: shareTitle });

  return (
    <ShareMenu
      url={shareUrl}
      title={shareTitle}
      text={shareText}
      headerLabel={t('property_share.header', 'Share Listing')}
      buttonIcon={<FaShareAlt className="text-gray-600" />}
      buttonLabel=""
      buttonClassName="bg-white p-2 rounded-full shadow-md hover:bg-gray-100 transition-colors inline-flex items-center justify-center"
      className={className}
      copySuccessMessage={t('property_share.copy_success', 'Property link copied')}
      copyErrorMessage={t('property_share.copy_error', 'Unable to copy property link right now')}
      shareErrorMessage={t('property_share.share_error', 'Unable to open the share sheet right now')}
    />
  );
};

export default PropertyShareButton;
