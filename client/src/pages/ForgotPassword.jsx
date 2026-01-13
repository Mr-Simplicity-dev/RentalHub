import React, { useState } from 'react';
import api from '../services/api';
import { toast } from 'react-toastify';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/auth/forgot-password', { email });
      toast.success('Reset link sent to your email');
    } catch {
      toast.error('Failed to send reset link');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <form onSubmit={submit} className="card max-w-md w-full">
        <h1 className="text-xl font-bold mb-4">Forgot Password</h1>
        <input
          className="input mb-4"
          placeholder="Email address"
          value={email}
          onChange={e => setEmail(e.target.value)}
        />
        <button className="btn btn-primary w-full">Send Reset Link</button>
      </form>
    </div>
  );
};

export default ForgotPassword;
