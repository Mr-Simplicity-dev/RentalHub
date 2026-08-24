const STORAGE_KEY = 'rentalhub_guest_support_credentials_v1';
const MAX_STORED_TICKETS = 20;
const TOKEN_PATTERN = /^rhg_[A-Za-z0-9_-]{43}$/;

const hasBrowserStorage = () =>
  typeof window !== 'undefined' && Boolean(window.localStorage);

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const normalizeTicketId = (value) => {
  const ticketId = Number(value);
  return Number.isInteger(ticketId) && ticketId > 0 ? ticketId : null;
};

const isValidCredential = (credential) =>
  Boolean(
    normalizeTicketId(credential?.ticketId)
      && TOKEN_PATTERN.test(String(credential?.guestAccessToken || '').trim())
  );

const readCredentials = () => {
  if (!hasBrowserStorage()) return [];

  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isValidCredential)
      .map((credential) => ({
        ticketId: normalizeTicketId(credential.ticketId),
        guestAccessToken: String(credential.guestAccessToken).trim(),
        email: normalizeEmail(credential.email),
        savedAt: Number(credential.savedAt) || 0,
      }))
      .sort((left, right) => right.savedAt - left.savedAt)
      .slice(0, MAX_STORED_TICKETS);
  } catch {
    return [];
  }
};

const writeCredentials = (credentials) => {
  if (!hasBrowserStorage()) return false;

  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(credentials.slice(0, MAX_STORED_TICKETS))
    );
    return true;
  } catch {
    return false;
  }
};

export const saveGuestSupportCredential = ({
  ticketId,
  guestAccessToken,
  email,
}) => {
  const credential = {
    ticketId: normalizeTicketId(ticketId),
    guestAccessToken: String(guestAccessToken || '').trim(),
    email: normalizeEmail(email),
    savedAt: Date.now(),
  };

  if (!isValidCredential(credential)) return false;

  const remaining = readCredentials().filter(
    (row) => row.ticketId !== credential.ticketId
  );
  return writeCredentials([credential, ...remaining]);
};

export const getGuestSupportCredential = (ticketId) => {
  const normalizedTicketId = normalizeTicketId(ticketId);
  if (!normalizedTicketId) return null;
  return readCredentials().find((row) => row.ticketId === normalizedTicketId) || null;
};

export const getGuestSupportCredentialsForEmail = (email) => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return [];
  return readCredentials().filter((row) => row.email === normalizedEmail);
};

export const removeGuestSupportCredential = (ticketId) => {
  const normalizedTicketId = normalizeTicketId(ticketId);
  if (!normalizedTicketId) return false;
  return writeCredentials(
    readCredentials().filter((row) => row.ticketId !== normalizedTicketId)
  );
};

export const guestSupportCredentialStorageKey = STORAGE_KEY;
