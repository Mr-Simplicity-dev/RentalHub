import React, { useState } from "react";
import api from "../../services/api";

const FraudTab = ({ fraud, loadFraud }) => {
  const [resolutionDialog, setResolutionDialog] = useState({
    open: false,
    flag: null,
    note: "",
    error: "",
    loading: false,
  });

  const openResolutionDialog = (flag) => {
    setResolutionDialog({
      open: true,
      flag,
      note: "",
      error: "",
      loading: false,
    });
  };

  const closeResolutionDialog = () => {
    setResolutionDialog({
      open: false,
      flag: null,
      note: "",
      error: "",
      loading: false,
    });
  };

  const resolveFraud = async () => {
    const note = resolutionDialog.note.trim();

    if (!note) {
      setResolutionDialog((prev) => ({
        ...prev,
        error: "A fraud resolution note is required.",
      }));
      return;
    }

    try {
      setResolutionDialog((prev) => ({
        ...prev,
        loading: true,
        error: "",
      }));

      await api.patch(`/super/fraud/${resolutionDialog.flag.id}/resolve`, {
        note,
      });

      await loadFraud();
      closeResolutionDialog();
    } catch (err) {
      setResolutionDialog((prev) => ({
        ...prev,
        loading: false,
        error: err.response?.data?.message || "Failed to resolve fraud flag.",
      }));
    }
  };

  const getScoreStyle = (score) => {

    if (score >= 80)
      return "bg-red-100 text-red-700";

    if (score >= 50)
      return "bg-yellow-100 text-yellow-700";

    return "bg-gray-100 text-gray-700";
  };

  return (
    <>
    <div className="animate-fadeIn rounded-xl2 border border-soft bg-white shadow-card transition hover:shadow-cardHover overflow-x-auto">

      <table className="min-w-full text-sm">

        <thead className="bg-gray-50 text-gray-700">

          <tr>

            <th className="p-3 text-left">Entity</th>
            <th className="p-3 text-left">ID</th>
            <th className="p-3 text-left">Rule Triggered</th>
            <th className="p-3 text-left">Risk Score</th>
            <th className="p-3 text-left">Time</th>
            <th className="p-3 text-center w-40">Action</th>

          </tr>

        </thead>

        <tbody>

          {fraud.length === 0 && (

            <tr>
              <td
                colSpan="6"
                className="text-center py-10 text-gray-500"
              >
                No fraud alerts detected
              </td>
            </tr>

          )}

          {fraud.map((f) => (

            <tr
              key={f.id}
              className="border-t border-soft hover:bg-gray-50 transition"
            >

              {/* ENTITY TYPE */}

              <td className="p-3 capitalize font-medium">
                {f.entity_type}
              </td>

              {/* ENTITY ID */}

              <td className="p-3 text-gray-600">
                #{f.entity_id}
              </td>

              {/* RULE */}

              <td className="p-3 text-gray-700">
                {f.rule}
              </td>

              {/* SCORE */}

              <td className="p-3">

                <span
                  className={`px-2 py-1 text-xs rounded-full ${getScoreStyle(
                    f.score
                  )}`}
                >
                  {f.score}
                </span>

              </td>

              {/* TIME */}

              <td className="p-3 text-gray-500">
                {new Date(f.created_at).toLocaleString()}
              </td>

              {/* ACTION */}

              <td className="p-3">

                <div className="flex justify-center">

                  <button
                    onClick={() => openResolutionDialog(f)}
                    className="rounded-lg bg-purple-600 px-3 py-1 text-xs text-white transition-colors hover:bg-purple-700"
                  >
                    Resolve
                  </button>

                </div>

                {Array.isArray(f.operations) && f.operations.length > 0 && (
                  <div className="mt-2 space-y-1 text-xs text-gray-500">
                    {f.operations.slice(0, 2).map((operation) => (
                      <p
                        key={operation.id}
                        className="max-w-[190px] truncate"
                        title={operation.note || operation.event_type}
                      >
                        {String(operation.event_type || "").replace(/_/g, " ")} by{" "}
                        {operation.actor_name || "Super admin"}
                      </p>
                    ))}
                  </div>
                )}

              </td>

            </tr>

          ))}

        </tbody>

      </table>

    </div>
    {resolutionDialog.open && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="w-full max-w-md rounded-xl2 bg-white shadow-card">
          <div className="border-b border-soft px-6 py-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Resolve fraud flag
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              {resolutionDialog.flag?.entity_type} #{resolutionDialog.flag?.entity_id} - risk score {resolutionDialog.flag?.score}
            </p>
          </div>

          <div className="space-y-3 px-6 py-4">
            <label className="block text-sm font-medium text-gray-700">
              Investigation note
            </label>
            <textarea
              value={resolutionDialog.note}
              onChange={(event) =>
                setResolutionDialog((prev) => ({
                  ...prev,
                  note: event.target.value,
                  error: "",
                }))
              }
              rows={4}
              className="w-full rounded-lg border border-soft px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              placeholder="Explain what was checked and why this alert can be resolved"
            />
            <p className="text-xs text-gray-500">
              This note is saved in fraud governance history.
            </p>

            {resolutionDialog.error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {resolutionDialog.error}
              </p>
            )}
          </div>

          <div className="flex justify-end gap-3 border-t border-soft px-6 py-4">
            <button
              type="button"
              onClick={closeResolutionDialog}
              className="rounded-lg border border-soft px-4 py-2 text-sm text-gray-700 transition hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={resolveFraud}
              disabled={resolutionDialog.loading}
              className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-60"
            >
              {resolutionDialog.loading ? "Resolving..." : "Confirm"}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
};

export default FraudTab;
