import React, { useState } from 'react';
import { FaTimes, FaInfoCircle } from 'react-icons/fa';

const InputDialog = ({
  isOpen,
  onConfirm,
  onCancel,
  title,
  message,
  type = 'info',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isLoading = false,
  inputs = [],
  initialValues = {}
}) => {
  const [inputValues, setInputValues] = useState(() => {
    const values = {};
    inputs.forEach(input => {
      values[input.name] = initialValues[input.name] || input.defaultValue || '';
    });
    return values;
  });

  const [errors, setErrors] = useState({});

  if (!isOpen) return null;

  const typeConfig = {
    info: {
      icon: <FaInfoCircle className="h-6 w-6 text-blue-600" />,
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200',
      textColor: 'text-blue-800',
      buttonColor: 'bg-blue-600 hover:bg-blue-700',
    },
    warning: {
      icon: <FaInfoCircle className="h-6 w-6 text-amber-600" />,
      bgColor: 'bg-amber-50',
      borderColor: 'border-amber-200',
      textColor: 'text-amber-800',
      buttonColor: 'bg-amber-600 hover:bg-amber-700',
    },
    danger: {
      icon: <FaInfoCircle className="h-6 w-6 text-red-600" />,
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200',
      textColor: 'text-red-800',
      buttonColor: 'bg-red-600 hover:bg-red-700',
    },
  };

  const config = typeConfig[type];

  const validateInputs = () => {
    const newErrors = {};
    let isValid = true;

    inputs.forEach(input => {
      const value = inputValues[input.name];
      
      if (input.required && !value) {
        newErrors[input.name] = `${input.label} is required`;
        isValid = false;
      }
      
      if (input.validate) {
        const validationResult = input.validate(value);
        if (validationResult !== true) {
          newErrors[input.name] = validationResult;
          isValid = false;
        }
      }
    });

    setErrors(newErrors);
    return isValid;
  };

  const handleConfirm = () => {
    if (validateInputs()) {
      onConfirm(inputValues);
    }
  };

  const handleInputChange = (name, value) => {
    setInputValues(prev => ({ ...prev, [name]: value }));
    // Clear error for this field when user starts typing
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: undefined }));
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div 
          className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" 
          onClick={onCancel}
        />

        {/* Modal */}
        <div className="inline-block transform overflow-hidden rounded-lg bg-white text-left align-bottom shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:align-middle">
          <div className={`px-6 py-4 ${config.bgColor} ${config.borderColor} border-b`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                {config.icon}
                <h3 className="ml-3 text-lg font-medium leading-6 text-gray-900">
                  {title}
                </h3>
              </div>
              <button
                onClick={onCancel}
                className="rounded-md text-gray-400 hover:text-gray-500 focus:outline-none"
                disabled={isLoading}
              >
                <FaTimes className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="bg-white px-6 py-4">
            {message && (
              <div className="mb-4">
                <p className={`text-sm ${config.textColor}`}>
                  {message}
                </p>
              </div>
            )}

            <div className="space-y-4">
              {inputs.map((input) => (
                <div key={input.name}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {input.label} {input.required && <span className="text-red-500">*</span>}
                  </label>
                  {input.type === 'textarea' ? (
                    <textarea
                      value={inputValues[input.name] || ''}
                      onChange={(e) => handleInputChange(input.name, e.target.value)}
                      className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        errors[input.name] ? 'border-red-300' : 'border-gray-300'
                      }`}
                      placeholder={input.placeholder}
                      rows={input.rows || 3}
                      disabled={isLoading}
                    />
                  ) : (
                    <input
                      type={input.type || 'text'}
                      value={inputValues[input.name] || ''}
                      onChange={(e) => handleInputChange(input.name, e.target.value)}
                      className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        errors[input.name] ? 'border-red-300' : 'border-gray-300'
                      }`}
                      placeholder={input.placeholder}
                      disabled={isLoading}
                    />
                  )}
                  {errors[input.name] && (
                    <p className="mt-1 text-sm text-red-600">{errors[input.name]}</p>
                  )}
                  {input.helpText && (
                    <p className="mt-1 text-xs text-gray-500">{input.helpText}</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-gray-50 px-6 py-4 sm:flex sm:flex-row-reverse">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isLoading}
              className={`inline-flex w-full justify-center rounded-md border border-transparent px-4 py-2 text-base font-medium text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 sm:ml-3 sm:w-auto sm:text-sm ${config.buttonColor} ${isLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Processing...
                </>
              ) : (
                confirmText
              )}
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={isLoading}
              className="mt-3 inline-flex w-full justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-base font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {cancelText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InputDialog;