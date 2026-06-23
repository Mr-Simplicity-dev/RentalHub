import React from 'react';
import { FaMobileAlt, FaDownload, FaShieldAlt, FaBell, FaComments, FaHome } from 'react-icons/fa';

const MobileAppPage = () => {
  const features = [
    { icon: <FaBell />, title: 'Instant Alerts', desc: 'Get notified when new properties match your search criteria.' },
    { icon: <FaComments />, title: 'In-App Chat', desc: 'Message landlords and tenants directly from your phone.' },
    { icon: <FaHome />, title: 'Browse Properties', desc: 'Search, filter, and save your favourite listings on the go.' },
    { icon: <FaShieldAlt />, title: 'Legal Support', desc: 'Submit legal assistance requests and track case progress.' },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <section className="bg-gradient-to-br from-slate-900 via-slate-800 to-primary-900 text-white">
        <div className="container mx-auto px-4 py-20 text-center">
          <FaMobileAlt className="mx-auto text-6xl mb-6 text-primary-300" />
          <h1 className="text-4xl font-extrabold md:text-5xl mb-4">RentalHub Mobile App</h1>
          <p className="text-lg text-slate-200 max-w-2xl mx-auto mb-8">
            Manage your rentals, chat with landlords and tenants, and access legal support — all from your phone.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <a
              href="/api/downloads/app"
              className="inline-flex items-center justify-center gap-2 bg-white text-primary-700 px-8 py-3 rounded-xl font-semibold hover:bg-gray-100 transition"
            >
              <FaDownload />
              Download for Android
            </a>
            <a
              href={process.env.REACT_APP_IOS_APP_URL || '#'}
              className={`inline-flex items-center justify-center gap-2 border-2 border-white px-8 py-3 rounded-xl font-semibold text-white hover:bg-white/10 transition ${!process.env.REACT_APP_IOS_APP_URL ? 'opacity-60 cursor-not-allowed' : ''}`}
              onClick={(e) => { if (!process.env.REACT_APP_IOS_APP_URL) e.preventDefault(); }}
            >
              <FaDownload />
              iOS (Coming Soon)
            </a>
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-16">
        <h2 className="text-2xl font-bold text-slate-900 text-center mb-10">Everything in the app</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((f, i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-200 p-6 text-center">
              <div className="text-3xl text-primary-600 mb-3 flex justify-center">{f.icon}</div>
              <h3 className="font-semibold text-slate-900 mb-1">{f.title}</h3>
              <p className="text-sm text-slate-600">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white border-t border-slate-200 py-12">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-xl font-bold text-slate-900 mb-2">APK direct download</h2>
          <p className="text-sm text-slate-600 mb-4">Download the APK and install it manually on your Android device.</p>
          <a
            href="/api/downloads/app"
            className="inline-flex items-center gap-2 bg-primary-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-primary-700 transition"
          >
            <FaDownload />
            Download RentalHub.apk
          </a>
        </div>
      </section>
    </div>
  );
};

export default MobileAppPage;
