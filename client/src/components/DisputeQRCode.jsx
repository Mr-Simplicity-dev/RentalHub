import React from "react";
import { QRCodeCanvas } from "qrcode.react";

export default function DisputeQRCode({ disputeId }) {

  const verifyUrl = `${window.location.origin}/verify-case?dispute=${disputeId}`;

  return (
    <div style={{ textAlign: "center", marginTop: 20 }}>

      <h3>Evidence Verification QR</h3>

      <QRCodeCanvas
        value={verifyUrl}
        size={200}
        level="H"
        includeMargin={true}
      />

      <p style={{ marginTop: 10 }}>
        Scan to verify evidence authenticity
      </p>

      <small>{verifyUrl}</small>

    </div>
  );
}
