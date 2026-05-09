import React, { useState } from "react";
import api from "../../services/api";
import { toast } from "react-toastify";

const UsersTab = ({
  users,
  selectedUsers,
  setSelectedUsers,
  bulkUsers,
  verifyIdentity,
  promoteUser,
  banUser,
  unbanUser,
  deleteUser,
}) => {
  const [selectedUserForModal, setSelectedUserForModal] = useState(null);
  const [sendingNotification, setSendingNotification] = useState(false);

  const notifyUser = async (user) => {
    if (sendingNotification) return;
    setSendingNotification(true);
    try {
      const steps = [];
      if (!user.email_verified) steps.push("Verify your email address");
      if (!user.phone_verified) steps.push("Verify your phone number");
      if (!user.passport_photo_url) steps.push("Upload your identity document (passport photo)");
      if (!user.nin && !user.international_passport_number) steps.push("Provide your NIN or International Passport number");

      const message = steps.length > 0
        ? `You have pending verification steps:\n${steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n\nPlease complete these steps to proceed with your account verification.`
        : "Your account verification is complete. No action needed at this time.";

      await api.post(`/super/users/${user.id}/verification-reminder`, { message });
      toast.success("Verification reminder sent successfully. The user will see it in their notification bell.");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to send verification reminder");
    } finally {
      setSendingNotification(false);
    }
  };

  const visibleUsers = users.filter((u) =>
    ["tenant", "landlord"].includes(u.user_type)
  );

  const toggleUser = (id) => {
    setSelectedUsers((prev) =>
      prev.includes(id)
        ? prev.filter((i) => i !== id)
        : [...prev, id]
    );
  };

  const toggleAll = (checked) => {
    if (checked) {
      const ids = visibleUsers
        .map((u) => u.id);

      setSelectedUsers(ids);
    } else {
      setSelectedUsers([]);
    }
  };

  return (
    <div className="space-y-4 animate-fadeIn">

      {/* BULK ACTION BAR */}

      {selectedUsers.length > 0 && (
        <div className="flex flex-wrap justify-center gap-3 rounded-xl2 border border-soft bg-white p-3 shadow-card transition hover:shadow-cardHover">

          <span className="text-sm text-gray-600">
            {selectedUsers.length} selected
          </span>

          <button
            onClick={() => bulkUsers("ban")}
            className="rounded-lg bg-red-600 px-3 py-1 text-sm text-white transition-colors hover:bg-red-700"
          >
            Ban
          </button>

          <button
            onClick={() => bulkUsers("verify")}
            className="rounded-lg bg-green-600 px-3 py-1 text-sm text-white transition-colors hover:bg-green-700"
          >
            Verify
          </button>

          <button
            onClick={() => bulkUsers("promote")}
            className="rounded-lg bg-blue-600 px-3 py-1 text-sm text-white transition-colors hover:bg-blue-700"
          >
            Make Admin
          </button>

        </div>
      )}

      {/* TABLE */}

      <div className="rounded-xl2 border border-soft bg-white shadow-card transition hover:shadow-cardHover overflow-x-auto">

        <table className="min-w-full text-sm">

          <thead className="bg-gray-50 text-gray-700">

            <tr>

              <th className="p-3 w-10">
                <input
                  type="checkbox"
                  onChange={(e) => toggleAll(e.target.checked)}
                />
              </th>

              <th className="p-3 text-left">Name</th>
              <th className="p-3 text-left">Email</th>
              <th className="p-3 text-left">Role</th>
              <th className="p-3 text-left">Active</th>
              <th className="p-3 text-left">Verified</th>
              <th className="p-3 text-left">Verified By</th>
              <th className="p-3 text-left">Work Count</th>

              <th className="p-3 text-center w-56">
                Actions
              </th>

            </tr>

          </thead>

          <tbody>

            {visibleUsers.length === 0 && (
              <tr>
                <td
                  colSpan="9"
                  className="text-center py-10 text-gray-500"
                >
                  No users found
                </td>
              </tr>
            )}

            {visibleUsers.map((u) => (

              <tr
                key={u.id}
                className="border-t border-soft hover:bg-gray-50 transition"
              >

                <td className="p-3">
                  <input
                    type="checkbox"
                    disabled={u.user_type === "super_admin"}
                    checked={selectedUsers.includes(u.id)}
                    onChange={() => toggleUser(u.id)}
                  />
                </td>

                <td className="p-3 font-medium">
                  {u.full_name}
                </td>

                                <td className="p-3">
                  <button
                    onClick={() => setSelectedUserForModal(u)}
                    className="text-blue-600 hover:text-blue-800 hover:underline transition text-left"
                  >
                    {u.email}
                  </button>
                </td>

                <td className="p-3 capitalize">
                  {u.user_type}
                </td>

                <td className="p-3">

                  <span
                    className={`px-2 py-1 text-xs rounded-full
                      ${
                        u.is_active
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-200 text-gray-600"
                      }`}
                  >
                    {u.is_active ? "Active" : "Inactive"}
                  </span>

                </td>

                <td className="p-3">

                  <span
                    className={`px-2 py-1 text-xs rounded-full
                      ${
                        u.identity_verified
                          ? "bg-green-100 text-green-700"
                          : "bg-yellow-100 text-yellow-700"
                      }`}
                  >
                    {u.identity_verified ? "Verified" : "Pending"}
                  </span>

                </td>

                <td className="p-3 text-gray-600">
                  {u.identity_verified_by_name || "-"}
                </td>

                <td className="p-3">
                  {u.credentials_verified_count ?? 0}
                </td>

                {/* ACTIONS */}

                <td className="p-3">

                  <div className="flex justify-center flex-wrap gap-2">

                    {!u.identity_verified &&
                      u.user_type !== "super_admin" && (
                        <button
                          onClick={() => verifyIdentity(u.id)}
                          className="rounded-lg bg-green-600 px-2 py-1 text-xs text-white transition-colors hover:bg-green-700"
                        >
                          Verify
                        </button>
                      )}

                    {!["admin", "super_admin"].includes(
                      u.user_type
                    ) && (
                      <button
                        onClick={() => promoteUser(u.id)}
                        className="rounded-lg bg-blue-600 px-2 py-1 text-xs text-white transition-colors hover:bg-blue-700"
                      >
                        Promote
                      </button>
                    )}

                    {u.user_type !== "super_admin" && u.is_active && (
                      <button
                        onClick={() => banUser(u.id)}
                        className="rounded-lg bg-red-600 px-2 py-1 text-xs text-white transition-colors hover:bg-red-700"
                      >
                        Ban
                      </button>
                    )}

                    {!u.is_active && u.user_type !== "super_admin" && (
                      <button
                        onClick={() => unbanUser(u.id)}
                        className="rounded-lg bg-indigo-600 px-2 py-1 text-xs text-white transition-colors hover:bg-indigo-700"
                      >
                        Unban
                      </button>
                    )}

                    {u.user_type !== "super_admin" && (
                      <button
                        onClick={() => deleteUser(u.id)}
                        className="rounded-lg bg-gray-700 px-2 py-1 text-xs text-white transition-colors hover:bg-gray-800"
                      >
                        Delete
                      </button>
                    )}

                  </div>

                </td>

              </tr>

            ))}

          </tbody>

        </table>

            </div>

            {/* USER DETAIL MODAL */}
      {selectedUserForModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setSelectedUserForModal(null)}
        >
          <div
            className="bg-white rounded-xl2 border border-soft shadow-card max-w-lg w-full mx-4 max-h-[85vh] overflow-y-auto animate-fadeIn"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-soft px-6 py-4">
              <h3 className="text-lg font-semibold text-gray-800">
                User Verification Details
              </h3>
              <button
                onClick={() => setSelectedUserForModal(null)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                &times;
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-4 space-y-5">

              {/* Basic Info */}
              <div className="space-y-2">
                <p className="text-sm text-gray-500">
                  <span className="font-medium text-gray-700">Name:</span>{" "}
                  {selectedUserForModal.full_name}
                </p>
                <p className="text-sm text-gray-500">
                  <span className="font-medium text-gray-700">Email:</span>{" "}
                  {selectedUserForModal.email}
                </p>
                <p className="text-sm text-gray-500">
                  <span className="font-medium text-gray-700">Role:</span>{" "}
                  <span className="capitalize">{selectedUserForModal.user_type}</span>
                </p>
              </div>

              <hr className="border-soft" />

              {/* Completed Steps */}
              <div>
                <h4 className="text-sm font-semibold text-green-700 mb-3 flex items-center gap-2">
                  <span>✅</span> Completed Steps
                </h4>
                <div className="space-y-2 text-sm">
                  {selectedUserForModal.email_verified ? (
                    <div className="flex items-center gap-2 text-green-700">
                      <span>✅</span>
                      <span>Email verified</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-gray-400 line-through">
                      <span>⬜</span>
                      <span>Email verified</span>
                      <span className="text-xs text-gray-400 italic font-normal">— pending</span>
                    </div>
                  )}
                  {selectedUserForModal.phone_verified ? (
                    <div className="flex items-center gap-2 text-green-700">
                      <span>✅</span>
                      <span>Phone verified</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-gray-400 line-through">
                      <span>⬜</span>
                      <span>Phone verified</span>
                      <span className="text-xs text-gray-400 italic font-normal">— pending</span>
                    </div>
                  )}
                  {selectedUserForModal.passport_photo_url ? (
                    <div className="flex items-center gap-2 text-green-700">
                      <span>✅</span>
                      <span>Identity document uploaded</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-gray-400 line-through">
                      <span>⬜</span>
                      <span>Identity document uploaded</span>
                      <span className="text-xs text-gray-400 italic font-normal">— missing</span>
                    </div>
                  )}
                  {selectedUserForModal.nin || selectedUserForModal.international_passport_number ? (
                    <div className="flex items-center gap-2 text-green-700">
                      <span>✅</span>
                      <span>Identity number provided (NIN or Passport)</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-gray-400 line-through">
                      <span>⬜</span>
                      <span>Identity number provided (NIN or Passport)</span>
                      <span className="text-xs text-gray-400 italic font-normal">— missing</span>
                    </div>
                  )}
                  {selectedUserForModal.identity_verified ? (
                    <div className="flex items-center gap-2 text-green-700">
                      <span>✅</span>
                      <span>Identity verified by admin</span>
                      {selectedUserForModal.identity_verified_by_name && (
                        <span className="text-xs text-gray-500">— by {selectedUserForModal.identity_verified_by_name}</span>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-gray-400 line-through">
                      <span>⬜</span>
                      <span>Identity verified by admin</span>
                      <span className="text-xs text-gray-400 italic font-normal">— not yet reviewed</span>
                    </div>
                  )}
                </div>
              </div>

              <hr className="border-soft" />

              {/* Remaining Steps Required */}
              <div>
                <h4 className="text-sm font-semibold text-amber-700 mb-3 flex items-center gap-2">
                  <span>📋</span> Steps Still Required
                </h4>
                <div className="space-y-2 text-sm">
                  {!selectedUserForModal.email_verified && (
                    <div className="flex items-center gap-2 text-amber-700">
                      <span>❌</span>
                      <span>Verify email address</span>
                    </div>
                  )}
                  {!selectedUserForModal.phone_verified && (
                    <div className="flex items-center gap-2 text-amber-700">
                      <span>❌</span>
                      <span>Verify phone number</span>
                    </div>
                  )}
                  {!selectedUserForModal.passport_photo_url && (
                    <div className="flex items-center gap-2 text-amber-700">
                      <span>❌</span>
                      <span>Upload identity document (passport photo)</span>
                    </div>
                  )}
                  {!selectedUserForModal.nin && !selectedUserForModal.international_passport_number && (
                    <div className="flex items-center gap-2 text-amber-700">
                      <span>❌</span>
                      <span>Provide NIN or International Passport number</span>
                    </div>
                  )}
                  {selectedUserForModal.email_verified &&
                    selectedUserForModal.phone_verified &&
                    selectedUserForModal.passport_photo_url &&
                    (selectedUserForModal.nin || selectedUserForModal.international_passport_number) &&
                    !selectedUserForModal.identity_verified && (
                    <div className="flex items-center gap-2 text-amber-700">
                      <span>⏳</span>
                      <span>Awaiting admin identity verification review</span>
                    </div>
                  )}
                  {selectedUserForModal.identity_verified && (
                    <div className="flex items-center gap-2 text-green-700">
                      <span>✅</span>
                      <span>All required steps completed — user fully verified</span>
                    </div>
                  )}
                </div>
              </div>

              <hr className="border-soft" />

              {/* NIN Status (Optional — Currently Disabled) */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                  <span>ℹ️</span> NIN Verification
                </h4>
                <p className="text-xs text-gray-500 mb-2">
                  NIN verification is currently <span className="font-semibold text-gray-600">disabled</span> in the system.
                  It will become mandatory once enabled.
                </p>
                <div className="space-y-2 text-sm bg-gray-50 rounded-lg p-3 border border-soft">
                  <div className="flex items-center gap-2">
                    {selectedUserForModal.nin ? (
                      <span className="text-green-600">✅</span>
                    ) : (
                      <span className="text-gray-400">⬜</span>
                    )}
                    <span className="text-gray-600">
                      NIN number on record{selectedUserForModal.nin ? ":" : " — not provided"}
                    </span>
                    {selectedUserForModal.nin && (
                      <span className="text-xs text-gray-500 font-mono bg-white px-2 py-0.5 rounded border">
                        {selectedUserForModal.nin}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedUserForModal.nin_verified ? (
                      <span className="text-green-600">✅</span>
                    ) : (
                      <span className="text-gray-400">⬜</span>
                    )}
                    <span className="text-gray-600">
                      NIN verified by NIMC
                      {!selectedUserForModal.nin_verified && selectedUserForModal.nin
                        ? " — submitted but not yet verified"
                        : !selectedUserForModal.nin
                        ? " — not applicable (no NIN on record)"
                        : ""}
                    </span>
                  </div>
                </div>
              </div>

              <hr className="border-soft" />

              {/* Identity Verification Status */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-2">
                  Admin Identity Review Status
                </h4>
                <div className="space-y-2">
                  <span
                    className={`inline-block px-3 py-1 text-xs font-medium rounded-full ${
                      selectedUserForModal.identity_verification_status === "verified"
                        ? "bg-green-100 text-green-700"
                        : selectedUserForModal.identity_verification_status === "pending"
                        ? "bg-yellow-100 text-yellow-700"
                        : selectedUserForModal.identity_verification_status === "rejected"
                        ? "bg-red-100 text-red-700"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {selectedUserForModal.identity_verification_status === "verified"
                      ? "Verified"
                      : selectedUserForModal.identity_verification_status === "pending"
                      ? "Pending Review"
                      : selectedUserForModal.identity_verification_status === "rejected"
                      ? "Rejected"
                      : "Not Submitted"}
                  </span>

                  <p className="text-sm text-gray-500 mt-1">
                    {selectedUserForModal.identity_verification_status === "not_submitted" || !selectedUserForModal.identity_verification_status
                      ? "User has not submitted identity documents for admin review."
                      : selectedUserForModal.identity_verification_status === "pending"
                      ? "User has submitted identity documents and is awaiting admin review."
                      : selectedUserForModal.identity_verification_status === "rejected"
                      ? "Identity verification was rejected by an admin. The user may need to resubmit."
                      : selectedUserForModal.identity_verification_status === "verified"
                      ? "Identity has been verified by an admin. All verification steps are complete."
                      : ""}
                  </p>

                  {selectedUserForModal.identity_verified_at && (
                    <p className="text-xs text-gray-400 mt-1">
                      Identity verified on: {new Date(selectedUserForModal.identity_verified_at).toLocaleString()}
                    </p>
                  )}
                </div>
              </div>

              {/* Approval Status */}
              {selectedUserForModal.approval_status && (
                <>
                  <hr className="border-soft" />
                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">
                      Account Approval Status
                    </h4>
                    <span
                      className={`inline-block px-3 py-1 text-xs font-medium rounded-full ${
                        selectedUserForModal.approval_status === "approved"
                          ? "bg-green-100 text-green-700"
                          : selectedUserForModal.approval_status === "rejected"
                          ? "bg-red-100 text-red-700"
                          : "bg-yellow-100 text-yellow-700"
                      }`}
                    >
                      {selectedUserForModal.approval_status.charAt(0).toUpperCase() + selectedUserForModal.approval_status.slice(1)}
                    </span>
                  </div>
                                </>
              )}

            </div>

            {/* Footer — Notify User Button */}
            <div className="border-t border-soft px-6 py-4">
              <button
                onClick={() => notifyUser(selectedUserForModal)}
                disabled={sendingNotification}
                className={`w-full flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-colors ${
                  sendingNotification
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                {sendingNotification ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Sending...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                    Notify User of Required Steps
                  </>
                )}
              </button>
              <p className="text-xs text-gray-400 text-center mt-2">
                The user will receive this reminder in their dashboard notification bell.
              </p>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default UsersTab;
