import {
  getGuestSupportCredential,
  getGuestSupportCredentialsForEmail,
  guestSupportCredentialStorageKey,
  removeGuestSupportCredential,
  saveGuestSupportCredential,
} from './guestSupportCredentials';

const TOKEN = `rhg_${'a'.repeat(43)}`;

beforeEach(() => {
  window.localStorage.clear();
});

test('stores guest support tokens by ticket without exposing them in URLs', () => {
  expect(saveGuestSupportCredential({
    ticketId: 42,
    guestAccessToken: TOKEN,
    email: ' Guest@Example.com ',
  })).toBe(true);

  expect(getGuestSupportCredential(42)).toMatchObject({
    ticketId: 42,
    guestAccessToken: TOKEN,
    email: 'guest@example.com',
  });
  expect(window.location.href).not.toContain(TOKEN);
});

test('filters credentials by normalized email and removes rejected tickets', () => {
  saveGuestSupportCredential({
    ticketId: 7,
    guestAccessToken: TOKEN,
    email: 'guest@example.com',
  });

  expect(getGuestSupportCredentialsForEmail('GUEST@example.com')).toHaveLength(1);
  expect(removeGuestSupportCredential(7)).toBe(true);
  expect(getGuestSupportCredential(7)).toBeNull();
  expect(JSON.parse(window.localStorage.getItem(guestSupportCredentialStorageKey))).toEqual([]);
});

test('rejects malformed tokens', () => {
  expect(saveGuestSupportCredential({
    ticketId: 9,
    guestAccessToken: 'not-a-token',
    email: 'guest@example.com',
  })).toBe(false);
});
