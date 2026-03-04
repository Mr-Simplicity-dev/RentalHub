import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import DisputeQRCode from "../components/DisputeQRCode";

export default function DisputeDetails() {

  const { disputeId } = useParams();

  const [dispute, setDispute] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {

    const loadDispute = async () => {

      try {

        const res = await axios.get(`/api/disputes/${disputeId}`);

        setDispute(res.data);

      } catch (err) {

        console.error(err);
        setError("Failed to load dispute");

      }

      setLoading(false);

    };

    loadDispute();

  }, [disputeId]);

  if (loading) return <p>Loading dispute...</p>;

  if (error) return <p style={{ color: "red" }}>{error}</p>;

  if (!dispute) return <p>Dispute not found</p>;

  return (

    <div style={{ padding: 40 }}>

      <h2>Dispute Details</h2>

      <p>
        <strong>Dispute ID:</strong> {dispute.id}
      </p>

      <p>
        <strong>Status:</strong> {dispute.status}
      </p>

      <p>
        <strong>Description:</strong> {dispute.description}
      </p>

      {/* QR Code for evidence verification */}
      <DisputeQRCode disputeId={dispute.id} />

    </div>

  );

}