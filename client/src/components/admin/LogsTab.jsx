import React from "react";

const LogsTab = ({ logs }) => {

  const getActionStyle = (action) => {

    const a = action.toLowerCase();

    if (a.includes("ban") || a.includes("delete"))
      return "bg-red-100 text-red-700";

    if (a.includes("verify") || a.includes("approve"))
      return "bg-green-100 text-green-700";

    if (a.includes("update") || a.includes("edit"))
      return "bg-blue-100 text-blue-700";

    return "bg-gray-100 text-gray-700";
  };

  return (
    <div className="animate-fadeIn rounded-xl2 border border-soft bg-white shadow-card transition hover:shadow-cardHover overflow-x-auto">

      <table className="min-w-full text-sm">

        <thead className="bg-gray-50 text-gray-700">

          <tr>

            <th className="p-3 text-left">Actor</th>
            <th className="p-3 text-left">Action</th>
            <th className="p-3 text-left">Target</th>
            <th className="p-3 text-left">Time</th>

          </tr>

        </thead>

        <tbody>

          {logs.length === 0 && (

            <tr>
              <td
                colSpan="4"
                className="text-center py-10 text-gray-500"
              >
                No activity logs found
              </td>
            </tr>

          )}

          {logs.map((l) => (

            <tr
              key={l.id}
              className="border-t border-soft hover:bg-gray-50 transition"
            >

              {/* ACTOR */}

              <td className="p-3 font-medium">
                {l.actor_name || "System"}
              </td>

              {/* ACTION */}

              <td className="p-3">

                <span
                  className={`px-2 py-1 text-xs rounded-full ${getActionStyle(
                    l.action
                  )}`}
                >
                  {l.action}
                </span>

              </td>

              {/* TARGET */}

              <td className="p-3 text-gray-600">
                {l.target_type} #{l.target_id}
              </td>

              {/* TIME */}

              <td className="p-3 text-gray-500">
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
