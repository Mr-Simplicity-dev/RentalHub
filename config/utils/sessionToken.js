const normalizePositiveInteger = (value) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const getSessionTokenIdentity = (decoded) => {
  if (!decoded || typeof decoded !== 'object') {
    throw new Error('Invalid session token payload');
  }

  if (decoded.purpose && decoded.purpose !== 'session') {
    throw new Error('Token is not a session token');
  }

  const userId = normalizePositiveInteger(
    decoded.userId ?? decoded.id ?? decoded.user_id
  );
  const userType = String(decoded.userType ?? decoded.user_type ?? '').trim();
  const tokenVersion = normalizePositiveInteger(decoded.tv);

  // Requiring both the role and token version also rejects legacy reset and
  // verification JWTs, which only contained a user ID.
  if (!userId || !userType || !tokenVersion) {
    throw new Error('Invalid session token claims');
  }

  return {
    userId,
    userType,
    tokenVersion,
  };
};

const hasTokenPurpose = (decoded, expectedPurpose) =>
  Boolean(
    decoded &&
      typeof decoded === 'object' &&
      decoded.purpose === expectedPurpose
  );

module.exports = {
  getSessionTokenIdentity,
  hasTokenPurpose,
};
