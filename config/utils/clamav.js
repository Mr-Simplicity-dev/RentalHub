// ClamAV malware scanning for uploaded files. Best-effort: if the scanner is
// unavailable it fails open (does not block uploads), but logs the problem.
const { execFile } = require('child_process');
const logger = require('./logger');

const scanFileForMalware = (filePath) =>
  new Promise((resolve) => {
    execFile(
      'clamdscan',
      ['--no-summary', '--stdout', filePath],
      { timeout: 30000 },
      (error, stdout) => {
        if (error && error.code === 1) {
          // exit 1 == infection found
          resolve({ infected: true, detail: String(stdout || '').trim() });
        } else if (error) {
          logger.warn('ClamAV scan unavailable (failing open):', error.message);
          resolve({ infected: false });
        } else {
          resolve({ infected: false });
        }
      }
    );
  });

module.exports = { scanFileForMalware };
