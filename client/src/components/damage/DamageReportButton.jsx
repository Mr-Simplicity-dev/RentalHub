import React, { useCallback, useState } from 'react';
import DamageReportCapture from '../damage/DamageReportCapture';

/**
 * DamageReportButton - Simple trigger button for damage report modal
 * Used in AddProperty, AgentDashboard, PropertyDetail, etc.
 */
const DamageReportButton = ({ propertyId, onReportSaved, variant = 'primary' }) => {
  const [showCapture, setShowCapture] = useState(false);

  const handleClose = useCallback(() => {
    setShowCapture(false);
  }, []);

  const handleSaved = useCallback(() => {
    onReportSaved?.();
    handleClose();
  }, [onReportSaved, handleClose]);

  return (
    <>
      <button
        type="button"
        onClick={() => setShowCapture(true)}
        className={`btn btn-${variant} gap-2`}
      >
        📸 Report Damage
      </button>

      {showCapture && (
        <DamageReportCapture
          propertyId={propertyId}
          onSaved={handleSaved}
          onClose={handleClose}
        />
      )}
    </>
  );
};

export default DamageReportButton;
