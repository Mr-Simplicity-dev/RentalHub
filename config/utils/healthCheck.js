const buildHealthCheckPayload = ({
  status = 'OK',
  timestamp = new Date().toISOString(),
  service = 'rentalhub-ng',
} = {}) => ({
  status,
  timestamp,
  service,
});

module.exports = {
  buildHealthCheckPayload,
};
