import React from 'react';
import { handleButtonError } from '../../utils/errorHandler';

const Button = ({ 
  children, 
  variant = 'primary', 
  size = 'medium', 
  disabled = false,
  loading = false,
  error = null,
  onClick,
  className = '',
  showError = true,
  errorContext = '',
  ...props 
}) => {
  const baseClasses = 'font-medium rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';
  
  const variants = {
    primary: 'bg-primary-600 text-white hover:bg-primary-700 focus:ring-primary-500 active:bg-primary-800',
    secondary: 'bg-gray-200 text-gray-900 hover:bg-gray-300 focus:ring-gray-500 active:bg-gray-400',
    danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500 active:bg-red-800',
    warning: 'bg-amber-500 text-white hover:bg-amber-600 focus:ring-amber-500 active:bg-amber-700',
    success: 'bg-green-600 text-white hover:bg-green-700 focus:ring-green-500 active:bg-green-800',
    outline: 'border border-gray-300 text-gray-700 hover:bg-gray-50 focus:ring-gray-500 active:bg-gray-100',
    'outline-primary': 'border border-primary-600 text-primary-600 hover:bg-primary-50 focus:ring-primary-500 active:bg-primary-100',
    'outline-danger': 'border border-red-600 text-red-600 hover:bg-red-50 focus:ring-red-500 active:bg-red-100',
  };
  
  const sizes = {
    small: 'px-3 py-1.5 text-sm',
    medium: 'px-4 py-2 text-base',
    large: 'px-6 py-3 text-lg',
  };

  const getErrorText = () => {
    if (!error || !showError) return null;
    
    if (typeof error === 'string') return error;
    if (error.message) return error.message;
    
    // Try to get context-specific error message
    if (errorContext) {
      return handleButtonError(error, errorContext);
    }
    
    return 'An error occurred';
  };

  const errorText = getErrorText();

  return (
    <div className="flex flex-col">
      <button
        className={`${baseClasses} ${variants[variant]} ${sizes[size]} ${loading ? 'relative' : ''} ${className}`}
        disabled={disabled || loading}
        onClick={onClick}
        {...props}
      >
        {loading && (
          <span className="absolute inset-0 flex items-center justify-center">
            <svg className="animate-spin h-4 w-4 text-current" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </span>
        )}
        <span className={loading ? 'invisible' : 'visible'}>
          {children}
        </span>
      </button>
      
      {errorText && (
        <div className="mt-1">
          <p className="text-xs text-red-600 animate-fadeIn">
            {errorText}
          </p>
        </div>
      )}
    </div>
  );
};

// Compound component for button groups
Button.Group = ({ children, className = '' }) => {
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {children}
    </div>
  );
};

// Compound component for button with icon
Button.Icon = ({ icon: Icon, children, position = 'left', ...props }) => {
  return (
    <Button {...props}>
      <span className={`flex items-center justify-center ${position === 'left' ? 'flex-row' : 'flex-row-reverse'}`}>
        {Icon && <Icon className={`${children ? (position === 'left' ? 'mr-2' : 'ml-2') : ''} h-4 w-4`} />}
        {children}
      </span>
    </Button>
  );
};

export default Button;