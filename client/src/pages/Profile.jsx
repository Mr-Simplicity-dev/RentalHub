import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import api from '../services/api';
import { toast } from 'react-toastify';
import { useTranslation } from 'react-i18next';

const Profile = () => {
  const { user, updateUser } = useAuth();
  const { t } = useTranslation();

  const [passport, setPassport] = useState(null);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async () => {
    if (!passport) {
      toast.error(t('profile.select_image'));
      return;
    }

    const formData = new FormData();
    formData.append('passport', passport);

    setUploading(true);
    try {
      const res = await api.post('/users/upload-passport', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (res.data?.success) {
        toast.success(t('profile.upload_success'));
        if (res.data.user) {
          updateUser(res.data.user);
        }
      }
    } catch (err) {
      toast.error(t('profile.upload_failed'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <h1 className="text-2xl font-bold mb-6">{t('profile.title')}</h1>

      <div className="card mb-6">
        <h2 className="font-semibold mb-4">{t('profile.account_title')}</h2>
        <div className="space-y-2 text-sm">
          <div><strong>{t('profile.name')}:</strong> {user?.full_name}</div>
          <div><strong>{t('profile.email')}:</strong> {user?.email}</div>
          <div><strong>{t('profile.phone')}:</strong> {user?.phone}</div>
          <div><strong>{t('profile.role')}:</strong> {user?.user_type}</div>
        </div>
      </div>

      <div className="card">
        <h2 className="font-semibold mb-4">{t('profile.verify_title')}</h2>

        {user?.identity_verified ? (
          <div className="text-green-600 font-semibold">
            {t('profile.verified')}
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-600 mb-4">
              {t('profile.verify_text')}
            </p>

            <input
              type="file"
              accept="image/*"
              onChange={(e) => setPassport(e.target.files[0])}
              className="mb-4"
            />

            <button
              onClick={handleUpload}
              disabled={uploading}
              className="btn btn-primary"
            >
              {uploading ? t('profile.uploading') : t('profile.upload')}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default Profile;
