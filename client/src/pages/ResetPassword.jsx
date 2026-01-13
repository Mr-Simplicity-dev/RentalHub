import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { toast } from 'react-toastify';

const ResetPassword = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/auth/reset-password', { token, password });
      toast.success('Password reset successful');
      navigate('/login');
    } catch {
      toast.error('Reset failed');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <form onSubmit={submit} className="card max-w-md w-full">
        <h1 className="text-xl font-bold mb-4">Reset Password</h1>
        <input
          type="password"
          className="input mb-4"
          placeholder="New password"
          value={password}
          onChange={e => setPassword(e.target.value)}
        />
        <button className="btn btn-primary w-full">Reset</button>
      </form>
    </div>
  );
};

export default ResetPassword;
