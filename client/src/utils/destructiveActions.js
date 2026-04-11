/**
 * Utility functions for handling destructive actions with proper error handling
 */

import { toast } from 'react-toastify';
import { handleButtonError } from './errorHandler';

/**
 * Common destructive action configurations
 */
export const destructiveActions = {
  delete: {
    title: 'Confirm Delete',
    message: 'Are you sure you want to delete this item? This action cannot be undone.',
    type: 'danger',
    confirmText: 'Delete',
    cancelText: 'Cancel',
    errorContext: 'admin'
  },
  ban: {
    title: 'Confirm Ban',
    message: 'Are you sure you want to ban this user? They will be unable to access their account.',
    type: 'danger',
    confirmText: 'Ban User',
    cancelText: 'Cancel',
    errorContext: 'admin'
  },
  disable: {
    title: 'Confirm Disable',
    message: 'Are you sure you want to disable this user?',
    type: 'warning',
    confirmText: 'Disable',
    cancelText: 'Cancel',
    errorContext: 'admin'
  },
  unlist: {
    title: 'Confirm Unlist',
    message: 'Are you sure you want to unlist this property? It will no longer be visible to users.',
    type: 'warning',
    confirmText: 'Unlist',
    cancelText: 'Cancel',
    errorContext: 'property'
  },
  revoke: {
    title: 'Confirm Revocation',
    message: 'Are you sure you want to revoke this assignment?',
    type: 'warning',
    confirmText: 'Revoke',
    cancelText: 'Cancel',
    errorContext: 'admin'
  },
  freeze: {
    title: 'Freeze Funds',
    message: 'Are you sure you want to freeze these funds?',
    type: 'danger',
    confirmText: 'Freeze Funds',
    cancelText: 'Cancel',
    errorContext: 'admin'
  },
  reject: {
    title: 'Confirm Rejection',
    message: 'Are you sure you want to reject this application?',
    type: 'warning',
    confirmText: 'Reject',
    cancelText: 'Cancel',
    errorContext: 'admin'
  },
  approve: {
    title: 'Confirm Approval',
    message: 'Are you sure you want to approve this application?',
    type: 'info',
    confirmText: 'Approve',
    cancelText: 'Cancel',
    errorContext: 'admin'
  }
};

/**
 * Execute a destructive action with proper error handling
 */
export const executeDestructiveAction = async (actionFn, actionName, args = []) => {
  try {
    const result = await actionFn(...args);
    toast.success(`${actionName} completed successfully`);
    return result;
  } catch (error) {
    const errorMessage = handleButtonError(error, destructiveActions[actionName]?.errorContext || 'admin');
    toast.error(errorMessage);
    throw error;
  }
};

/**
 * Format confirmation dialog props for a specific action
 */
export const getConfirmationProps = (actionType, customProps = {}) => {
  const baseProps = destructiveActions[actionType] || destructiveActions.delete;
  return { ...baseProps, ...customProps };
};

/**
 * Validate input for actions that require user input
 */
export const validateActionInput = (inputs, requiredFields) => {
  const missingFields = requiredFields.filter(field => !inputs[field]);
  
  if (missingFields.length > 0) {
    const fieldNames = missingFields.map(field => 
      field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
    );
    toast.error(`Please provide: ${fieldNames.join(', ')}`);
    return false;
  }
  
  return true;
};