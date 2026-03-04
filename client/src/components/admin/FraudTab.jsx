import React from "react";
import api from "../../services/api";

const FraudTab = ({ fraud, loadFraud }) => {

  const resolveFraud = async (id) => {
    await api.patch(`/super/fraud/${id}/resolve`);
    loadFraud();
  };

  return (
    <div className="card overflow-x-auto">

      <table className="w-full text-sm">

        <thead>

          <tr className="border-b">
            <th>Type</th>
            <th>ID</th>
            <th>Rule</th>
            <th>Score</th>
            <th>Time</th>
            <th>Action</th>
          </tr>

        </thead>

        <tbody>

          {fraud.map((f) => (

            <tr key={f.id} className="border-b">

              <td>{f.entity_type}</td>

              <td>{f.entity_id}</td>

              <td>{f.rule}</td>

              <td>{f.score}</td>

              <td>
                {new Date(f.created_at).toLocaleString()}
              </td>

              <td>

                <button
                  onClick={() => resolveFraud(f.id)}
                  className="btn btn-xs"
                >
                  Resolve
                </button>

              </td>

            </tr>

          ))}

        </tbody>

      </table>

    </div>
  );
};

export default FraudTab;