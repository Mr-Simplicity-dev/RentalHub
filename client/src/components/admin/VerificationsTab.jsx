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
    <div className="space-y-6">

      <div className="card">

        <h3 className="font-semibold mb-3">
          NIN / International Passport Verification
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-3">

          <input
            className="input"
            placeholder="Search name, email, NIN, passport"
            value={verificationSearch}
            onChange={(e) => setVerificationSearch(e.target.value)}
          />

          <select
            className="input"
            value={verificationStatus}
            onChange={(e) => setVerificationStatus(e.target.value)}
          >
            <option value="pending">Pending</option>
            <option value="verified">Verified</option>
            <option value="all">All</option>
          </select>

          <select
            className="input"
            value={verificationUserType}
            onChange={(e) => setVerificationUserType(e.target.value)}
          >
            <option value="all">All Roles</option>
            <option value="admin">Admins</option>
            <option value="landlord">Landlords</option>
            <option value="tenant">Tenants</option>
          </select>

          <button className="btn btn-primary" onClick={loadVerifications}>
            Apply Filters
          </button>

        </div>

        <div className="text-sm text-gray-600 mb-2">
          {verificationPagination.total} records
        </div>

        <div className="overflow-x-auto">

          <table className="w-full text-sm">

            <thead>
              <tr className="border-b">
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Doc Type</th>
                <th>Number</th>
                <th>Verified</th>
                <th>Verified By</th>
                <th>Verified At</th>
                <th>Passport Photo</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>

              {verifications.map((v) => {

                const docType = (v.identity_document_type || "nin").toLowerCase();
                const docNumber =
                  docType === "passport"
                    ? v.international_passport_number
                    : v.nin;

                return (

                  <tr key={v.id} className="border-b">

                    <td>{v.full_name}</td>
                    <td>{v.email}</td>
                    <td className="capitalize">{v.user_type}</td>

                    <td>{docType.toUpperCase()}</td>

                    <td>{docNumber || "-"}</td>

                    <td>{v.identity_verified ? "Yes" : "No"}</td>

                    <td>{v.identity_verified_by_name || "-"}</td>

                    <td>
                      {v.identity_verified_at
                        ? new Date(v.identity_verified_at).toLocaleString()
                        : "-"}
                    </td>

                    <td>
                      {v.passport_photo_url ? (
                        <a
                          href={v.passport_photo_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary-600 hover:underline"
                        >
                          View
                        </a>
                      ) : (
                        "-"
                      )}
                    </td>

                    <td className="space-x-2">

                      {!v.identity_verified && (
                        <button
                          onClick={() => verifyIdentity(v.id)}
                          className="btn btn-xs"
                        >
                          Approve
                        </button>
                      )}

                      {!v.identity_verified && (
                        <button
                          onClick={() => rejectIdentity(v.id)}
                          className="btn btn-xs btn-danger"
                        >
                          Reject
                        </button>
                      )}

                    </td>

                  </tr>

                );

              })}

            </tbody>

          </table>

        </div>

      </div>

      <div className="card overflow-x-auto">

        <h3 className="font-semibold mb-3">
          Admin Performance
        </h3>

        <table className="w-full text-sm">

          <thead>
            <tr className="border-b">
              <th>Admin</th>
              <th>Email</th>
              <th>Status</th>
              <th>Total Verified</th>
              <th>Last Verification</th>
            </tr>
          </thead>

          <tbody>

            {adminPerformance.map((a) => (

              <tr key={a.id} className="border-b">

                <td>{a.full_name}</td>
                <td>{a.email}</td>
                <td>{a.is_active ? "Active" : "Inactive"}</td>
                <td>{a.credentials_verified_count ?? 0}</td>

                <td>
                  {a.last_verification_at
                    ? new Date(a.last_verification_at).toLocaleString()
                    : "No activity"}
                </td>

              </tr>

            ))}

          </tbody>

        </table>

      </div>

    </div>
  );
};

export default VerificationsTab;