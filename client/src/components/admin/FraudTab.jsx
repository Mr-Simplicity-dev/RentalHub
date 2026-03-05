import React from "react";
import api from "../../services/api";

const FraudTab = ({ fraud, loadFraud }) => {

  const resolveFraud = async (id) => {
    await api.patch(`/super/fraud/${id}/resolve`);
    loadFraud();
  };

  const getScoreStyle = (score) => {

    if (score >= 80)
      return "bg-red-100 text-red-700";

    if (score >= 50)
      return "bg-yellow-100 text-yellow-700";

    return "bg-gray-100 text-gray-700";
  };

  return (
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
                    onClick={() => resolveFraud(f.id)}
                    className="rounded-lg bg-purple-600 px-3 py-1 text-xs text-white transition-colors hover:bg-purple-700"
                  >
                    Resolve
                  </button>

                </div>

              </td>

            </tr>

          ))}

        </tbody>

      </table>

    </div>
  );
};

export default FraudTab;
