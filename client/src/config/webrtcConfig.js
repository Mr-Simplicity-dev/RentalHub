const compact = (items) => items.filter(Boolean);

export const getWebRtcIceServers = () => {
  const turnUrl = process.env.REACT_APP_TURN_URL || process.env.TURN_URL;
  const turnUsername =
    process.env.REACT_APP_TURN_USERNAME || process.env.TURN_USERNAME;
  const turnPassword =
    process.env.REACT_APP_TURN_PASSWORD || process.env.TURN_PASSWORD;

  return compact([
    { urls: 'stun:stun.l.google.com:19302' },
    turnUrl
      ? {
          urls: turnUrl,
          username: turnUsername,
          credential: turnPassword,
        }
      : null,
  ]);
};
