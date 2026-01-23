// import React, { useEffect, useState } from 'react';
// import { useSearchParams, useNavigate } from 'react-router-dom';
// import api from '../services/api';

// const VerifyEmail = () => {
//   const [searchParams] = useSearchParams();
//   const token = searchParams.get('token');
//   const navigate = useNavigate();

//   const [status, setStatus] = useState('verifying'); // verifying | success | error
//   const [message, setMessage] = useState('');

//   useEffect(() => {
//     if (!token) {
//       setStatus('error');
//       setMessage('Invalid verification link.');
//       return;
//     }

//     const verify = async () => {
//       try {
//         const res = await api.get(`/auth/verify-email/${token}`);

//         if (res.data?.success) {
//           const { token: authToken, user } = res.data;

//           // 🔐 Auto-login
//           localStorage.setItem('token', authToken);
//           localStorage.setItem('user', JSON.stringify(user));
//           api.defaults.headers.common['Authorization'] = `Bearer ${authToken}`;

//           setStatus('success');
//           setMessage(res.data.message || 'Your email has been verified successfully.');

//           // ➡ Redirect to phone verification after short delay
//           setTimeout(() => {
//             navigate('/verify-phone');
//           }, 1200);
//         } else {
//           setStatus('error');
//           setMessage(res.data?.message || 'Verification failed.');
//         }
//       } catch (err) {
//         setStatus('error');
//         setMessage(
//           err.response?.data?.message ||
//           'Invalid or expired verification link.'
//         );
//       }
//     };

//     verify();
//   }, [token, navigate]);

//   return (
//     <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
//       <div className="max-w-md w-full bg-white p-8 rounded-xl shadow text-center">
//         {status === 'verifying' && (
//           <>
//             <h2 className="text-xl font-semibold text-gray-900 mb-2">
//               Verifying your email…
//             </h2>
//             <p className="text-gray-600">Please wait a moment.</p>
//           </>
//         )}

//         {status === 'success' && (
//           <>
//             <h2 className="text-xl font-semibold text-green-700 mb-2">
//               Email Verified
//             </h2>
//             <p className="text-gray-600 mb-4">{message}</p>
//             <p className="text-sm text-gray-500">
//               Redirecting to phone verification…
//             </p>
//           </>
//         )}

//         {status === 'error' && (
//           <>
//             <h2 className="text-xl font-semibold text-red-700 mb-2">
//               Verification Failed
//             </h2>
//             <p className="text-gray-600 mb-6">{message}</p>

//             <div className="space-y-3">
//               <button
//                 onClick={() => navigate('/login')}
//                 className="btn-primary w-full"
//               >
//                 Go to Login
//               </button>

//               <button
//                 onClick={() => navigate('/register')}
//                 className="btn-outline w-full"
//               >
//                 Create New Account
//               </button>
//             </div>
//           </>
//         )}
//       </div>
//     </div>
//   );
// };

// export default VerifyEmail;


import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api from '../services/api';

const VerifyEmail = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();

  const [status, setStatus] = useState('verifying'); // verifying | success | error
  const [message, setMessage] = useState('');
  const [countdown, setCountdown] = useState(3); // seconds before redirect

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('Invalid verification link.');
      return;
    }

    const verify = async () => {
      try {
        const res = await api.get(`/auth/verify-email/${token}`);

        if (res.data?.success) {
          const { token: authToken, user } = res.data;

          // 🔐 Auto-login
          localStorage.setItem('token', authToken);
          localStorage.setItem('user', JSON.stringify(user));
          api.defaults.headers.common['Authorization'] = `Bearer ${authToken}`;

          setStatus('success');
          setMessage(res.data.message || 'Your email has been verified successfully.');
        } else {
          setStatus('error');
          setMessage(res.data?.message || 'Verification failed.');
        }
      } catch (err) {
        setStatus('error');
        setMessage(
          err.response?.data?.message ||
          'Invalid or expired verification link.'
        );
      }
    };

    verify();
  }, [token, navigate]);

  // Countdown + redirect when successful
  useEffect(() => {
    if (status !== 'success') return;

    if (countdown <= 0) {
      navigate('/verify-phone');
      return;
    }

    const timer = setTimeout(() => {
      setCountdown(c => c - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [status, countdown, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white p-8 rounded-xl shadow text-center">
        {status === 'verifying' && (
          <>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Verifying your email…
            </h2>
            <p className="text-gray-600">Please wait a moment.</p>
          </>
        )}

        {status === 'success' && (
          <>
            <h2 className="text-xl font-semibold text-green-700 mb-2">
              Email Verified
            </h2>
            <p className="text-gray-600 mb-4">{message}</p>
            <p className="text-sm text-gray-500">
              Redirecting to phone verification in {countdown}s…
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <h2 className="text-xl font-semibold text-red-700 mb-2">
              Verification Failed
            </h2>
            <p className="text-gray-600 mb-6">{message}</p>

            <div className="space-y-3">
              <button
                onClick={() => navigate('/login')}
                className="btn-primary w-full"
              >
                Go to Login
              </button>

              <button
                onClick={() => navigate('/register')}
                className="btn-outline w-full"
              >
                Create New Account
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default VerifyEmail;
