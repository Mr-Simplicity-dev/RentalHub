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

      </div>


      {/* USERS BY ROLE */}

      <div className="bg-white border border-soft rounded-xl2 shadow-card p-6">

        <div className="mb-4">

          <h3 className="text-lg font-semibold">
            Users by Role
          </h3>

          <p className="text-sm text-gray-500">
            Distribution of registered users across roles.
          </p>

        </div>

        <div className="space-y-3">

          {(analytics.usersByRole || []).map((r) => (

            <div
              key={r.role}
              className="flex items-center justify-between border border-soft rounded-lg px-4 py-2 hover:bg-gray-50 transition"
            >

              <span className="capitalize text-gray-700">
                {r.role}
              </span>

              <span className="font-semibold">
                {r.count}
              </span>

            </div>

          ))}

        </div>

      </div>

    </div>
  );
};

export default AnalyticsTab;