import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { propertyService } from '../services/propertyService';
import { applicationService } from '../services/applicationService';
import { useAuth } from '../hooks/useAuth';
import { toast } from 'react-toastify';
import Loader from '../components/common/Loader';
import Modal from '../components/common/Modal';
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
} from 'react-icons/fa';
import { formatCurrency, formatDate } from '../utils/helpers';

const PropertyDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const [property, setProperty] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isSaved, setIsSaved] = useState(false);
  const [showApplicationModal, setShowApplicationModal] = useState(false);
  const [applicationData, setApplicationData] = useState({
    message: '',
    move_in_date: '',
  });
  const [submittingApplication, setSubmittingApplication] = useState(false);
  const [hasSubscription, setHasSubscription] = useState(false);

  useEffect(() => {
    loadProperty();
  }, [id]);

  const loadProperty = async () => {
    setLoading(true);
    try {
      // Try to get full details if user has subscription
      let response;
      if (isAuthenticated && user?.user_type === 'tenant' && user?.subscription_active) {
        response = await propertyService.getFullPropertyDetails(id);
        setHasSubscription(true);
      } else {
        response = await propertyService.getPropertyById(id);
        setHasSubscription(false);
      }

      if (response.success) {
        setProperty(response.data);
      }
    } catch (error) {
      toast.error('Failed to load property details');
      console.error('Error loading property:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!isAuthenticated) {
      toast.error('Please login to save properties');
      navigate('/login');
      return;
    }

    try {
      if (isSaved) {
        await propertyService.unsaveProperty(id);
        setIsSaved(false);
        toast.success('Property removed from favorites');
      } else {
        await propertyService.saveProperty(id);
        setIsSaved(true);
        toast.success('Property saved to favorites');
      }
    } catch (error) {
      toast.error('Failed to save property');
    }
  };

  const handleApply = () => {
    if (!isAuthenticated) {
      toast.error('Please login to apply');
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

    setShowApplicationModal(true);
  };

  const submitApplication = async () => {
    setSubmittingApplication(true);
    try {
      const response = await applicationService.submitApplication({
        property_id: parseInt(id),
        ...applicationData,
      });

      if (response.success) {
        toast.success('Application submitted successfully!');
        setShowApplicationModal(false);
        navigate('/applications');
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to submit application');
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
        <h1 className="text-2xl font-bold text-gray-900">Property not found</h1>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
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
            <p className="text-gray-500">No photos available</p>
          </div>
        )}
      </div>

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
                per {property.payment_frequency === 'yearly' ? 'year' : 'month'}
              </div>
            </div>

            {/* Features */}
            <div className="grid grid-cols-3 gap-4 mb-6 pb-6 border-b">
              <div className="text-center">
                <FaBed className="text-2xl text-gray-600 mx-auto mb-2" />
                <div className="font-semibold">{property.bedrooms}</div>
                <div className="text-sm text-gray-600">Bedrooms</div>
              </div>
              <div className="text-center">
                <FaBath className="text-2xl text-gray-600 mx-auto mb-2" />
                <div className="font-semibold">{property.bathrooms}</div>
                <div className="text-sm text-gray-600">Bathrooms</div>
              </div>
              <div className="text-center">
                <FaStar className="text-2xl text-yellow-500 mx-auto mb-2" />
                <div className="font-semibold">
                  {property.avg_rating ? parseFloat(property.avg_rating).toFixed(1) : 'N/A'}
                </div>
                <div className="text-sm text-gray-600">Rating</div>
              </div>
            </div>

            {/* Description */}
            <div className="mb-6">
              <h2 className="text-xl font-semibold mb-3">Description</h2>
              <p className="text-gray-700 whitespace-pre-line">{property.description}</p>
            </div>

            {/* Amenities */}
            {property.amenities && property.amenities.length > 0 && (
              <div className="mb-6">
                <h2 className="text-xl font-semibold mb-3">Amenities</h2>
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

            {/* Full Address - Only for subscribers */}
            {hasSubscription && property.full_address && (
              <div className="mb-6">
                <h2 className="text-xl font-semibold mb-3">Full Address</h2>
                <p className="text-gray-700">{property.full_address}</p>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-1">
          {/* Contact Card */}
          {hasSubscription && property.landlord_name ? (
            <div className="card mb-6">
              <h3 className="text-lg font-semibold mb-4">Contact Landlord</h3>
              <div className="space-y-3">
                <div>
                  <div className="text-sm text-gray-600">Name</div>
                  <div className="font-semibold flex items-center">
                    {property.landlord_name}
                    {property.landlord_verified && (
                      <FaCheckCircle className="text-green-500 ml-2" />
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Phone</div>
                  <a
                    href={`tel:${property.landlord_phone}`}
                    className="font-semibold text-primary-600 hover:text-primary-700 flex items-center"
                  >
                    <FaPhone className="mr-2" />
                    {property.landlord_phone}
                  </a>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Email</div>
                  <a
                    href={`mailto:${property.landlord_email}`}
                    className="font-semibold text-primary-600 hover:text-primary-700 flex items-center"
                  >
                    <FaEnvelope className="mr-2" />
                    {property.landlord_email}
                  </a>
                </div>
              </div>
            </div>
          ) : (
            <div className="card mb-6 bg-yellow-50 border border-yellow-200">
              <h3 className="text-lg font-semibold mb-2">Subscribe to View Contact</h3>
              <p className="text-sm text-gray-700 mb-4">
                Subscribe to access landlord contact information and full property details
              </p>
              <button
                onClick={() => navigate('/subscribe')}
                className="btn btn-primary w-full"
              >
                Subscribe Now
              </button>
            </div>
          )}

          {/* Apply Button */}
          {isAuthenticated && user?.user_type === 'tenant' && (
            <button
              onClick={handleApply}
              className="btn btn-primary w-full mb-6 py-3 text-lg"
            >
              Apply for This Property
            </button>
          )}

          {/* Property Info */}
          <div className="card">
            <h3 className="text-lg font-semibold mb-4">Property Information</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Property Type</span>
                <span className="font-semibold capitalize">{property.property_type}</span>
              </div>
              {property.caution_deposit && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Caution Deposit</span>
                  <span className="font-semibold">
                    {formatCurrency(property.caution_deposit)}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-600">Listed On</span>
                <span className="font-semibold">{formatDate(property.created_at)}</span>
              </div>
              {property.review_count > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Reviews</span>
                  <span className="font-semibold">{property.review_count} reviews</span>
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
        title="Apply for Property"
        size="medium"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Message to Landlord (Optional)
            </label>
            <textarea
              value={applicationData.message}
              onChange={(e) =>
                setApplicationData({ ...applicationData, message: e.target.value })
              }
              rows="4"
              className="input"
              placeholder="Introduce yourself and explain why you're interested in this property..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Preferred Move-in Date (Optional)
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
              <strong>Note:</strong> Your verified NIN and contact information will be shared
              with the landlord upon application submission.
            </p>
          </div>

          <div className="flex space-x-3">
            <button
              onClick={submitApplication}
              disabled={submittingApplication}
              className="btn btn-primary flex-1"
            >
              {submittingApplication ? 'Submitting...' : 'Submit Application'}
            </button>
            <button
              onClick={() => setShowApplicationModal(false)}
              className="btn btn-secondary"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default PropertyDetail;