import { bearerToken } from './api';
import { TwitterGuestAuth } from './auth';

test('auth interface can get guest token', async () => {
  const auth = new TwitterGuestAuth(bearerToken);
  await auth.updateToken();
  expect(auth.hasToken()).toBeTruthy();
});
