import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import api from '../services/api';

const DisputeCreationModal = ({ isOpen, onClose, propertyId, propertyTitle, currentUserId }) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState([]);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    against_user: '',
    priority: 'normal'
  });

  const loadUsers = useCallback(async () => {
    try {
      const res = await api.get(`/properties/${propertyId}/users`);
      setUsers(res.data.data || []);
    } catch (err) {
      console.error('Failed to load users:', err);
    }
  }, [propertyId]);

  // Load potential users to dispute against
  useEffect(() => {
    if (isOpen && propertyId) {
      loadUsers();
    }
  }, [isOpen, propertyId, loadUsers]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.title.trim()) {
      toast.error(t('dispute_creation.title_required', 'Dispute title is required'));
      return;
    }
    
    if (!formData.description.trim()) {
      toast.error(t('dispute_creation.description_required', 'Dispute description is required'));
      return;
    }
    
    if (!formData.against_user) {
      toast.error(t('dispute_creation.party_required', 'Please select who you are disputing against'));
      return;
    }

    setLoading(true);
    try {
      const res = await api.post('/disputes', {
        property_id: propertyId,
        against_user: formData.against_user,
        title: formData.title,
        description: formData.description,
        priority: formData.priority
      });

      if (res.data.success) {
        toast.success(t('dispute_creation.created', 'Dispute created successfully!'));
        onClose();
        // Reset form
        setFormData({
          title: '',
          description: '',
          against_user: '',
          priority: 'normal'
        });
        
        // Refresh page or navigate to dispute
        window.location.href = `/dispute/${res.data.data.id}`;
      }
    } catch (err) {
      toast.error(err.response?.data?.message || t('dispute_creation.create_failed', 'Failed to create dispute'));
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-md w-full p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-900">{t('dispute_creation.title', 'Create New Dispute')}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded">
          <p className="text-sm text-blue-800">
            <strong>{t('dispute_creation.property', 'Property:')}</strong> {propertyTitle}
          </p>
          <p className="text-xs text-blue-700 mt-1">
            {t('dispute_creation.visibility_note', 'This dispute will be visible to authorized lawyers and the other party.')}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('dispute_creation.title_label', 'Dispute Title *')}
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({...formData, title: e.target.value})}
              placeholder={t('dispute_creation.title_placeholder', 'e.g., Rent Payment Dispute')}
              className="input w-full"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('dispute_creation.description_label', 'Description *')}
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              placeholder={t('dispute_creation.description_placeholder', 'Describe the issue in detail...')}
              rows="4"
              className="input w-full"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('dispute_creation.against_label', 'Dispute Against *')}
            </label>
            <select
              value={formData.against_user}
              onChange={(e) => setFormData({...formData, against_user: e.target.value})}
              className="input w-full"
              required
            >
              <option value="">{t('dispute_creation.select_user', 'Select user...')}</option>
              {users
                .filter(user => user.id !== currentUserId)
                .map(user => (
                  <option key={user.id} value={user.id}>
                    {user.full_name} ({user.email}) - {user.user_type}
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('dispute_creation.priority', 'Priority')}
            </label>
            <select
              value={formData.priority}
              onChange={(e) => setFormData({...formData, priority: e.target.value})}
              className="input w-full"
            >
              <option value="low">{t('dispute_creation.priority_low', 'Low')}</option>
              <option value="normal">{t('dispute_creation.priority_normal', 'Normal')}</option>
              <option value="high">{t('dispute_creation.priority_high', 'High')}</option>
              <option value="urgent">{t('dispute_creation.priority_urgent', 'Urgent')}</option>
            </select>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary flex-1"
            >
              {loading ? t('dispute_creation.creating', 'Creating...') : t('dispute_creation.create', 'Create Dispute')}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
            >
              {t('dispute_creation.cancel', 'Cancel')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default DisputeCreationModal;
