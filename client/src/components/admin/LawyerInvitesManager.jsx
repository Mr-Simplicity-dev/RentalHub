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
                  <td colSpan="8" className="py-10 text-center text-gray-500">
                    No lawyer invites found
                  </td>
                </tr>
              )}

              {invites.map((invite) => (
                <tr
                  key={invite.id}
                  className="border-t border-soft transition hover:bg-gray-50"
                >
                  <td className="p-3 font-medium">{invite.client_name}</td>
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
    </div>
  );
};

export default LawyerInvitesManager;
