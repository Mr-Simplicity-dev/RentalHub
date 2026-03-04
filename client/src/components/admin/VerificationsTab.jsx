import React, { useEffect, useState } from "react";
import api from "../../services/api";

export default function VerificationsTab() {

  const [verifications, setVerifications] = useState([]);

  useEffect(() => {

    loadVerifications();

  }, []);

  const loadVerifications = async () => {

    const res = await api.get("/super/verifications");

    setVerifications(res.data.data || []);

  };

  return (

    <div className="card overflow-x-auto">

      <table className="w-full text-sm">

        <thead>

          <tr className="border-b">

            <th>Name</th>
            <th>Email</th>
            <th>Doc Type</th>
            <th>Status</th>

          </tr>

        </thead>

        <tbody>

          {verifications.map((v) => (

            <tr key={v.id} className="border-b">

              <td>{v.full_name}</td>
              <td>{v.email}</td>
              <td>{v.identity_document_type}</td>
              <td>{v.identity_verified ? "Verified" : "Pending"}</td>

            </tr>

          ))}

        </tbody>

      </table>

    </div>

  );
}