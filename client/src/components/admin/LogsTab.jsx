import React from "react";

const LogsTab = ({ logs }) => {

  return (
    <div className="card overflow-x-auto">

      <table className="w-full text-sm">

        <thead>

          <tr className="border-b">
            <th>Actor</th>
            <th>Action</th>
            <th>Target</th>
            <th>Time</th>
          </tr>

        </thead>

        <tbody>

          {logs.map((l) => (

            <tr key={l.id} className="border-b">

              <td>
                {l.actor_name || "System"}
              </td>

              <td>
                {l.action}
              </td>

              <td>
                {l.target_type} #{l.target_id}
              </td>

              <td>
                {new Date(l.created_at).toLocaleString()}
              </td>

            </tr>

          ))}

        </tbody>

      </table>

    </div>
  );
};

export default LogsTab;