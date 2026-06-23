const express = require('express');
const path = require('path');

const router = express.Router();

router.get('/app', (req, res) => {
  const apkPath = path.resolve(__dirname, '..', 'uploads', 'app.apk');

  res.download(apkPath, 'RentalHub.apk', (err) => {
    if (err) {
      if (!res.headersSent) {
        res.status(404).json({ success: false, message: 'APK not found' });
      }
    }
  });
});

module.exports = router;
