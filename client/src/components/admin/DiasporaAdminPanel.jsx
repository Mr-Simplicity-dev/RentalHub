import React, { useCallback, useEffect, useState } from "react";
import { FaGlobeAfrica, FaFlag, FaCheckCircle } from "react-icons/fa";
import { toast } from "react-toastify";
import api from "../../services/api";

const COUNTRIES = {
  NG: "Nigeria",
};

const countryLabel = (code) => {
  if (!code) return "—";
  return COUNTRIES[String(code).toUpperCase()] || String(code).toUpperCase();
};

const DiasporaAdminPanel = () => {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total_diaspora: 0, nigerian_funded_pending: 0, nigerian_funded_total: 0 });
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");
  const [dismissing, setDismissing] = useState(null);
  const [dismissNote, setDismissNote] = useState("");
  const [noteFor, setNoteFor] = useState(null);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get("/admin/diaspora/overview");
      setStats(res.data?.data?.stats || stats);
      setUsers(res.data?.data?.users || []);
    } catch (err) {
      setError(err.response?.data?.message || "Unable to load diaspora overview");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const dismissFlag = async (userId) => {
    setDismissing(userId);
    try {
      await api.post(`/admin/diaspora/users/${userId}/dismiss`, {
        notes: dismissNote,
      });
      toast.success("Review flag dismissed");
      setNoteFor(null);
      setDismissNote("");
      await loadOverview();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to dismiss flag");
    } finally {
      setDismissing(null);
    }
  };

  return (
    <div className="bg-white border border-soft rounded-xl2 shadow-card p-6 animate-fadeIn">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <FaGlobeAfrica className="text-indigo-600" /> Diaspora Registrations
          </h3>
          <p className="text-sm text-gray-500">
            Review diaspora accounts and Nigerian-funded payment flags.
          </p>
        </div>
        <button
          type="button"
          onClick={loadOverview}
          className="rounded-lg border border-soft px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-soft bg-gray-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Total Diaspora Users</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{stats.total_diaspora}</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Nigerian-Funded (Total)</p>
          <p className="mt-1 text-2xl font-bold text-amber-800">{stats.nigerian_funded_total}</p>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-red-700">Pending Review</p>
          <p className="mt-1 text-2xl font-bold text-red-800">{stats.nigerian_funded_pending}</p>
        </div>
      </div>

      {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {loading ? (
        <div className="py-12 text-center text-sm text-gray-400">Loading diaspora registrations…</div>
      ) : users.length === 0 ? (
        <div className="py-12 text-center text-sm text-gray-400">No diaspora registrations yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">User</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Diaspora Country</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Target State</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Card Country</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Card Brand</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Verification</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Review</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {users.map((u) => {
                const isNgFlagged = String(u.billing_country || "").toUpperCase() === "NG";
                return (
                  <tr key={u.id} className={u.review_flag ? "bg-red-50/60" : ""}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{u.full_name}</p>
                      <p className="text-xs text-gray-500">{u.email}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{countryLabel(u.diaspora_country)}</td>
                    <td className="px-4 py-3 text-gray-700">{u.preferred_state_name || "—"}</td>
                    <td className="px-4 py-3 text-gray-700">{countryLabel(u.billing_country)}</td>
                    <td className="px-4 py-3 text-gray-700">{u.card_brand || "—"}</td>
                    <td className="px-4 py-3">
                      {u.identity_verified ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                          <FaCheckCircle /> Verified
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">
                          {u.identity_verification_status || "Unverified"}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {u.review_flag ? (
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                            <FaFlag /> Nigerian-funded
                          </span>
                          <button
                            type="button"
                            onClick={() => setNoteFor(u)}
                            className="rounded-md bg-gray-800 px-2 py-1 text-xs font-semibold text-white hover:bg-gray-700"
                          >
                            Review
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-500">
                          {u.reviewed ? "Reviewed" : "OK"}
                          {u.diaspora_review_notes ? ` — ${u.diaspora_review_notes}` : ""}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Dismiss dialog */}
      {noteFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-gray-900">Review {noteFor.full_name}</h3>
            <p className="mt-1 text-sm text-gray-600">
              This diaspora registration was paid for with a Nigerian-issued card
              ({countryLabel(noteFor.billing_country)} · {noteFor.card_brand || "unknown"}).
              Confirm the review and add a note.
            </p>
            <textarea
              value={dismissNote}
              onChange={(e) => setDismissNote(e.target.value)}
              rows={3}
              placeholder="Review notes (e.g. verified the applicant is genuinely diaspora)"
              className="mt-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
            <div className="mt-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setNoteFor(null);
                  setDismissNote("");
                }}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={dismissing === noteFor.id}
                onClick={() => dismissFlag(noteFor.id)}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {dismissing === noteFor.id ? "Saving…" : "Mark Reviewed"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DiasporaAdminPanel;
