import React, { useCallback, useEffect, useState } from "react";
import api from "../../services/api";
import { toast } from "react-toastify";

export default function SFAPermissionsTab() {
  const [sfas, setSfas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get("/super/sfa-permissions");
      setSfas(res.data.data || []);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to load SFA list");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const togglePerm = async (sfa, field) => {
    const updated = { ...sfa, [field]: !sfa[field] };
    setSfas((prev) => prev.map((s) => (s.id === sfa.id ? updated : s)));

    try {
      setSavingId(sfa.id);
      await api.patch(`/super/sfa-permissions/${sfa.id}`, {
        can_approve_admins: field === "can_approve_admins" ? updated.can_approve_admins : sfa.can_approve_admins,
        can_direct_withdraw: field === "can_direct_withdraw" ? updated.can_direct_withdraw : sfa.can_direct_withdraw,
      });
      toast.success("Permission updated");
    } catch (err) {
      // Revert on failure
      setSfas((prev) => prev.map((s) => (s.id === sfa.id ? sfa : s)));
      toast.error(err.response?.data?.message || "Failed to update permission");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-800">Super Financial Admin Delegation</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            Grant Super Financial Admins permission to approve other admins and/or withdraw their own
            earnings directly without a request queue.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="text-sm text-indigo-600 hover:underline disabled:opacity-50"
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {sfas.length === 0 && !loading ? (
        <div className="rounded-xl border border-dashed border-gray-300 py-10 text-center text-sm text-gray-500">
          No approved Super Financial Admins found.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500 tracking-wider">
              <tr>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Email</th>
                <th className="px-4 py-3 text-center">Can Approve Admins</th>
                <th className="px-4 py-3 text-center">Can Withdraw Directly</th>
                <th className="px-4 py-3 text-left">Last Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {sfas.map((sfa) => {
                const isBusy = savingId === sfa.id;
                return (
                  <tr key={sfa.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800">{sfa.full_name}</td>
                    <td className="px-4 py-3 text-gray-600">{sfa.email}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => togglePerm(sfa, "can_approve_admins")}
                        disabled={isBusy}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                          sfa.can_approve_admins ? "bg-green-500" : "bg-gray-300"
                        } disabled:opacity-50`}
                        aria-label="Toggle can approve admins"
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                            sfa.can_approve_admins ? "translate-x-6" : "translate-x-1"
                          }`}
                        />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => togglePerm(sfa, "can_direct_withdraw")}
                        disabled={isBusy}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                          sfa.can_direct_withdraw ? "bg-green-500" : "bg-gray-300"
                        } disabled:opacity-50`}
                        aria-label="Toggle can direct withdraw"
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                            sfa.can_direct_withdraw ? "translate-x-6" : "translate-x-1"
                          }`}
                        />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {sfa.granted_at
                        ? new Date(sfa.granted_at).toLocaleDateString()
                        : "Never set"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
