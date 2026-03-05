import React from "react";

const AnalyticsTab = ({ analytics }) => {

  if (!analytics) {
    return <p className="text-gray-500">No analytics data</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4 animate-fadeIn">

      <div className="rounded-xl2 border border-soft bg-white p-6 shadow-card transition hover:shadow-cardHover">
        <h3>Total Properties</h3>
        <p className="text-2xl">{analytics.totalProperties}</p>
      </div>

      <div className="rounded-xl2 border border-soft bg-white p-6 shadow-card transition hover:shadow-cardHover">
        <h3>Applications</h3>
        <p className="text-2xl">{analytics.totalApplications}</p>
      </div>

      <div className="rounded-xl2 border border-soft bg-white p-6 shadow-card transition hover:shadow-cardHover">
        <h3>Verified Users</h3>
        <p className="text-2xl">{analytics.verifiedUsers}</p>
      </div>

      <div className="col-span-full rounded-xl2 border border-soft bg-white p-6 shadow-card transition hover:shadow-cardHover">

        <h3 className="font-semibold mb-2">
          Users by Role
        </h3>

        {(analytics.usersByRole || []).map((r) => (
          <div key={r.role}>
            {r.role}: {r.count}
          </div>
        ))}

      </div>

    </div>
  );
};

export default AnalyticsTab;
