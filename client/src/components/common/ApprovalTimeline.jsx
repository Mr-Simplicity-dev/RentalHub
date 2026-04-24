import React from 'react';

const ApprovalTimeline = ({ steps = [], currentStepKey, finalStatus = 'pending' }) => {
  const currentIndex = Math.max(
    0,
    steps.findIndex((step) => step.key === currentStepKey)
  );

  const isFinalRejected = String(finalStatus || '').toLowerCase() === 'rejected';
  const isFinalApproved = String(finalStatus || '').toLowerCase() === 'approved';

  return (
    <div className="mt-3">
      <div className="flex items-center gap-2">
        {steps.map((step, index) => {
          const isCompleted = index < currentIndex;
          const isCurrent = index === currentIndex;

          let circleClass = 'bg-gray-200 text-gray-600';
          if (isCompleted) circleClass = 'bg-emerald-500 text-white';
          if (isCurrent) circleClass = 'bg-blue-600 text-white ring-2 ring-blue-200';
          if (isFinalRejected && index >= currentIndex) {
            circleClass = 'bg-red-500 text-white';
          }
          if (isFinalApproved && index <= currentIndex) {
            circleClass = 'bg-emerald-600 text-white';
          }

          return (
            <React.Fragment key={step.key}>
              <div className="flex min-w-0 flex-col items-center">
                <div
                  className={`h-6 w-6 rounded-full text-[10px] font-semibold flex items-center justify-center ${circleClass}`}
                  title={step.label}
                >
                  {index + 1}
                </div>
                <span className="mt-1 text-[10px] font-medium text-gray-600 text-center leading-3">
                  {step.label}
                </span>
              </div>
              {index < steps.length - 1 && (
                <div
                  className={`h-0.5 flex-1 ${
                    index < currentIndex || isFinalApproved ? 'bg-emerald-500' : isFinalRejected ? 'bg-red-400' : 'bg-gray-300'
                  }`}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

export default ApprovalTimeline;
