import React from "react";
import { useTranslation } from "react-i18next";
import { QRCodeCanvas } from "qrcode.react";

export default function DisputeQRCode({ disputeId }) {
  const { t } = useTranslation();

  const verifyUrl = `${window.location.origin}/verify-case?dispute=${disputeId}`;

  return (
    <div style={{ textAlign: "center", marginTop: 20 }}>

      <h3>{t('dispute_qr.title', 'Evidence Verification QR')}</h3>

      <QRCodeCanvas
        value={verifyUrl}
        size={200}
        level="H"
        includeMargin={true}
      />

      <p style={{ marginTop: 10 }}>
        {t('dispute_qr.scan_hint', 'Scan to verify evidence authenticity')}
      </p>

      <small>{verifyUrl}</small>

    </div>
  );
}
