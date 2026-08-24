import React, { useEffect } from "react";

const LiveModerationQueue = ({
  loadReports,
  loadVerifications,
  loadFraud
}) => {

  useEffect(() => {

    const interval = setInterval(() => {

      loadReports();
      loadVerifications();
      loadFraud();

    }, 10000); // refresh every 10 seconds

    return () => clearInterval(interval);

  }, [loadReports, loadVerifications, loadFraud]);

  return (
    <div className="mb-4 animate-fadeIn">
      <div className="inline-flex items-center gap-2 rounded-xl2 border border-soft bg-white px-4 py-2 shadow-card">
        <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse"></span>
        <span className="text-sm text-gray-500">
          Live moderation queue
        </span>
      </div>
    </div>
  );
};

export default LiveModerationQueue;
