import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { propertyService } from '../services/propertyService';
import { applicationService } from '../services/applicationService';
import { paymentService } from '../services/paymentService';
import { useAuth } from '../hooks/useAuth';
import { useSocket } from '../hooks/useSocket';
import { toast } from 'react-toastify';
import Loader from '../components/common/Loader';
import Modal from '../components/common/Modal';
import DisputeCreationModal from '../components/DisputeCreationModal';
import { DamageReportCard } from '../components/damage';
import OnlineStatusBadge from '../components/calls/OnlineStatusBadge';
import {
  FaBed,
  FaBath,
  FaMapMarkerAlt,
  FaHeart,
  FaRegHeart,
  FaStar,
  FaPhone,
  FaEnvelope,
  FaCheckCircle,
  FaVideo,
} from 'react-icons/fa';
import { formatCurrency, formatDate } from '../utils/helpers';
import { useTranslation } from 'react-i18next';

const PropertyDetail = () => {
  const POST_VERIFY_REDIRECT_KEY = 'pending_unlock_redirect';
  const PENDING_APPLICATION_KEY = 'pending_property_application';
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user, isAuthenticated } = useAuth();
  const { connected: realtimeConnected, startCall } = useSocket();
  const [property, setProperty] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isSaved, setIsSaved] = useState(false);
  const [showApplicationModal, setShowApplicationModal] = useState(false);
  const [applicationData, setApplicationData] = useState({
    message: '',
    move_in_date: '',
    proposed_rent: '',
  });
  const [submittingApplication, setSubmittingApplication] = useState(false);
  const [hasFullAccess, setHasFullAccess] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const autoUnlockAttemptedRef = useRef(false);
  const [showDisputeModal, setShowDisputeModal] = useState(false);

  const loadProperty = useCallback(async () => {
    setLoading(true);
    try {
      let response = null;
      const isTenant = isAuthenticated && user?.user_type === 'tenant';

      if (isTenant) {
        try {
          response = await propertyService.getFullPropertyDetails(id);
          setHasFullAccess(true);
        } catch (error) {
          if (error.response?.status === 402 || error.response?.status === 403) {
            response = await propertyService.getPropertyById(id);
            setHasFullAccess(false);
          } else {
            throw error;
          }
        }
      } else {
        response = await propertyService.getPropertyById(id);
        setHasFullAccess(false);
      }

      if (response.success) {
        setProperty(response.data);
      }
    } catch (error) {
      toast.error(t('property_detail.load_failed'));
      console.error('Error loading property:', error);
    } finally {
      setLoading(false);
    }
  }, [id, isAuthenticated, t, user?.user_type]);

  useEffect(() => {
    loadProperty();
  }, [loadProperty]);

  useEffect(() => {
    if (
      searchParams.get('apply') === '1' &&
      isAuthenticated &&
      user?.user_type === 'tenant'
    ) {
      localStorage.setItem(PENDING_APPLICATION_KEY, String(id));
    }
  }, [id, isAuthenticated, searchParams, user?.user_type]);

  useEffect(() => {
    const verifyUnlock = async () => {
      const reference = searchParams.get('unlock_ref') || searchParams.get('reference');
      if (!reference || !isAuthenticated || user?.user_type !== 'tenant') return;

      try {
        const result = await paymentService.verifyPropertyUnlock(reference);
        if (result.success) {
          toast.success(t('property_detail.unlock_success'));
          setHasFullAccess(true);
          localStorage.removeItem(POST_VERIFY_REDIRECT_KEY);
          setSearchParams({}, { replace: true });
          loadProperty();
        }
      } catch (error) {
        console.error('Property unlock verification failed:', error);
      }
    };

    verifyUnlock();
  }, [searchParams, setSearchParams, isAuthenticated, t, user?.user_type, loadProperty]);

  useEffect(() => {
    const shouldOpenApplication =
      isAuthenticated &&
      user?.user_type === 'tenant' &&
      hasFullAccess &&
      localStorage.getItem(PENDING_APPLICATION_KEY) === String(id);

    if (!shouldOpenApplication) {
      return;
    }

    localStorage.removeItem(PENDING_APPLICATION_KEY);

    if (searchParams.get('apply') === '1') {
      const updatedParams = new URLSearchParams(searchParams);
      updatedParams.delete('apply');
      setSearchParams(updatedParams, { replace: true });
    }

    setShowApplicationModal(true);
  }, [
    hasFullAccess,
    id,
    isAuthenticated,
    searchParams,
    setSearchParams,
    user?.user_type,
  ]);

  const handleSave = async () => {
    if (!isAuthenticated) {
      toast.error(t('property_detail.login_save'));
      navigate('/login');
      return;
    }

    try {
      if (isSaved) {
        await propertyService.unsaveProperty(id);
        setIsSaved(false);
        toast.success(t('properties.removed_favorite'));
      } else {
        await propertyService.saveProperty(id);
        setIsSaved(true);
        toast.success(t('properties.saved_favorite'));
      }
    } catch (error) {
      toast.error(t('properties.save_failed'));
    }
  };

  const handleApply = () => {
    if (!isAuthenticated) {
      toast.error(t('property_detail.login_apply'));
      navigate('/login');
      return;
    }

    if (user?.user_type !== 'tenant') {
      toast.error('Only tenants can apply for properties');
      return;
    }

    if (!user?.identity_verified) {
      toast.error('Please complete identity verification first');
      navigate('/profile');
      return;
    }

    if (!hasFullAccess) {
      toast.error('Please unlock this property details first');
      return;
    }

    setShowApplicationModal(true);
  };

  const handleCallLandlord = async (callType = 'audio') => {
    if (!isAuthenticated) {
      toast.error('Please login to call the landlord');
      navigate('/login');
      return;
    }

    if (user?.user_type !== 'tenant') {
      toast.error('Only tenants can request property calls');
      return;
    }

    if (!hasFullAccess) {
      toast.error('Unlock this property before calling the landlord');
      return;
    }

    if (!property?.landlord_id) {
      toast.error('Landlord account is unavailable for calls');
      return;
    }

    await startCall({
      receiverId: property.landlord_id,
      callType,
      propertyId: property.id,
      propertyTitle: property.title,
    });
  };

  const handleUnlockPayment = useCallback(async () => {
    if (!isAuthenticated) {
      toast.error(t('property_detail.login_unlock'));
      navigate('/login');
      return;
    }

    if (user?.user_type !== 'tenant') {
      toast.error(t('property_detail.only_tenants_unlock'));
      return;
    }

    if (!user?.identity_verified) {
      toast.error(t('property_detail.verify_first'));
      const redirectPath = `/properties/${id}?autounlock=1`;
      localStorage.setItem(POST_VERIFY_REDIRECT_KEY, redirectPath);
      navigate(`/profile?next=${encodeURIComponent(redirectPath)}`);
      return;
    }

    const updatedParams = new URLSearchParams(searchParams);
    if (updatedParams.has('autounlock')) {
      updatedParams.delete('autounlock');
      setSearchParams(updatedParams, { replace: true });
    }

    setUnlocking(true);
    try {
      const result = await paymentService.initializePropertyUnlock(Number(id), 'paystack');
      if (!result.success) {
        toast.error(result.message || t('property_detail.unlock_start_failed'));
        return;
      }

      if (result.data?.already_unlocked) {
        setHasFullAccess(true);
        localStorage.removeItem(POST_VERIFY_REDIRECT_KEY);
        loadProperty();
        return;
      }

      if (result.data?.authorization_url) {
        localStorage.removeItem(POST_VERIFY_REDIRECT_KEY);
        window.location.href = `${result.data.authorization_url}`;
        return;
      }

      toast.info(result.message || t('property_detail.complete_payment'));
    } catch (error) {
      toast.error(error.response?.data?.message || t('property_detail.unlock_start_failed'));
    } finally {
      setUnlocking(false);
    }
  }, [id, isAuthenticated, navigate, t, user?.identity_verified, user?.user_type, loadProperty, searchParams, setSearchParams]);

  useEffect(() => {
    const shouldAutoUnlock =
      searchParams.get('autounlock') === '1' &&
      isAuthenticated &&
      user?.user_type === 'tenant' &&
      user?.identity_verified &&
      !hasFullAccess &&
      !autoUnlockAttemptedRef.current;

    if (!shouldAutoUnlock) return;

    autoUnlockAttemptedRef.current = true;
    handleUnlockPayment();
  }, [
    searchParams,
    isAuthenticated,
    user?.user_type,
    user?.identity_verified,
    hasFullAccess,
    handleUnlockPayment,
  ]);

  const submitApplication = async () => {
    setSubmittingApplication(true);
    try {
      const response = await applicationService.submitApplication({
        property_id: parseInt(id),
        proposed_rent: applicationData.proposed_rent || undefined,
        ...applicationData,
      });

      if (response.success) {
        toast.success('Application submitted successfully!');
        setShowApplicationModal(false);
        navigate('/applications');
      }
    } catch (error) {
      toast.error(error.response?.data?.message || t('property_detail.submit_failed'));
    } finally {
      setSubmittingApplication(false);
    }
  };

  if (loading) {
    return <Loader />;
  }

  if (!property) {
    return (
      <div className="container mx-auto px-4 py-12 text-center">
        <h1 className="text-2xl font-bold text-gray-900">{t('property_detail.not_found')}</h1>
      </div>
    );
  }

  const landlordWhatsappLink = property?.landlord_phone
    ? `https://wa.me/${String(property.landlord_phone).replace(/[^\d]/g, '')}`
    : null;
  const propertyLocation = [property?.area, property?.city, property?.state_name]
    .filter(Boolean)
    .join(', ');
  const propertySeoTitle = propertyLocation
    ? `${property.title} in ${propertyLocation} | ${formatCurrency(
        property.rent_amount || property.price || 0
      )}`
    : property.title;
  const propertySeoDescription = propertyLocation
    ? `Browse verified details for ${property.title} in ${propertyLocation}. See rent, property features, photos, and landlord contact options on RentalHub.`
    : `Browse verified details for ${property.title} on RentalHub.`;
  const propertyCanonical = `${window.location.origin}/properties/${property.id}`;
  const propertyShareImageRaw =
    property.photos?.[0] ||
    property.primary_photo ||
    '/placeholder-property.jpg';
  const propertyShareImage =
    propertyShareImageRaw && /^https?:\/\//i.test(propertyShareImageRaw)
      ? propertyShareImageRaw
      : `${window.location.origin}${propertyShareImageRaw}`;
  const propertySchema = {
    '@context': 'https://schema.org',
    '@type': 'Residence',
    name: property.title,
    description: property.description,
    address: {
      '@type': 'PostalAddress',
      addressLocality: property.city || property.area || property.state_name,
      addressRegion: property.state_name,
      addressCountry: 'NG',
    },
    offers: {
      '@type': 'Offer',
      priceCurrency: 'NGN',
      price: Number(property.rent_amount || property.price || 0),
      availability: property.is_available ? 'https://schema.org/InStock' : 'https://schema.org/SoldOut',
      url: propertyCanonical,
    },
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <Helmet>
        <title>{propertySeoTitle}</title>
        <meta name="description" content={propertySeoDescription} />
        <link rel="canonical" href={propertyCanonical} />
        <meta property="og:title" content={propertySeoTitle} />
        <meta property="og:description" content={propertySeoDescription} />
        <meta property="og:url" content={propertyCanonical} />
        <meta property="og:type" content="article" />
        <meta property="og:image" content={propertyShareImage} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={propertySeoTitle} />
        <meta name="twitter:description" content={propertySeoDescription} />
        <meta name="twitter:image" content={propertyShareImage} />
        <script type="application/ld+json">{JSON.stringify(propertySchema)}</script>
      </Helmet>

      {/* Image Gallery */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        {property.photos && property.photos.length > 0 ? (
          <>
            <div className="md:col-span-2 h-96">
              <img
                src={property.photos[0]}
                alt={property.title}
                className="w-full h-full object-cover rounded-lg"
              />
            </div>
            {property.photos.slice(1, 5).map((photo, index) => (
              <div key={index} className="h-48">
                <img
                  src={photo}
                  alt={property.title}
                  className="w-full h-full object-cover rounded-lg"
                />
              </div>
            ))}
          </>
        ) : (
          <div className="md:col-span-2 h-96 bg-gray-200 rounded-lg flex items-center justify-center">
            <p className="text-gray-500">{t('property_detail.no_photos')}</p>
          </div>
        )}
      </div>

      {!hasFullAccess && (
        <div className="card mb-6 border border-yellow-200 bg-yellow-50">
          <h3 className="text-lg font-semibold mb-2">{t('property_detail.unlock_title')}</h3>
          <p className="text-sm text-gray-700 mb-3">
            {t('property_detail.unlock_text')}
          </p>
          <button
            onClick={handleUnlockPayment}
            disabled={unlocking}
            className="btn btn-primary"
          >
            {unlocking ? t('common.processing') : isAuthenticated ? t('property_detail.pay_unlock_details') : t('property_detail.login_continue')}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-2">
          <div className="card mb-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 mb-2">
                  {property.title}
                </h1>
                <div className="flex items-center text-gray-600">
                  <FaMapMarkerAlt className="mr-2" />
                  <span>
                    {property.area}, {property.city}, {property.state_name}
                  </span>
                </div>
              </div>
              <button
                onClick={handleSave}
                className="p-3 rounded-full hover:bg-gray-100 transition-colors"
              >
                {isSaved ? (
                  <FaHeart className="text-red-500 text-2xl" />
                ) : (
                  <FaRegHeart className="text-gray-600 text-2xl" />
                )}
              </button>
            </div>

            {/* Price */}
            <div className="mb-6">
              <div className="text-4xl font-bold text-primary-600">
                {formatCurrency(property.rent_amount)}
              </div>
              <div className="text-gray-600">
                {t('property_detail.per_period', {
                  period:
                    property.payment_frequency === 'yearly'
                      ? t('property_detail.year')
                      : t('property_detail.month'),
                })}
              </div>
            </div>

            {/* Features */}
            <div className="mb-6 grid grid-cols-1 gap-4 border-b pb-6 sm:grid-cols-3">
              <div className="text-center">
                <FaBed className="text-2xl text-gray-600 mx-auto mb-2" />
                <div className="font-semibold">{property.bedrooms}</div>
                <div className="text-sm text-gray-600">{t('property_detail.bedrooms')}</div>
              </div>
              <div className="text-center">
                <FaBath className="text-2xl text-gray-600 mx-auto mb-2" />
                <div className="font-semibold">{property.bathrooms}</div>
                <div className="text-sm text-gray-600">{t('property_detail.bathrooms')}</div>
              </div>
              <div className="text-center">
                <FaStar className="text-2xl text-yellow-500 mx-auto mb-2" />
                <div className="font-semibold">
                  {property.avg_rating ? parseFloat(property.avg_rating).toFixed(1) : 'N/A'}
                </div>
                <div className="text-sm text-gray-600">{t('property_detail.rating')}</div>
              </div>
            </div>

            {/* Description */}
            {hasFullAccess ? (
              <div className="mb-6">
                <h2 className="text-xl font-semibold mb-3">{t('property_detail.description')}</h2>
                <p className="text-gray-700 whitespace-pre-line">{property.description}</p>
              </div>
            ) : (
              <div className="mb-6">
                <h2 className="text-xl font-semibold mb-3">{t('property_detail.description')}</h2>
                <p className="text-gray-500">
                  {t('property_detail.subscribe_description')}
                </p>
              </div>
            )}

            {/* Amenities */}
            {hasFullAccess && property.amenities && property.amenities.length > 0 && (
              <div className="mb-6">
                <h2 className="text-xl font-semibold mb-3">{t('property_detail.amenities')}</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {property.amenities.map((amenity, index) => (
                    <div key={index} className="flex items-center">
                      <FaCheckCircle className="text-green-500 mr-2" />
                      <span>{amenity}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Property Video - unlocked details only */}
            {hasFullAccess && property.video_url && (
              <div className="mb-6">
                <h2 className="text-xl font-semibold mb-3">{t('property_detail.video_tour')}</h2>
                <video
                  controls
                  className="w-full rounded-lg"
                  src={property.video_url}
                />
              </div>
            )}

            {/* Full Address - unlocked details only */}
            {hasFullAccess && property.full_address && (
              <div className="mb-6">
                <h2 className="text-xl font-semibold mb-3">{t('property_detail.full_address')}</h2>
                <p className="text-gray-700">{property.full_address}</p>
              </div>
            )}

            {/* Property Condition Report - show latest published report to tenants */}
            {hasFullAccess && (
              <div className="mb-6">
                <DamageReportCard propertyId={property.id} />
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-1">
          {/* Contact Card */}
          {hasFullAccess && property.landlord_name ? (
            <div className="card mb-6">
              <h3 className="text-lg font-semibold mb-4">{t('property_detail.contact_landlord')}</h3>
              <div className="space-y-3">
                <div>
                  <div className="text-sm text-gray-600">{t('property_detail.name')}</div>
                  <div className="font-semibold flex items-center">
                    {property.landlord_name}
                    {property.landlord_verified && (
                      <FaCheckCircle className="text-green-500 ml-2" />
                    )}
                  </div>
                  <div className="mt-2">
                    <OnlineStatusBadge userId={property.landlord_id} />
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">{t('property_detail.phone')}</div>
                  <a
                    href={`tel:${property.landlord_phone}`}
                    className="font-semibold text-primary-600 hover:text-primary-700 flex items-center"
                  >
                    <FaPhone className="mr-2" />
                    {property.landlord_phone}
                  </a>
                </div>
                {landlordWhatsappLink && (
                  <div>
                    <div className="text-sm text-gray-600">{t('property_detail.whatsapp')}</div>
                    <a
                      href={landlordWhatsappLink}
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold text-green-600 hover:text-green-700"
                    >
                      {t('property_detail.chat_whatsapp')}
                    </a>
                  </div>
                )}
                <div>
                  <div className="text-sm text-gray-600">{t('property_detail.email')}</div>
                  <a
                    href={`mailto:${property.landlord_email}`}
                    className="font-semibold text-primary-600 hover:text-primary-700 flex items-center"
                  >
                    <FaEnvelope className="mr-2" />
                    {property.landlord_email}
                  </a>
                </div>
                {isAuthenticated && user?.user_type === 'tenant' && (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => handleCallLandlord('audio')}
                      disabled={!realtimeConnected}
                      className="btn btn-primary w-full"
                    >
                      <FaPhone className="mr-2" />
                      {realtimeConnected ? t('property_detail.audio_call') : t('common.connecting')}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCallLandlord('video')}
                      disabled={!realtimeConnected}
                      className="btn btn-primary w-full"
                    >
                      <FaVideo className="mr-2" />
                      {realtimeConnected ? t('property_detail.video_call') : t('common.connecting')}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCallLandlord('virtual_tour')}
                      disabled={!realtimeConnected}
                      className="btn btn-primary w-full sm:col-span-2"
                    >
                      <FaVideo className="mr-2" />
                      {realtimeConnected ? t('property_detail.start_virtual_tour') : t('common.connecting')}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="card mb-6 bg-yellow-50 border border-yellow-200">
              <h3 className="text-lg font-semibold mb-2">{t('property_detail.subscribe_contact_title')}</h3>
              <p className="text-sm text-gray-700 mb-4">
                {t('property_detail.subscribe_contact_text')}
              </p>
              <button
                onClick={handleUnlockPayment}
                disabled={unlocking}
                className="btn btn-primary w-full"
              >
                {unlocking ? t('common.processing') : t('property_detail.pay_to_unlock')}
              </button>
            </div>
          )}

          {/* Apply Button */}
          {isAuthenticated && user?.user_type === 'tenant' && (
            <button
              onClick={handleApply}
              className="btn btn-primary w-full mb-6 py-3 text-lg"
            >
              {t('property_detail.apply_property')}
            </button>
          )}

          {/* Add this button where other action buttons are */}
          <button
            onClick={() => setShowDisputeModal(true)}
            className="btn btn-warning flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            {t('property_detail.report_dispute')}
          </button>

          {/* Property Info */}
          <div className="card">
            <h3 className="text-lg font-semibold mb-4">{t('property_detail.property_information')}</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">{t('property_detail.property_type')}</span>
                <span className="font-semibold capitalize">{property.property_type}</span>
              </div>
              {property.caution_deposit && (
                <div className="flex justify-between">
                  <span className="text-gray-600">{t('property_detail.caution_deposit')}</span>
                  <span className="font-semibold">
                    {formatCurrency(property.caution_deposit)}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-600">{t('property_detail.listed_on')}</span>
                <span className="font-semibold">{formatDate(property.created_at)}</span>
              </div>
              {property.review_count > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">{t('property_detail.reviews')}</span>
                  <span className="font-semibold">{t('property_detail.review_count', { count: property.review_count })}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Application Modal */}
      <Modal
        isOpen={showApplicationModal}
        onClose={() => setShowApplicationModal(false)}
        title={t('property_detail.apply_modal_title')}
        size="medium"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('property_detail.message_landlord')}
            </label>
            <textarea
              value={applicationData.message}
              onChange={(e) =>
                setApplicationData({ ...applicationData, message: e.target.value })
              }
              rows="4"
              className="input"
              placeholder={t('property_detail.message_placeholder')}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('property_detail.proposed_rent')}
            </label>
            <input
              type="number"
              min="1"
              value={applicationData.proposed_rent}
              onChange={(e) =>
                setApplicationData({ ...applicationData, proposed_rent: e.target.value })
              }
              className="input"
              placeholder={t('property_detail.proposed_rent_placeholder', {
                amount: formatCurrency(property.rent_amount),
              })}
            />
            <p className="mt-1 text-xs text-gray-500">
              {t('property_detail.proposed_rent_hint')}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('property_detail.move_in_date')}
            </label>
            <input
              type="date"
              value={applicationData.move_in_date}
              onChange={(e) =>
                setApplicationData({ ...applicationData, move_in_date: e.target.value })
              }
              className="input"
              min={new Date().toISOString().split('T')[0]}
            />
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800">
              <strong>{t('common.note')}:</strong> {t('property_detail.application_note')}
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              onClick={submitApplication}
              disabled={submittingApplication}
              className="btn btn-primary w-full sm:flex-1"
            >
              {submittingApplication ? t('common.submitting') : t('property_detail.submit_application')}
            </button>
            <button
              onClick={() => setShowApplicationModal(false)}
              className="btn btn-secondary w-full sm:w-auto"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      </Modal>
      {/* Dispute Creation Modal */}
<DisputeCreationModal
  isOpen={showDisputeModal}
  onClose={() => setShowDisputeModal(false)}
  propertyId={id}
  propertyTitle={property?.title}
  currentUserId={user?.id}
/>
    </div>
  );
};

export default PropertyDetail;
