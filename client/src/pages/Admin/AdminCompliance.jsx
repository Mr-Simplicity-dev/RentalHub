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

const StatCard = ({ title, value, highlight = '' }) => (
  <div className={`rounded-xl shadow-sm p-5 border bg-white ${highlight}`}>
    <h3 className="text-sm text-gray-500 mb-2">{title}</h3>
    <p className="text-2xl font-bold text-gray-800">{value}</p>
  </div>
);

const AdminCompliance = () => {
  const [data, setData] = useState(null);
  const [trend, setTrend] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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

    loadAll();
  }, []);

  const riskColor = () => {
    if (!data) return '';
    if (data.riskScore <= 5) return 'bg-green-100 border-green-400';
    if (data.riskScore <= 12) return 'bg-yellow-100 border-yellow-400';
    return 'bg-red-100 border-red-400';
  };

  if (loading) {
    return (
      <div className="p-6 text-gray-600">
        Loading compliance dashboard...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 text-red-600">
        Failed to load compliance data.
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8">
      <h1 className="text-2xl font-bold text-gray-800">
        Compliance & Risk Overview
      </h1>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-5">
        <StatCard title="Open Disputes" value={data.totalOpen} />
        <StatCard title="Escalated" value={data.escalated} />
        <StatCard title="Aging (>14d)" value={data.aging} />
        <StatCard title="No Evidence" value={data.withoutEvidence} />
        <StatCard title="Lawyer Activity" value={data.lawyerActivity} />
        <StatCard
          title="Ledger"
          value={data.ledgerIntegrity ? 'Intact' : 'Compromised'}
          highlight={
            data.ledgerIntegrity
              ? 'border-green-400'
              : 'border-red-500 bg-red-50'
          }
        />
      </div>

      {/* Risk Score */}
      <div
        className={`rounded-xl shadow-sm p-6 border bg-white ${riskColor()}`}
      >
        <h2 className="text-lg font-semibold mb-2 text-gray-800">
          Platform Risk Score
        </h2>
        <p className="text-4xl font-bold text-gray-900">
          {data.riskScore}
        </p>
        <p className="text-sm mt-2 text-gray-600">
          Calculated from aging disputes, escalations, and missing evidence.
        </p>
      </div>

      {/* Risk Trend Chart */}
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