import React, { useEffect, useState } from "react";
import api from "../../services/api";

export default function FraudTab() {

  const [fraud, setFraud] = useState([]);

  useEffect(() => {

    loadFraud();

  }, []);

  const loadFraud = async () => {

    const res = await api.get("/super/fraud");

    setFraud(res.data.flags || []);

  };

  return (

    <div className="card overflow-x-auto">

      <table className="w-full text-sm">

        <thead>

          <tr className="border-b">

            <th>Type</th>
            <th>Rule</th>
            <th>Score</th>

          </tr>

        </thead>

        <tbody>

          {fraud.map((f) => (

            <tr key={f.id} className="border-b">

              <td>{f.entity_type}</td>
              <td>{f.rule}</td>
              <td>{f.score}</td>

            </tr>

          ))}

        </tbody>

      </table>

    </div>

  );
}