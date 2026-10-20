const compact = (items) => items.filter(Boolean);

/**
 * ICE servers for web calls.
 *
 * STUN cannot relay media, so calls fail behind strict carrier NAT (common on
 * mobile data) even though they work on WiFi. TURN fixes that; it is added
 * when the environment provides credentials. Web and app share this shape, so
 * the two surfaces behave the same way.
 */
export const getWebRtcIceServers = () => {
  const turnUrl = process.env.REACT_APP_TURN_URL || process.env.TURN_URL;
  const turnUsername =
    process.env.REACT_APP_TURN_USERNAME || process.env.TURN_USERNAME;
  const turnPassword =
    process.env.REACT_APP_TURN_PASSWORD || process.env.TURN_PASSWORD;

  const servers = compact([
    { urls: 'stun:stun.l.google.com:19302' },
    turnUrl
      ? {
          urls: turnUrl,
          username: turnUsername,
          credential: turnPassword,
        }
      : null,
  ]);

  if (turnUrl && String(turnUrl).startsWith('turn:')) {
    servers.push({
      urls: `turns:${String(turnUrl).slice(5)}`,
      username: turnUsername,
      credential: turnPassword,
    });
  }

  return servers;
};
