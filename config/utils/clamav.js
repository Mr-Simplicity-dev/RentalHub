// Scanning reports whether a file was actually checked. Required callers reject
// scanned:false; existing best-effort callers keep their previous behaviour.
const { execFile } = require('child_process');
const logger = require('./logger');

const scanFileForMalware = (filePath, {required=false}={}) =>
  new Promise((resolve) => {
    execFile(
      'clamdscan',
      ['--no-summary', '--stdout', '--fdpass', filePath],
      { timeout: 30000 },
      (error, stdout) => {
        if (error && error.code === 1) {
          // exit 1 == infection found
          resolve({ infected: true, scanned: true, detail: String(stdout || '').trim() });
        } else if (error) {
          logger.warn(required?'Required ClamAV scan unavailable':'ClamAV scan unavailable',{code:error.code});
          resolve({ infected: false, scanned: false, unavailable: true });
        } else {
          resolve({ infected: false, scanned: true });
        }
      }
    );
  });

module.exports = { scanFileForMalware };
