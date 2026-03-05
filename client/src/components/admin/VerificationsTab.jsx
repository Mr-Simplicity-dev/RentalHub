import React from "react";

const VerificationsTab = ({
  verifications,
  verificationSearch,
  setVerificationSearch,
  verificationStatus,
  setVerificationStatus,
  verificationUserType,
  setVerificationUserType,
  verificationPagination,
  loadVerifications,
  verifyIdentity,
  rejectIdentity,
  adminPerformance,
}) => {

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
                    No verification requests found
                  </td>
                </tr>

              )}

              {verifications.map((v) => {

                const docType = (v.identity_document_type || "nin").toLowerCase();

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
                            v.identity_verified
                              ? "bg-green-100 text-green-700"
                              : "bg-yellow-100 text-yellow-700"
                          }`}
                      >
                        {v.identity_verified ? "Verified" : "Pending"}
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
                          href={v.passport_photo_url}
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

                        {!v.identity_verified && (

                          <>
                            <button
                              onClick={() => verifyIdentity(v.id)}
                              className="rounded-lg bg-green-600 px-2 py-1 text-xs text-white transition-colors hover:bg-green-700"
                            >
                              Approve
                            </button>

                            <button
                              onClick={() => rejectIdentity(v.id)}
                              className="rounded-lg bg-red-600 px-2 py-1 text-xs text-white transition-colors hover:bg-red-700"
                            >
                              Reject
                            </button>
                          </>

                        )}

                      </div>

                    </td>

                  </tr>

                );

              })}

            </tbody>

          </table>

        </div>

      </div>


      {/* ADMIN PERFORMANCE SECTION */}

      <div className="rounded-xl2 border border-soft bg-white p-5 shadow-card transition hover:shadow-cardHover">

        <h3 className="text-lg font-semibold mb-4">
          Admin Verification Performance
        </h3>

        <div className="overflow-x-auto">

          <table className="min-w-full text-sm">

            <thead className="bg-gray-50 text-gray-700">

              <tr>
                <th className="p-3 text-left">Admin</th>
                <th className="p-3 text-left">Email</th>
                <th className="p-3 text-left">Status</th>
                <th className="p-3 text-left">Total Verified</th>
                <th className="p-3 text-left">Last Verification</th>
              </tr>

            </thead>

            <tbody>

              {adminPerformance.length === 0 && (

                <tr>
                  <td colSpan="5" className="text-center py-10 text-gray-500">
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

                  <td className="p-3 text-gray-600">

                    {a.last_verification_at
                      ? new Date(
                          a.last_verification_at
                        ).toLocaleString()
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
