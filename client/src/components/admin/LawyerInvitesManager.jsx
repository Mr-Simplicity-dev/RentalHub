import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import api from "../../services/api";

const LawyerInvitesManager = ({
  title = "Lawyer Invites",
  description = "Resend expired lawyer invites or correct the lawyer email.",
}) => {
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedLawyer, setSelectedLawyer] = useState(null);
  const [showLawyerModal, setShowLawyerModal] = useState(false);

  const loadInvites = async (query = "") => {
    try {
      setLoading(true);
      const res = await api.get("/auth/lawyer-invites", {
        params: {
          search: query,
        },
      });

      setInvites(res.data?.data || []);
    } catch (error) {
      console.error("Failed to load lawyer invites:", error);
      toast.error(
        error.response?.data?.message || "Failed to load lawyer invites"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInvites();
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    loadInvites(search.trim());
  };

  const resendInvite = async (inviteId) => {
    try {
      const res = await api.patch(`/auth/lawyer-invites/${inviteId}/resend`);
      const emailSent = res.data?.data?.email_sent !== false;
      const errorMessage = res.data?.data?.email_error;
      const message = errorMessage
        ? `${res.data?.message || "Invite resend failed"}: ${errorMessage}`
        : res.data?.message || "Invite resent successfully";

      if (emailSent) {
        toast.success(message);
      } else {
        toast.error(message);
      }

      loadInvites(search.trim());
    } catch (error) {
      console.error("Failed to resend invite:", error);
      toast.error(error.response?.data?.message || "Failed to resend invite");
    }
  };

  const changeEmail = async (invite) => {
    const nextEmail = window.prompt(
      "Enter the new lawyer email",
      invite.lawyer_email || ""
    );

    if (!nextEmail) return;

    try {
      const res = await api.patch(`/auth/lawyer-invites/${invite.id}/email`, {
        lawyer_email: nextEmail.trim(),
      });
      const emailSent = res.data?.data?.email_sent !== false;
      const errorMessage = res.data?.data?.email_error;
      const message = errorMessage
        ? `${res.data?.message || "Lawyer email update failed"}: ${errorMessage}`
        : res.data?.message || "Lawyer email updated";

      if (emailSent) {
        toast.success(message);
      } else {
        toast.error(message);
      }

      loadInvites(search.trim());
    } catch (error) {
      console.error("Failed to update lawyer email:", error);
      toast.error(
        error.response?.data?.errors?.[0]?.msg ||
          error.response?.data?.message ||
          "Failed to update lawyer email"
      );
    }
  };

  const showLawyerDetails = (invite) => {
    if (invite.status === "accepted" && invite.lawyer_user_id) {
      setSelectedLawyer(invite);
      setShowLawyerModal(true);
    }
  };

  const closeLawyerModal = () => {
    setSelectedLawyer(null);
    setShowLawyerModal(false);
  };

  const getStatusBadge = (invite) => {
    const isExpired =
      invite.status !== "accepted" &&
      invite.expires_at &&
      new Date(invite.expires_at).getTime() < Date.now();

    if (invite.status === "accepted") {
      return "bg-green-100 text-green-700";
    }

    if (isExpired) {
      return "bg-red-100 text-red-700";
    }

    return "bg-yellow-100 text-yellow-700";
  };

  const getStatusLabel = (invite) => {
    const isExpired =
      invite.status !== "accepted" &&
      invite.expires_at &&
      new Date(invite.expires_at).getTime() < Date.now();

    if (invite.status === "accepted") return "Accepted";
    if (isExpired) return "Expired";
    return "Pending";
  };

  return (
    <div className="space-y-4 animate-fadeIn">
      <div className="rounded-xl2 border border-soft bg-white p-6 shadow-card">
        <div className="mb-5 text-center">
          <h2 className="text-2xl font-semibold text-gray-900">{title}</h2>
          <p className="text-sm text-gray-500">{description}</p>
        </div>

        <form
          onSubmit={handleSearch}
          className="mb-4 flex flex-col items-center gap-3 md:flex-row md:justify-center"
        >
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by client or lawyer email"
            className="input w-full md:w-96"
          />
          <button type="submit" className="btn btn-primary">
            Search
          </button>
        </form>

        <div className="overflow-x-auto rounded-xl2 border border-soft shadow-card transition hover:shadow-cardHover">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-700">
              <tr>
                <th className="p-3 text-left">Client</th>
                <th className="p-3 text-left">Assigned By</th>
                <th className="p-3 text-left">Role</th>
                <th className="p-3 text-left">Lawyer Email</th>
                <th className="p-3 text-left">Status</th>
                <th className="p-3 text-left">Expires</th>
                <th className="p-3 text-left">Last Sent</th>
                <th className="p-3 text-left">Resends</th>
                <th className="p-3 text-center">Actions</th>
              </tr>
            </thead>

            <tbody>
              {!loading && invites.length === 0 && (
                <tr>
                  <td colSpan="9" className="py-10 text-center text-gray-500">
                    No lawyer invites found
                  </td>
                </tr>
              )}

              {invites.map((invite) => (
                <tr
                  key={invite.id}
                  className="border-t border-soft transition hover:bg-gray-50"
                >
                  <td className="p-3">
                    {invite.status === "accepted" && invite.lawyer_user_id ? (
                      <button
                        onClick={() => showLawyerDetails(invite)}
                        className="font-medium text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        {invite.client_name}
                      </button>
                    ) : (
                      <span className="font-medium">{invite.client_name}</span>
                    )}
                  </td>
                  <td className="p-3 text-gray-600">
                    {invite.assigned_by_name || invite.client_name || '-'}
                  </td>
                  <td className="p-3 capitalize">{invite.client_role}</td>
                  <td className="p-3 text-gray-600">{invite.lawyer_email}</td>
                  <td className="p-3">
                    <span
                      className={`rounded-full px-2 py-1 text-xs ${getStatusBadge(
                        invite
                      )}`}
                    >
                      {getStatusLabel(invite)}
                    </span>
                  </td>
                  <td className="p-3 text-gray-500">
                    {invite.expires_at
                      ? new Date(invite.expires_at).toLocaleString()
                      : "-"}
                  </td>
                  <td className="p-3 text-gray-500">
                    {invite.last_sent_at
                      ? new Date(invite.last_sent_at).toLocaleString()
                      : "-"}
                  </td>
                  <td className="p-3">{invite.resent_count ?? 0}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap justify-center gap-2">
                      {invite.status !== "accepted" && (
                        <>
                          <button
                            onClick={() => resendInvite(invite.id)}
                            className="rounded-lg bg-blue-600 px-3 py-1 text-xs text-white transition-colors hover:bg-blue-700"
                          >
                            Resend Invite
                          </button>

                          <button
                            onClick={() => changeEmail(invite)}
                            className="rounded-lg bg-gray-700 px-3 py-1 text-xs text-white transition-colors hover:bg-gray-800"
                          >
                            Change Email
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Lawyer Details Modal */}
      {showLawyerModal && selectedLawyer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
            <div className="mb-6 flex items-center justify-center relative">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white text-center">
                Lawyer Details
              </h3>
              <button
                onClick={closeLawyerModal}
                className="absolute right-0 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <svg
                  className="h-6 w-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {/* Personal Information */}
              <div className="space-y-4">
                <div>
                  <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                    Personal Information
                  </h4>

                  {selectedLawyer.lawyer_passport_photo_url && (
                    <div className="flex justify-center mb-4">
                      <img
                        src={selectedLawyer.lawyer_passport_photo_url}
                        alt="Lawyer Passport Photo"
                        className="h-32 w-32 rounded-lg object-cover border border-gray-300 dark:border-gray-600"
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Full Name
                        </label>
                        <p className="mt-1 text-sm text-gray-900 dark:text-white font-medium">
                          {selectedLawyer.lawyer_name || "Not provided"}
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Nationality
                        </label>
                        <p className="mt-1 text-sm text-gray-900 dark:text-white">
                          {selectedLawyer.lawyer_nationality || "Not provided"}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Email Address
                        </label>
                        <p className="mt-1 text-sm text-gray-900 dark:text-white">
                          {selectedLawyer.lawyer_email}
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Phone Number
                        </label>
                        <p className="mt-1 text-sm text-gray-900 dark:text-white">
                          {selectedLawyer.lawyer_phone || "Not provided"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Identity Verification */}
                <div>
                  <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                    Identity Verification
                  </h4>
                  <div className="grid grid-cols-1 gap-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Document Type
                        </label>
                        <p className="mt-1 text-sm text-gray-900 dark:text-white capitalize">
                          {selectedLawyer.lawyer_identity_document_type || "Not provided"}
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Verification Status
                        </label>
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full mt-1 ${
                            selectedLawyer.lawyer_nin_verified
                              ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                              : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                          }`}
                        >
                          {selectedLawyer.lawyer_nin_verified ? "Verified" : "Not Verified"}
                        </span>
                      </div>
                    </div>

                    {selectedLawyer.lawyer_identity_document_type === "passport" && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Passport Number
                        </label>
                        <p className="mt-1 text-sm text-gray-900 dark:text-white font-mono">
                          {selectedLawyer.lawyer_passport_number || "Not provided"}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Professional Information */}
              <div className="space-y-4">
                <div>
                  <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                    Professional Information
                  </h4>
                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Chamber/Law Firm
                      </label>
                      <p className="mt-1 text-sm text-gray-900 dark:text-white font-medium">
                        {selectedLawyer.lawyer_chamber_name || "Not provided"}
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Chamber Phone
                      </label>
                      <p className="mt-1 text-sm text-gray-900 dark:text-white">
                        {selectedLawyer.lawyer_chamber_phone || "Not provided"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Client Relationship */}
                <div>
                  <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                    Client Relationship
                  </h4>
                  <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Client Name
                        </label>
                        <p className="mt-1 text-sm text-gray-900 dark:text-white font-medium">
                          {selectedLawyer.client_name}
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Client Role
                        </label>
                        <p className="mt-1 text-sm text-gray-900 dark:text-white capitalize">
                          {selectedLawyer.client_role}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Invite Status
                          </label>
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full mt-1 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                            Accepted
                          </span>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Accepted Date
                          </label>
                          <p className="mt-1 text-sm text-gray-900 dark:text-white">
                            {selectedLawyer.accepted_at
                              ? new Date(selectedLawyer.accepted_at).toLocaleDateString()
                              : "Not available"}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={closeLawyerModal}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LawyerInvitesManager;
