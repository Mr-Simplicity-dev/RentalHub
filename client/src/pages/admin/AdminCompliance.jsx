import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid
} from 'recharts';

const AnimatedNumber = ({ value }) => {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    let start = 0;
    const duration = 800;
    const increment = value / (duration / 16);

    const timer = setInterval(() => {
      start += increment;
      if (start >= value) {
        setDisplay(value);
        clearInterval(timer);
      } else {
        setDisplay(Math.floor(start));
      }
    }, 16);

    return () => clearInterval(timer);
  }, [value]);

  return <span>{display}</span>;
};

const StatCard = ({ title, value }) => (
  <div className="rounded-xl shadow-sm p-5 border bg-white">
    <h3 className="text-sm text-gray-500 mb-2">{title}</h3>
    <p className="text-2xl font-bold text-gray-800">
      <AnimatedNumber value={value} />
    </p>
  </div>
);

const AdminCompliance = () => {
  const [data, setData] = useState(null);
  const [trend, setTrend] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadAll = async () => {
    try {
      const [overviewRes, trendRes] = await Promise.all([
        api.get('/compliance/overview'),
        api.get('/compliance/risk-trend')
      ]);

      setData(overviewRes.data?.data || null);
      setTrend(trendRes.data?.data || []);
    } catch (error) {
      console.error('Compliance load error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    const interval = setInterval(loadAll, 30000); // auto refresh 30s
    return () => clearInterval(interval);
  }, []);

  const riskSeverity = () => {
    if (!data) return 'LOW';
    if (data.riskScore <= 5) return 'LOW';
    if (data.riskScore <= 12) return 'MEDIUM';
    return 'HIGH';
  };

  const riskColor = () => {
    if (!data) return '';
    if (data.riskScore <= 5) return 'bg-green-500';
    if (data.riskScore <= 12) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const riskPercent = () => {
    if (!data) return 0;
    const max = 20;
    return Math.min((data.riskScore / max) * 100, 100);
  };

  const exportReport = () => {
    window.print();
  };

  if (loading) {
    return <div className="p-6">Loading compliance dashboard...</div>;
  }

  if (!data) {
    return <div className="p-6 text-red-600">Failed to load compliance data.</div>;
  }

  return (
    <div className="p-6 space-y-8">

      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">
          Compliance & Risk Overview
        </h1>
        <button
          onClick={exportReport}
          className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700"
        >
          Export Report
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-5">
        <StatCard title="Open Disputes" value={data.totalOpen} />
        <StatCard title="Escalated" value={data.escalated} />
        <StatCard title="Aging (>14d)" value={data.aging} />
        <StatCard title="No Evidence" value={data.withoutEvidence} />
        <StatCard title="Lawyer Activity" value={data.lawyerActivity} />
        <StatCard
          title="Ledger Integrity"
          value={data.ledgerIntegrity ? 1 : 0}
        />
      </div>

      {/* Risk Score */}
      <div className="rounded-xl shadow-sm p-6 border bg-white space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-semibold text-gray-800">
            Platform Risk Score
          </h2>
          <span
            className={`px-3 py-1 text-xs font-semibold rounded-full text-white ${
              riskSeverity() === 'LOW'
                ? 'bg-green-500'
                : riskSeverity() === 'MEDIUM'
                ? 'bg-yellow-500'
                : 'bg-red-600'
            }`}
          >
            {riskSeverity()}
          </span>
        </div>

        <p className="text-4xl font-bold text-gray-900">
          <AnimatedNumber value={data.riskScore} />
        </p>

        <div className="w-full bg-gray-200 rounded-full h-3">
          <div
            className={`h-3 rounded-full ${riskColor()}`}
            style={{ width: `${riskPercent()}%` }}
          />
        </div>

        <p className="text-sm text-gray-600">
          Auto-refreshes every 30 seconds.
        </p>
      </div>

      {/* Risk Trend */}
      <div className="rounded-xl shadow-sm p-6 border bg-white">
        <h2 className="text-lg font-semibold mb-4 text-gray-800">
          Risk Trend (Over Time)
        </h2>

        {trend.length === 0 ? (
          <p className="text-sm text-gray-500">
            No trend data available yet.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" />
              <YAxis />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="risk_score"
                stroke="#ef4444"
                strokeWidth={3}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};

export default AdminCompliance;