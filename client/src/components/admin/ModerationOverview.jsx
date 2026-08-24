import React from "react";

const ModerationOverview = ({
  reports,
  verifications,
  fraud,
  loadTab
}) => {

  const pendingReports =
    reports?.filter((r) => r.status === "pending") || [];

  const pendingVerifications =
    verifications?.filter((v) => !v.identity_verified) || [];

  const fraudAlerts = fraud || [];

  return (
    <div className="space-y-6 animate-fadeIn">

      {/* STATS CARDS */}

      <div className="grid gap-4 md:grid-cols-3">

        <div
          onClick={() => loadTab("reports")}
          className="cursor-pointer rounded-xl2 border border-soft bg-white p-6 shadow-card transition hover:shadow-cardHover animate-slideInRight"
        >
          <p className="text-gray-500 text-sm">
            Pending Reports
          </p>

          <p className="text-3xl font-semibold text-red-600">
            {pendingReports.length}
          </p>

        </div>

        <div
          onClick={() => loadTab("verifications")}
          className="cursor-pointer rounded-xl2 border border-soft bg-white p-6 shadow-card transition hover:shadow-cardHover animate-slideInRight"
        >
          <p className="text-gray-500 text-sm">
            Pending Verifications
          </p>

          <p className="text-3xl font-semibold text-yellow-600">
            {pendingVerifications.length}
          </p>

        </div>

        <div
          onClick={() => loadTab("fraud")}
          className="cursor-pointer rounded-xl2 border border-soft bg-white p-6 shadow-card transition hover:shadow-cardHover animate-slideInRight"
        >
          <p className="text-gray-500 text-sm">
            Fraud Alerts
          </p>

          <p className="text-3xl font-semibold text-purple-600">
            {fraudAlerts.length}
          </p>

        </div>

      </div>


      {/* RECENT REPORTS */}

      <div className="rounded-xl2 border border-soft bg-white shadow-card transition hover:shadow-cardHover">

        <div className="border-b border-soft p-4">
          <h3 className="font-semibold">
            Recent Reports
          </h3>
        </div>

        <div className="divide-y">

          {pendingReports.slice(0,5).map((r) => (

            <div
              key={r.id}
              className="p-4 flex justify-between items-center hover:bg-gray-50"
            >

              <div>

                <p className="font-medium">
                  {r.target_type} #{r.target_id}
                </p>

                <p className="text-sm text-gray-500">
                  {r.reason}
                </p>

              </div>

              <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded">
                Pending
              </span>

            </div>

          ))}

          {pendingReports.length === 0 && (
            <p className="p-4 text-gray-500 text-sm">
              No pending reports
            </p>
          )}

        </div>

      </div>

    </div>
  );
};

export default ModerationOverview;
