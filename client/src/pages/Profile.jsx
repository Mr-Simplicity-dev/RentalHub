import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import api from '../services/api';
import { toast } from 'react-toastify';

const Profile = () => {
  const { user, setUser } = useAuth();
  const [passport, setPassport] = useState(null);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async () => {
    if (!passport) {
      toast.error('Please select an image');
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
        toast.success('Document uploaded. Awaiting admin verification.');
        setUser(res.data.user);
      }
    } catch (err) {
      toast.error('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <h1 className="text-2xl font-bold mb-6">My Profile</h1>

      <div className="card mb-6">
        <h2 className="font-semibold mb-4">Account Information</h2>
        <div className="space-y-2 text-sm">
          <div><strong>Name:</strong> {user?.full_name}</div>
          <div><strong>Email:</strong> {user?.email}</div>
          <div><strong>Phone:</strong> {user?.phone}</div>
          <div><strong>Role:</strong> {user?.user_type}</div>
        </div>
      </div>

      <div className="card">
        <h2 className="font-semibold mb-4">Identity Verification</h2>

        {user?.identity_verified ? (
          <div className="text-green-600 font-semibold">
            Your identity has been verified ✔
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-600 mb-4">
              Upload your passport photograph for identity verification.
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
              {uploading ? 'Uploading...' : 'Upload Document'}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default Profile;
