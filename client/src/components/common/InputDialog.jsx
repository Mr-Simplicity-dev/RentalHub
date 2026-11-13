import Modal from './Modal';
import React, { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

const buildInitialInputValues = (inputs = [], initialValues = {}) => {
  const values = {};
  inputs.forEach(input => {
    values[input.name] = initialValues[input.name] || input.defaultValue || '';
  });
  return values;
};

const InputDialog = ({
  isOpen,
  onConfirm,
  onCancel,
  title,
  message,
  type = 'info',
  confirmText,
  cancelText,
  isLoading = false,
  inputs = [],
  initialValues = {}
}) => {
  const { t } = useTranslation();
  const fieldId = useId();
  const [inputValues, setInputValues] = useState(() =>
    buildInitialInputValues(inputs, initialValues)
  );

  const [errors, setErrors] = useState({});
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      setInputValues(buildInitialInputValues(inputs, initialValues));
      setErrors({});
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, inputs, initialValues]);

  if (!isOpen) return null;

  const typeConfig = {
    info: {
      bgColor: 'bg-primary-50',
      borderColor: 'border-primary-200',
      textColor: 'text-primary-800',
      buttonColor: 'bg-primary-600 hover:bg-primary-700',
    },
    warning: {
      bgColor: 'bg-amber-50',
      borderColor: 'border-amber-200',
      textColor: 'text-amber-800',
      buttonColor: 'bg-amber-600 hover:bg-amber-700',
    },
    danger: {
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200',
      textColor: 'text-red-800',
      buttonColor: 'bg-red-600 hover:bg-red-700',
    },
  };

  const config = typeConfig[type] || typeConfig.info;

  const validateInputs = () => {
    const newErrors = {};
    let isValid = true;

    inputs.forEach(input => {
      const value = inputValues[input.name];
      
      if (input.required && !String(value || '').trim()) {
        newErrors[input.name] = t('input_dialog.required', '{{label}} is required', { label: input.label });
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

  return <Modal isOpen={isOpen} onClose={onCancel} title={title} size="small" busy={isLoading} footer={<div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button type="button" onClick={onCancel} disabled={isLoading} className="btn btn-secondary">{cancelText || t('common.cancel','Cancel')}</button><button type="button" onClick={handleConfirm} disabled={isLoading} className={`btn text-white ${config.buttonColor}`}>{isLoading?t('common.processing','Processing...'):confirmText||t('input_dialog.confirm','Confirm')}</button></div>}>
    {message && <div className={`mb-5 rounded-xl border p-3 text-sm leading-6 ${config.bgColor} ${config.borderColor} ${config.textColor}`}>{message}</div>}
    <div className="space-y-4">
              {inputs.map((input) => (
                <div key={input.name}>
                  <label htmlFor={`${fieldId}-${input.name}`} className="block text-sm font-medium text-gray-700 mb-1">
                    {input.label} {input.required && <span className="text-red-500">*</span>}
                  </label>
                  {input.type === 'textarea' ? (
                    <textarea
                      id={`${fieldId}-${input.name}`}
                      maxLength={input.maxLength || 4000}
                      value={inputValues[input.name] || ''}
                      onChange={(e) => handleInputChange(input.name, e.target.value)}
                      className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                        errors[input.name] ? 'border-red-300' : 'border-gray-300'
                      }`}
                      placeholder={input.placeholder}
                      rows={input.rows || 3}
                      disabled={isLoading}
                    />
                  ) : (
                    <input
                      id={`${fieldId}-${input.name}`}
                      type={input.type || 'text'}
                      value={inputValues[input.name] || ''}
                      onChange={(e) => handleInputChange(input.name, e.target.value)}
                      className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 ${
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
  </Modal>;

};

export default InputDialog;
