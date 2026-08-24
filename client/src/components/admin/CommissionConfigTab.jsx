import React, { useState, useEffect, useCallback } from "react";
import { toast } from "react-toastify";
import api from "../../services/api";

const CATEGORIES = [
  {
    label: "Platform Fee Rates",
    prefix: "_platform_fee_rate",
    keys: ["rent_payment", "tenant_subscription", "tenant_multiple_property_subscription", "landlord_subscription", "landlord_listing", "wallet_funding", "property_unlock"],
    suffix: "platform_fee_rate",
  },
  {
    label: "Admin Commission Shares (% of platform fee)",
    prefix: "_admin_share",
    keys: ["rent_payment", "tenant_subscription", "tenant_multiple_property_subscription", "landlord_subscription", "landlord_listing", "wallet_funding", "property_unlock"],
    suffix: "admin_share",
  },
  {
    label: "Super Admin Commission Shares (% of platform fee)",
    prefix: "_super_admin_share",
    keys: ["rent_payment", "tenant_subscription", "tenant_multiple_property_subscription", "landlord_subscription", "landlord_listing", "wallet_funding", "property_unlock"],
    suffix: "super_admin_share",
  },
  {
    label: "General Settings",
    keys: [
      { key: "rent_wallet_platform_fee_rate", label: "Rent Wallet Platform Fee Rate" },
      { key: "rent_wallet_clearing_days", label: "Rent Wallet Clearing Days" },
      { key: "min_admin_withdrawal", label: "Min Admin Withdrawal (NGN)" },
      { key: "min_wallet_funding", label: "Min Wallet Funding (NGN)" },
      { key: "property_unlock_price", label: "Property Unlock Price (NGN)" },
      { key: "monthly_subscription_base", label: "Monthly Subscription Base (NGN)" },
      { key: "multiple_property_subscription", label: "Multiple Property Subscription (NGN)" },
      { key: "property_inspection_fee", label: "Property Inspection Fee (NGN)" },
    ],
  },
  {
    label: "Lawyer Access Fee Distribution (NGN)",
    keys: [
      { key: "lawyer_access_fee_total", label: "Total Fee" },
      { key: "lawyer_access_fee_assigned_lawyer", label: "Assigned Lawyer" },
      { key: "lawyer_access_fee_assigned_agent", label: "Assigned Agent" },
      { key: "lawyer_access_fee_super_admin_base", label: "Super Admin Base" },
      { key: "lawyer_access_fee_state_admin", label: "State Admin" },
      { key: "lawyer_access_fee_state_financial_admin", label: "State Financial Admin" },
      { key: "lawyer_access_fee_state_support_admin", label: "State Support Admin" },
      { key: "lawyer_access_fee_state_lawyer_admin", label: "State Lawyer Admin" },
      { key: "lawyer_access_fee_super_financial_admin", label: "Super Financial Admin" },
      { key: "lawyer_access_fee_super_support_admin", label: "Super Support Admin" },
      { key: "lawyer_access_fee_super_lawyer_admin", label: "Super Lawyer Admin" },
      { key: "lawyer_access_fee_fumigation_admin", label: "Fumigation Admin" },
      { key: "lawyer_access_fee_transportation_admin", label: "Transportation Admin" },
    ],
  },
  {
    label: "Agent Access Fee Distribution (NGN)",
    keys: [
      { key: "agent_access_fee_total", label: "Total Fee" },
      { key: "agent_access_fee_assigned_agent", label: "Assigned Agent" },
      { key: "agent_access_fee_assigned_lawyer", label: "Assigned Lawyer" },
      { key: "agent_access_fee_super_admin", label: "Super Admin" },
      { key: "agent_access_fee_state_admin", label: "State Admin" },
    ],
  },
  {
    label: "Suspended Admin Redistribution",
    keys: [
      { key: "suspended_admin_redistribution_pct", label: "Redistribution % (decimal, e.g. 0.60 = 60%)" },
    ],
  },
  {
    label: "Performance Bonuses (NGN)",
    keys: [
      { key: "perf_bonus_volume_1m", label: "Volume Bonus at N1M" },
      { key: "perf_bonus_volume_5m", label: "Volume Bonus at N5M" },
      { key: "perf_bonus_volume_10m", label: "Volume Bonus at N10M" },
      { key: "perf_bonus_growth_50", label: "Growth Bonus at 50 users" },
      { key: "perf_bonus_growth_100", label: "Growth Bonus at 100 users" },
      { key: "perf_bonus_growth_200", label: "Growth Bonus at 200 users" },
    ],
  },
];

export default function CommissionConfigTab() {
  const [config, setConfig] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState({});

  const loadConfig = useCallback(async () => {
    try {
      const res = await api.get("/financial-admin/commission-config");
      if (res.data?.success) {
        setConfig(res.data.data);
      }
    } catch (err) {
      toast.error("Failed to load commission config");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  const handleChange = (key, value) => {
    setDirty((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await api.put("/financial-admin/commission-config", { updates: dirty });
      if (res.data?.success) {
        toast.success("Commission config updated");
        setDirty({});
        await loadConfig();
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-6 text-gray-400">Loading commission config...</div>;

  const getValue = (key) => {
    if (dirty[key] !== undefined) return dirty[key];
    if (config[key]) return String(config[key].value);
    return "";
  };

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-white">Commission Configuration</h2>
        {Object.keys(dirty).length > 0 && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50 text-sm"
          >
            {saving ? "Saving..." : `Save ${Object.keys(dirty).length} change(s)`}
          </button>
        )}
      </div>

      {CATEGORIES.map((cat) => (
        <div key={cat.label} className="mb-8">
          <h3 className="text-lg font-semibold text-gray-300 mb-3 border-b border-gray-700 pb-2">{cat.label}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {cat.keys.map((item) => {
              const key = typeof item === "string" ? `${item}_${cat.suffix}` : item.key;
              const label = typeof item === "string" ? item.replace(/_/g, " ") : item.label;
              const val = getValue(key);
              const isDirty = dirty[key] !== undefined;
              return (
                <div key={key} className="flex flex-col">
                  <label className="text-xs text-gray-400 mb-1 capitalize">{label}</label>
                  <input
                    type="text"
                    value={val}
                    onChange={(e) => handleChange(key, e.target.value)}
                    className={`px-3 py-2 rounded bg-gray-800 border text-sm text-white focus:outline-none focus:ring-1 ${isDirty ? "border-yellow-500 ring-yellow-500" : "border-gray-600 focus:border-indigo-500 focus:ring-indigo-500"}`}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {Object.keys(dirty).length > 0 && (
        <div className="sticky bottom-4 flex justify-center">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 font-semibold shadow-lg"
          >
            {saving ? "Saving..." : `Save All Changes (${Object.keys(dirty).length})`}
          </button>
        </div>
      )}
    </div>
  );
}
