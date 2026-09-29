import React, { useEffect, useState } from 'react';
import api from '../../services/api';

/**
 * Marketing agent commission leaderboard.
 *
 * Marketing agents only ever see their own numbers — the agent-facing endpoint is
 * hard-scoped to the signed-in agent. This view is the admin side: who opened which
 * accounts and what they have been paid.
 */
const MarketingAgentCommissionsPanel = () => {
  const [agents, setAgents] = useState([]);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    api
      .get('/super/marketing-agent-commissions')
      .then((res) => {
        if (!active) return;
        setAgents(res.data?.data?.agents || []);
        setConfig(res.data?.data?.config || null);
      })
      .catch((err) => {
        if (!active) return;
        setError(err.response?.data?.message || 'Could not load marketing commissions');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const money = (value) => `₦${Number(value || 0).toLocaleString()}`;

  return (
    <div className="rounded-xl border border-soft p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-gray-700">Marketing agent commissions</p>
        {config ? (
          <p className="text-xs text-gray-500">
            Tenant {money(config.tenantVerify)} verify + {money(config.tenantRegistrationPaid)} paid ·
            Landlord {money(config.landlordVerify)} verify + {money(config.landlordRegistrationPaid)} paid
            {config.enabled ? '' : ' · DISABLED'}
          </p>
        ) : null}
      </div>

      {loading ? (
        <p className="py-6 text-center text-sm text-gray-400">Loading…</p>
      ) : error ? (
        <p className="py-6 text-center text-sm text-red-600">{error}</p>
      ) : agents.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">
          No marketing agent commissions yet
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-soft text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Agent</th>
                <th className="px-3 py-2">Accounts opened</th>
                <th className="px-3 py-2">Qualified</th>
                <th className="px-3 py-2">Reversed</th>
                <th className="px-3 py-2">Total earned</th>
                <th className="px-3 py-2">Last activity</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((agent, index) => (
                <tr key={agent.agent_user_id || index} className="border-b border-soft last:border-0">
                  <td className="px-3 py-2 font-semibold text-indigo-700">{index + 1}</td>
                  <td className="px-3 py-2">
                    <div className="text-gray-800">{agent.agent_name || 'Unnamed agent'}</div>
                    <div className="text-xs text-gray-500">{agent.agent_email}</div>
                  </td>
                  <td className="px-3 py-2 text-gray-600">{agent.accounts_opened}</td>
                  <td className="px-3 py-2 text-gray-600">{agent.qualified_count}</td>
                  <td className="px-3 py-2 text-gray-600">{agent.reversed_count}</td>
                  <td className="px-3 py-2 font-semibold text-gray-900">
                    {money(agent.total_earned)}
                  </td>
                  <td className="px-3 py-2 text-gray-500">
                    {agent.last_activity
                      ? new Date(agent.last_activity).toLocaleDateString()
                      : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default MarketingAgentCommissionsPanel;
