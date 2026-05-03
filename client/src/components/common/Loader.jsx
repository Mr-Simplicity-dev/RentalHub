import React from 'react';

const Loader = ({ size = 'medium', fullScreen = false, text = '' }) => {
  const sizeClasses = {
    small: 'w-6 h-6',
    medium: 'w-10 h-10',
    large: 'w-14 h-14',
  };

  const loader = (
    <div className="flex flex-col items-center gap-3">
      <div className={`${sizeClasses[size]} border-[3px] border-primary-100 border-t-primary-600 rounded-full animate-spin`}></div>
      {text && <p className="text-sm text-gray-500 animate-pulse-soft">{text}</p>}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn">
        {loader}
      </div>
    );
  }

  return <div className="flex justify-center items-center p-8">{loader}</div>;
};

export default Loader;