import React, { useState } from "react";
import PaginationControls from "./PaginationControls";

const getPassportPhotoUrl = (rawUrl) => {
  if (!rawUrl) return "";

  const normalized = String(rawUrl).replace(/\\/g, "/").trim();

  if (/^https?:\/\//i.test(normalized)) {
    return normalized;
  }

  const apiBase = process.env.REACT_APP_API_URL || "/api";
  const serverOrigin = apiBase.startsWith("http")
    ? new URL(apiBase).origin
    : window.location.origin;

  const uploadsIndex = normalized.toLowerCase().indexOf("uploads/");
  const uploadPath =
    uploadsIndex >= 0
      ? normalized.slice(uploadsIndex)
      : normalized.replace(/^\/+/, "");

  return `${serverOrigin}/${uploadPath}`;
};

const VerificationsTab = ({
  verifications,
  verificationSearch,
  setVerificationSearch,
  verificationStatus,
  setVerificationStatus,
  verificationUserType,
  setVerificationUserType,
  verificationPagination,
  verificationPage,
  onVerificationPageChange,
  loadVerifications,
  verifyIdentity,
  rejectIdentity,
  deleteRejectedVerification,
  adminPerformance,
}) => {
  const [reviewDialog, setReviewDialog] = useState({
    open: false,
    verification: null,
    action: "",
    note: "",
  });
  const [reviewError, setReviewError] = useState("");

  const getReviewStatus = (verification) => {
    if (verification?.identity_verification_status) {
      return verification.identity_verification_status;
    }

    return verification?.identity_verified ? "verified" : "pending";
  };

  const openReviewDialog = (verification, action) => {
    setReviewError("");
    setReviewDialog({
      open: true,
      verification,
      action,
      note: "",
    });
  };

  const closeReviewDialog = () => {
    setReviewError("");
    setReviewDialog({
      open: false,
      verification: null,
      action: "",
      note: "",
    });
  };

  const submitReview = async () => {
    const { verification, action, note } = reviewDialog;

    if (!verification || !action) return;

    if ((action === "reject" || action === "delete") && !note.trim()) {
      setReviewError(action === "delete" ? "Delete reason is required." : "Rejection reason is required.");
      return;
    }

    if (action === "approve") {
      await verifyIdentity(verification.id, note);
    } else if (action === "reject") {
      await rejectIdentity(verification.id, note);
    } else if (action === "delete") {
      await deleteRejectedVerification(verification.id, note);
    }

    closeReviewDialog();
  };

  return (
    <div className="space-y-8 animate-fadeIn">

      {/* VERIFICATION SECTION */}

      <div className="rounded-xl2 border border-soft bg-white p-5 shadow-card transition hover:shadow-cardHover">

        <h3 className="text-lg font-semibold mb-4">
          Identity Verification
        </h3>

        {/* FILTER BAR */}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-5">

          <input
            className="rounded-lg border border-soft px-3 py-2 text-sm"
            placeholder="Search name, email, NIN, passport"
            value={verificationSearch}
            onChange={(e) => setVerificationSearch(e.target.value)}
          />

          <select
            className="rounded-lg border border-soft px-3 py-2 text-sm"
            value={verificationStatus}
            onChange={(e) => setVerificationStatus(e.target.value)}
          >
            <option value="pending">Pending</option>
            <option value="verified">Verified</option>
            <option value="rejected">Rejected</option>
            <option value="all">All</option>
          </select>

          <select
            className="rounded-lg border border-soft px-3 py-2 text-sm"
            value={verificationUserType}
            onChange={(e) => setVerificationUserType(e.target.value)}
          >
            <option value="all">All Roles</option>
            <option value="admin">Admins</option>
            <option value="landlord">Landlords</option>
            <option value="tenant">Tenants</option>
            <option value="agent">Agents</option>
            <option value="lawyer">Lawyers</option>
          </select>

          <button
            onClick={loadVerifications}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white transition-colors hover:bg-blue-700"
          >
            Apply Filters
          </button>

        </div>

        {/* RECORD COUNT */}

        <div className="text-sm text-gray-500 mb-3">
          {verificationPagination.total} records found
        </div>

        {/* TABLE */}

        <div className="overflow-x-auto">

          <table className="min-w-full text-sm">

            <thead className="bg-gray-50 text-gray-700">

              <tr>

                <th className="p-3 text-left">Name</th>
                <th className="p-3 text-left">Email</th>
                <th className="p-3 text-left">Role</th>
                <th className="p-3 text-left">Doc Type</th>
                <th className="p-3 text-left">Number</th>
                <th className="p-3 text-left">Status</th>
                <th className="p-3 text-left">Verified By</th>
                <th className="p-3 text-left">Verified At</th>
                <th className="p-3 text-left">Photo</th>
                <th className="p-3 text-center w-44">Actions</th>

              </tr>

            </thead>

            <tbody>

              {verifications.length === 0 && (

                <tr>
                  <td colSpan="10" className="text-center py-10 text-gray-500">
                    No verification records found for the selected filters.
                  </td>
                </tr>

              )}

              {verifications.map((v) => {

                const docType = (v.identity_document_type || "nin").toLowerCase();
                const reviewStatus = getReviewStatus(v);

                const docNumber =
                  docType === "passport"
                    ? v.international_passport_number
                    : v.nin;

                return (

                  <tr
                    key={v.id}
                    className="border-t border-soft hover:bg-gray-50 transition"
                  >

                    <td className="p-3 font-medium">
                      {v.full_name}
                    </td>

                    <td className="p-3 text-gray-600">
                      {v.email}
                    </td>

                    <td className="p-3 capitalize">
                      {v.user_type}
                    </td>

                    <td className="p-3 uppercase">
                      {docType}
                    </td>

                    <td className="p-3">
                      {docNumber || "-"}
                    </td>

                    <td className="p-3">

                      <span
                        className={`px-2 py-1 text-xs rounded-full
                          ${
                            reviewStatus === "verified"
                              ? "bg-green-100 text-green-700"
                              : reviewStatus === "rejected"
                                ? "bg-red-100 text-red-700"
                                : reviewStatus === "revalidation_required"
                                  ? "bg-amber-100 text-amber-800"
                                : "bg-yellow-100 text-yellow-700"
                          }`}
                      >
                        {reviewStatus === "verified"
                          ? "Verified"
                          : reviewStatus === "rejected"
                            ? "Rejected"
                            : reviewStatus === "revalidation_required"
                              ? "Revalidation Required"
                            : "Pending"}
                      </span>

                    </td>

                    <td className="p-3 text-gray-600">
                      {v.identity_verified_by_name || "-"}
                    </td>

                    <td className="p-3 text-gray-600">

                      {v.identity_verified_at
                        ? new Date(
                            v.identity_verified_at
                          ).toLocaleString()
                        : "-"}

                    </td>

                    <td className="p-3">

                      {v.passport_photo_url ? (
                        <a
                          href={getPassportPhotoUrl(v.passport_photo_url)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-600 hover:underline text-sm"
                        >
                          View
                        </a>
                      ) : (
                        "-"
                      )}

                    </td>

                    <td className="p-3">

                      <div className="flex justify-center gap-2">

                        {reviewStatus === "pending" && (

                          <>
                            <button
                              onClick={() => openReviewDialog(v, "approve")}
                              className="rounded-lg bg-green-600 px-2 py-1 text-xs text-white transition-colors hover:bg-green-700"
                            >
                              Approve
                            </button>

                            <button
                              onClick={() => openReviewDialog(v, "reject")}
                              className="rounded-lg bg-red-600 px-2 py-1 text-xs text-white transition-colors hover:bg-red-700"
                            >
                              Reject
                            </button>
                          </>

                        )}

                        {reviewStatus === "rejected" && (
                          <>
                            <button
                              onClick={() => openReviewDialog(v, "approve")}
                              className="rounded-lg bg-green-600 px-2 py-1 text-xs text-white transition-colors hover:bg-green-700"
                            >
                              Approve
                            </button>

                            <button
                              onClick={() => openReviewDialog(v, "delete")}
                              className="rounded-lg bg-gray-700 px-2 py-1 text-xs text-white transition-colors hover:bg-gray-800"
                            >
                              Delete
                            </button>
                          </>
                        )}

                      </div>

                      {v.verification_operations?.length ? (
                        <div className="mt-2 space-y-1 text-xs text-gray-500">
                          {v.verification_operations.slice(0, 2).map((operation) => (
                            <p key={operation.id} title={operation.note || operation.event_type}>
                              {operation.event_type.replace(/_/g, " ")} by {operation.actor_name || "Super admin"}
                            </p>
                          ))}
                        </div>
                      ) : null}

                    </td>

                  </tr>

                );

              })}

            </tbody>

          </table>

        </div>

        <PaginationControls
          currentPage={verificationPage}
          totalPages={verificationPagination.pages || 1}
          onPageChange={onVerificationPageChange}
          summary={`Page ${verificationPage} of ${verificationPagination.pages || 1}`}
        />

      </div>

      {reviewDialog.open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-xl border border-gray-200 bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-semibold text-gray-900">
                  {reviewDialog.action === "approve"
                    ? "Approve identity verification"
                    : reviewDialog.action === "reject"
                      ? "Reject identity verification"
                      : "Delete rejected verification"}
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  {reviewDialog.verification?.full_name} - {reviewDialog.verification?.email}
                </p>
              </div>
              <button
                type="button"
                onClick={closeReviewDialog}
                className="rounded-lg px-2 py-1 text-sm text-gray-500 hover:bg-gray-100"
              >
                Close
              </button>
            </div>

            <label className="mt-5 block text-sm font-medium text-gray-700">
              {reviewDialog.action === "approve"
                ? "Approval note"
                : reviewDialog.action === "reject"
                  ? "Rejection reason"
                  : "Delete reason"}
            </label>
            <textarea
              className="mt-2 h-32 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder={
                reviewDialog.action === "approve"
                  ? "Optional note for the verification record"
                  : reviewDialog.action === "reject"
                    ? "Explain why this identity document is being rejected"
                    : "Explain why this rejected verification record is being cleared"
              }
              value={reviewDialog.note}
              onChange={(event) =>
                setReviewDialog((prev) => ({ ...prev, note: event.target.value }))
              }
            />
            {reviewDialog.action !== "approve" ? (
              <p className="mt-2 text-xs text-gray-500">
                This reason is required and will be saved in the verification history.
              </p>
            ) : null}
            {reviewError ? (
              <p className="mt-2 text-sm font-medium text-red-600">{reviewError}</p>
            ) : null}

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={closeReviewDialog}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitReview}
                className={`rounded-lg px-4 py-2 text-sm font-medium text-white ${
                  reviewDialog.action === "approve"
                    ? "bg-green-600 hover:bg-green-700"
                    : reviewDialog.action === "reject"
                      ? "bg-red-600 hover:bg-red-700"
                      : "bg-gray-800 hover:bg-gray-900"
                }`}
              >
                {reviewDialog.action === "approve"
                  ? "Approve"
                  : reviewDialog.action === "reject"
                    ? "Reject"
                    : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}


      {/* ADMIN PERFORMANCE SECTION */}

      <div className="rounded-xl2 border border-soft bg-white p-5 shadow-card transition hover:shadow-cardHover">

        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold">
              Admin Performance Overview
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              Shows audit-logged actions per admin over the last 7 days
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">

          <table className="min-w-full text-sm">

            <thead className="bg-gray-50 text-gray-700">

                            <tr>
                <th className="p-3 text-left">Admin</th>
                <th className="p-3 text-left">Email</th>
                <th className="p-3 text-left">Status</th>
                <th className="p-3 text-left">Verified</th>
                <th className="p-3 text-left">Actions (7d)</th>
                <th className="p-3 text-left">Props (7d)</th>
                <th className="p-3 text-left">Apps (7d)</th>
                <th className="p-3 text-left">Reports (7d)</th>
                <th className="p-3 text-left">Last Activity</th>
              </tr>

            </thead>

            <tbody>

              {adminPerformance.length === 0 && (

                <tr>
                  <td colSpan="9" className="text-center py-10 text-gray-500">
                    No admin activity yet
                  </td>
                </tr>

              )}

                            {adminPerformance.map((a) => (

                <tr
                  key={a.id}
                  className="border-t border-soft hover:bg-gray-50 transition"
                >

                  <td className="p-3 font-medium">
                    {a.full_name}
                  </td>

                  <td className="p-3 text-gray-600">
                    {a.email}
                  </td>

                  <td className="p-3">

                    <span
                      className={`px-2 py-1 text-xs rounded-full
                        ${
                          a.is_active
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-200 text-gray-600"
                        }`}
                    >
                      {a.is_active ? "Active" : "Inactive"}
                    </span>

                  </td>

                  <td className="p-3">
                    {a.credentials_verified_count ?? 0}
                  </td>

                  <td className="p-3">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                      (a.actions_7d ?? 0) > 0
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}>
                      {a.actions_7d ?? 0}
                    </span>
                  </td>

                  <td className="p-3 text-xs text-gray-600">
                    {a.properties_approved_7d ?? 0}
                  </td>

                  <td className="p-3 text-xs text-gray-600">
                    {a.applications_processed_7d ?? 0}
                  </td>

                  <td className="p-3 text-xs text-gray-600">
                    {a.reports_resolved_7d ?? 0}
                  </td>

                  <td className="p-3 text-gray-600 text-xs">
                    {a.last_action_at
                      ? new Date(a.last_action_at).toLocaleDateString()
                      : a.last_verification_at
                        ? new Date(a.last_verification_at).toLocaleDateString()
                        : "No activity"}
                  </td>

                </tr>

              ))}

            </tbody>

          </table>

        </div>

      </div>

    </div>
  );
};

export default VerificationsTab;
