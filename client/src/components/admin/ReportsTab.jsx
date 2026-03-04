import React from "react";

const ReportsTab = ({ reports, updateReport }) => {

  return (
    <div className="card overflow-x-auto">

      <table className="w-full text-sm">

        <thead>

          <tr className="border-b">
            <th>Reporter</th>
            <th>Target</th>
            <th>Reason</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>

        </thead>

        <tbody>

          {reports.map((r) => (

            <tr key={r.id} className="border-b">

              <td>
                {r.reporter_name || "Anonymous"}
              </td>

              <td>
                {r.target_type} #{r.target_id}
              </td>

              <td className="max-w-xs truncate">
                {r.reason}
              </td>

              <td>
                {r.status}
              </td>

              <td className="space-x-2">

                {r.status !== "resolved" && (

                  <button
                    onClick={() => updateReport(r.id, "resolved")}
                    className="btn btn-xs"
                  >
                    Resolve
                  </button>

                )}

                {r.status !== "dismissed" && (

                  <button
                    onClick={() => updateReport(r.id, "dismissed")}
                    className="btn btn-xs"
                  >
                    Dismiss
                  </button>

                )}

              </td>

            </tr>

          ))}

        </tbody>

      </table>

    </div>
  );
};

export default ReportsTab;