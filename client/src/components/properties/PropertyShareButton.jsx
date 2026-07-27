import React, { useMemo } from 'react';
import { FaShareAlt } from 'react-icons/fa';
import ShareMenu from '../common/ShareMenu';

const PropertyShareButton = ({ property, detailLink, className = '' }) => {
  const shareUrl = useMemo(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}${detailLink}`;
  }, [detailLink]);

  const locationLabel = [property?.area, property?.city, property?.state_name]
    .filter(Boolean)
    .join(', ');
  const shareTitle = locationLabel
    ? `${property?.title} in ${locationLabel}`
    : property?.title || 'Property listing';
  const shareText = `Check out this property on RentalHub NG: ${shareTitle}`;

  return (
    <ShareMenu
      url={shareUrl}
      title={shareTitle}
      text={shareText}
      headerLabel="Share Listing"
      buttonIcon={<FaShareAlt className="text-gray-600" />}
      buttonLabel=""
      buttonClassName="bg-white p-2 rounded-full shadow-md hover:bg-gray-100 transition-colors inline-flex items-center justify-center"
      className={className}
      copySuccessMessage="Property link copied"
      copyErrorMessage="Unable to copy property link right now"
      shareErrorMessage="Unable to open the share sheet right now"
    />
  );
};

export default PropertyShareButton;
