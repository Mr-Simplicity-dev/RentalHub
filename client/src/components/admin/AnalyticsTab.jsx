import React from "react";
import {
  LineChart,
  Line,
  ResponsiveContainer,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip
} from "recharts";

const ROLE_LABELS = {
  tenant: "Tenant",
  landlord: "Landlord",
  agent: "Platform Agent",
  super_admin: "Super Admin",
  admin: "LGA Admin",
  lga_admin: "LGA Admin",
  state_admin: "State Admin",
  financial_admin: "Financial Admin",
  lga_financial_admin: "LGA Financial Admin",
  state_financial_admin: "State Financial Admin",
  super_financial_admin: "Super Financial Admin",
  support_admin: "Support Admin",
  lga_support_admin: "LGA Support Admin",
  state_support_admin: "State Support Admin",
  super_support_admin: "Super Support Admin",
  recruitment_admin: "Recruitment Admin",
  lawyer: "Lawyer",
  state_lawyer: "State Lawyer",
  super_lawyer: "Super Lawyer",
  state_lawyer_admin: "State Lawyer Admin",
  super_lawyer_admin: "Super Lawyer Admin",
  fumigation_admin: "Fumigation Admin",
  lga_fumigation_admin: "LGA Fumigation Admin",
  state_fumigation_admin: "State Fumigation Admin",
  super_fumigation_admin: "Super Fumigation Admin",
  transportation_admin: "Transportation Admin",
  lga_transportation_admin: "LGA Transportation Admin",
  state_transportation_admin: "State Transportation Admin",
  super_transportation_admin: "Super Transportation Admin",
};

const formatRole = (role) => {
  if (!role) return "Unknown Role";
  return (
    ROLE_LABELS[role] ||
    String(role)
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
  );
};

const AnalyticsTab = ({ analytics }) => {

  if (!analytics) {
    return (
      <div className="bg-white border border-soft rounded-xl2 shadow-card p-10 text-center text-gray-500">
        No analytics data available
      </div>
    );
  }

  const stats = [
    {
      label: "Total Properties",
      value: analytics.totalProperties,
    },
    {
      label: "Applications",
      value: analytics.totalApplications,
    },
    {
      label: "Verified Users",
      value: analytics.verifiedUsers,
    },
  ];

  const chartData = analytics.userGrowth || [];
  const usersByRole = analytics.usersByRole || [];
  const propertiesByState = analytics.propertiesByState || [];

  const totalUsersByRole = usersByRole.reduce(
    (sum, r) => sum + (Number(r.count) || 0),
    0
  );

  const maxStateCount = Math.max(
    ...propertiesByState.map((p) => Number(p.count) || 0),
    1
  );

  return (
    <div className="space-y-6 animate-fadeIn">

      {/* STAT CARDS */}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

        {stats.map((s) => (

          <div
            key={s.label}
            className="bg-white border border-soft rounded-xl2 shadow-card hover:shadow-cardHover transition p-6"
          >

            <p className="text-sm text-gray-500 mb-2">
              {s.label}
            </p>

            <p className="text-3xl font-semibold text-gray-900">
              {s.value ?? 0}
            </p>

          </div>

        ))}

      </div>


      {/* USER GROWTH CHART */}

      <div className="bg-white border border-soft rounded-xl2 shadow-card p-6">

        <h3 className="text-lg font-semibold mb-4">
          User Growth
        </h3>

        {chartData.length === 0 ? (
          <div className="py-12 text-center text-gray-500">
            No user growth data recorded yet.
          </div>
        ) : (
          <div className="h-[300px]">

            <ResponsiveContainer width="100%" height="100%">

              <LineChart data={chartData}>

                <CartesianGrid strokeDasharray="3 3" />

                <XAxis dataKey="month" />

                <YAxis />

                <Tooltip />

                <Line
                  type="monotone"
                  dataKey="users"
                  stroke="#0ea5e9"
                  strokeWidth={3}
                />

              </LineChart>

            </ResponsiveContainer>

          </div>
        )}

      </div>


      {/* USERS BY ROLE */}

      <div className="bg-white border border-soft rounded-xl2 shadow-card p-6">

        <div className="flex items-center justify-between mb-4">

          <div>
            <h3 className="text-lg font-semibold">
              Users by Role
            </h3>

            <p className="text-sm text-gray-500">
              Distribution of registered users across roles.
            </p>
          </div>

          {totalUsersByRole > 0 && (
            <span className="text-xs font-semibold px-2.5 py-1 bg-sky-50 text-sky-700 rounded-full border border-sky-100">
              {totalUsersByRole.toLocaleString()} total
            </span>
          )}

        </div>

        {usersByRole.length === 0 ? (
          <div className="py-8 text-center text-gray-500">
            No user role distribution data recorded yet.
          </div>
        ) : (
          <div className="space-y-3">

            {usersByRole.map((r) => {
              const count = Number(r.count) || 0;
              const pct =
                totalUsersByRole > 0
                  ? Math.round((count / totalUsersByRole) * 100)
                  : 0;

              return (
                <div
                  key={r.role}
                  className="border border-soft rounded-lg px-4 py-3 hover:bg-gray-50 transition"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-medium text-gray-800">
                      {formatRole(r.role)}
                    </span>

                    <div className="flex items-center space-x-2">
                      <span className="font-semibold text-gray-900">
                        {count.toLocaleString()}
                      </span>
                      <span className="text-xs text-gray-500">
                        ({pct}%)
                      </span>
                    </div>
                  </div>

                  <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-sky-500 h-full rounded-full transition-all duration-300"
                      style={{ width: `${Math.max(pct, count > 0 ? 2 : 0)}%` }}
                    />
                  </div>
                </div>
              );
            })}

          </div>
        )}

      </div>

      {/* PROPERTIES BY STATE */}

      {propertiesByState.length > 0 && (
        <div className="bg-white border border-soft rounded-xl2 shadow-card p-6">

          <div className="mb-4">
            <h3 className="text-lg font-semibold">
              Properties by State
            </h3>

            <p className="text-sm text-gray-500">
              Distribution of listed properties across Nigerian states.
            </p>
          </div>

          <div className="space-y-3">
            {propertiesByState.map((p, idx) => {
              const stateName = p.state || `State ${idx + 1}`;
              const count = Number(p.count) || 0;
              const pct = Math.round((count / maxStateCount) * 100);

              return (
                <div
                  key={stateName}
                  className="border border-soft rounded-lg px-4 py-3 hover:bg-gray-50 transition"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-medium text-gray-800">
                      {stateName}
                    </span>

                    <span className="font-semibold text-gray-900">
                      {count.toLocaleString()} {count === 1 ? "property" : "properties"}
                    </span>
                  </div>

                  <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-purple-500 h-full rounded-full transition-all duration-300"
                      style={{ width: `${Math.max(pct, count > 0 ? 2 : 0)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

        </div>
      )}

    </div>
  );
};

export default AnalyticsTab;
