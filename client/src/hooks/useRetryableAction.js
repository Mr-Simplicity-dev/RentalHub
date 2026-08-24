import { useState, useCallback } from 'react';
import { toast } from 'react-toastify';
import { isRetryableError, formatErrorForDisplay } from '../utils/errorHandler';

/**
 * Hook for executing actions with automatic retry logic
 */
const useRetryableAction = (action, options = {}) => {
  const {
    maxRetries = 3,
    retryDelay = 1000,
    showRetryToast = true,
    context = '',
    onSuccess = null,
    onError = null,
    onRetry = null
  } = options;

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const [lastAttemptTime, setLastAttemptTime] = useState(null);

  const executeWithRetry = useCallback(async (...args) => {
    setIsLoading(true);
    setError(null);
    let currentRetry = 0;
    let lastError = null;

    while (currentRetry <= maxRetries) {
      try {
        const result = await action(...args);
        
        // Reset retry state on success
        setRetryCount(0);
        setLastAttemptTime(new Date());
        
        if (onSuccess) {
          onSuccess(result, args);
        }
        
        setIsLoading(false);
        return result;
      } catch (err) {
        lastError = err;
        const formattedError = formatErrorForDisplay(err, context);
        
        if (currentRetry < maxRetries && isRetryableError(err)) {
          // Retryable error - wait and retry
          currentRetry++;
          setRetryCount(currentRetry);
          
          if (showRetryToast) {
            toast.info(`Attempt ${currentRetry} of ${maxRetries} failed. Retrying...`, {
              autoClose: 2000,
            });
          }
          
          if (onRetry) {
            onRetry(currentRetry, formattedError, args);
          }
          
          // Exponential backoff with jitter
          const delay = retryDelay * Math.pow(2, currentRetry - 1) + Math.random() * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          // Non-retryable error or max retries reached
          setError(formattedError);
          
          if (onError) {
            onError(formattedError, args);
          }
          
          setIsLoading(false);
          throw formattedError;
        }
      }
    }
    
    // Should never reach here, but just in case
    setIsLoading(false);
    throw lastError;
  }, [action, maxRetries, retryDelay, showRetryToast, context, onSuccess, onError, onRetry]);

  const reset = useCallback(() => {
    setIsLoading(false);
    setError(null);
    setRetryCount(0);
    setLastAttemptTime(null);
  }, []);

  return {
    execute: executeWithRetry,
    isLoading,
    error,
    retryCount,
    lastAttemptTime,
    reset,
    canRetry: error?.isRetryable && retryCount < maxRetries
  };
};

/**
 * Hook for handling destructive actions with confirmation
 */
export const useDestructiveAction = (action, options = {}) => {
  const {
    confirmationTitle = 'Confirm Action',
    confirmationMessage = 'Are you sure you want to perform this action?',
    confirmationType = 'warning',
    successMessage = 'Action completed successfully',
    errorContext = 'admin',
    ...retryOptions
  } = options;

  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingArgs, setPendingArgs] = useState(null);

  const retryableAction = useRetryableAction(action, {
    ...retryOptions,
    context: errorContext,
    onSuccess: (result, args) => {
      if (successMessage) {
        toast.success(successMessage);
      }
      if (options.onSuccess) {
        options.onSuccess(result, args);
      }
    },
    onError: (error, args) => {
      toast.error(error.message);
      if (options.onError) {
        options.onError(error, args);
      }
    }
  });

  const executeWithConfirmation = useCallback((...args) => {
    setPendingArgs(args);
    setShowConfirm(true);
  }, []);

  const handleConfirm = useCallback(async () => {
    setShowConfirm(false);
    if (pendingArgs) {
      await retryableAction.execute(...pendingArgs);
      setPendingArgs(null);
    }
  }, [pendingArgs, retryableAction]);

  const handleCancel = useCallback(() => {
    setShowConfirm(false);
    setPendingArgs(null);
    if (options.onCancel) {
      options.onCancel();
    }
  }, [options]);

  return {
    execute: executeWithConfirmation,
    handleConfirm,
    handleCancel,
    showConfirm,
    setShowConfirm,
    isLoading: retryableAction.isLoading,
    error: retryableAction.error,
    confirmationTitle,
    confirmationMessage,
    confirmationType
  };
};

export default useRetryableAction;