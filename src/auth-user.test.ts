import { TwitterUserAuth } from './auth-user';
import { bearerToken } from './api';
import { jest } from '@jest/globals';

describe('TwitterUserAuth', () => {
  const mockFetch = jest.fn<typeof fetch>();
  let auth: TwitterUserAuth;

  // Common login flows
  const loginFlows = {
    standard: [
      'LoginJsInstrumentationSubtask',
      'LoginEnterUserIdentifierSSO',
      'LoginEnterPassword',
      'LoginSuccessSubtask',
    ],
    twoFactor: [
      'LoginJsInstrumentationSubtask',
      'LoginEnterUserIdentifierSSO',
      'LoginEnterPassword',
      'LoginTwoFactorAuthChallenge',
      'LoginSuccessSubtask',
    ],
  };

  // Common mock responses
  const mockResponses = {
    xcomHomepage: {
      ok: true,
      status: 200,
      text: () =>
        Promise.resolve(
          '<!DOCTYPE html><html><head></head><body><input type="hidden" name="authenticity_token" value="test_token" /></body></html>',
        ),
      headers: new Headers(),
    } as Response,
    guestToken: {
      ok: true,
      json: () => Promise.resolve({ guest_token: 'test-guest-token' }),
      text: () =>
        Promise.resolve(JSON.stringify({ guest_token: 'test-guest-token' })),
      headers: new Headers(),
    } as Response,
    success: (token: string): Response =>
      ({
        ok: true,
        json: () => Promise.resolve({ flow_token: token }),
        text: () => Promise.resolve(JSON.stringify({ flow_token: token })),
        headers: new Headers(),
      } as Response),
    subtask: (token: string, subtaskId: string): Response =>
      ({
        ok: true,
        json: () =>
          Promise.resolve({
            flow_token: token,
            subtasks: [{ subtask_id: subtaskId }],
          }),
        text: () =>
          Promise.resolve(
            JSON.stringify({
              flow_token: token,
              subtasks: [{ subtask_id: subtaskId }],
            }),
          ),
        headers: new Headers(),
      } as Response),
    error: (code: number, message: string): Response =>
      ({
        ok: true,
        json: () =>
          Promise.resolve({
            flow_token: 'error-token',
            errors: [{ code, message }],
          }),
        text: () =>
          Promise.resolve(
            JSON.stringify({
              flow_token: 'error-token',
              errors: [{ code, message }],
            }),
          ),
        headers: new Headers(),
      } as Response),
    httpError: (
      status: number,
      statusText: string,
      message: string,
    ): Response =>
      ({
        ok: false,
        status,
        statusText,
        headers: new Headers(),
        text: () => Promise.resolve(message),
        json: () => Promise.resolve({ errors: [{ code: status, message }] }),
      } as Response),
  };

  // Test utilities
  const setupAuth = () => {
    mockFetch.mockReset();
    return new TwitterUserAuth(bearerToken, {
      fetch: mockFetch,
      transform: {},
      rateLimitStrategy: {
        onRateLimit: async () => {
          throw new Error('Rate limit hit');
        },
      },
    });
  };

  const mockLoginFlow = (subtasks: string[]) => {
    // Guest token fetch
    mockFetch.mockResolvedValueOnce(mockResponses.guestToken);

    // initLogin: task endpoint returns first subtask
    mockFetch.mockResolvedValueOnce(
      mockResponses.subtask('token1', subtasks[0]),
    );

    // Each subsequent subtask handler: task endpoint
    for (let i = 1; i < subtasks.length; i++) {
      mockFetch.mockResolvedValueOnce(
        mockResponses.subtask(`token${i + 1}`, subtasks[i]),
      );
    }
  };

  const setupAuthenticatedState = async () => {
    // Use a minimal login flow that goes straight to success
    mockFetch
      .mockResolvedValueOnce(mockResponses.guestToken)
      .mockResolvedValueOnce(
        mockResponses.subtask('token1', 'LoginSuccessSubtask'),
      );

    await auth.login('testuser', 'testpass');
    mockFetch.mockClear();
  };

  beforeEach(() => {
    auth = setupAuth();
  });

  describe('login', () => {
    it('should handle successful login flow', async () => {
      mockLoginFlow(loginFlows.standard);
      await auth.login('testuser', 'testpass');

      // Guest token + 4 subtask calls = 5 total
      expect(mockFetch).toHaveBeenCalledTimes(5);
      expect(mockFetch.mock.calls[0][0]).toBe(
        'https://api.x.com/1.1/guest/activate.json',
      );
      expect(mockFetch.mock.calls[1][0]).toBe(
        'https://api.x.com/1.1/onboarding/task.json?flow_name=login',
      );
    });

    it('should handle login failure', async () => {
      mockFetch
        .mockResolvedValueOnce(mockResponses.guestToken)
        .mockResolvedValueOnce(mockResponses.error(99, 'Invalid credentials'));

      await expect(auth.login('testuser', 'wrongpass')).rejects.toThrow(
        'Authentication error (99): Invalid credentials',
      );
    });

    it('should handle DenyLoginSubtask flow', async () => {
      mockFetch
        .mockResolvedValueOnce(mockResponses.guestToken)
        .mockResolvedValueOnce(
          mockResponses.subtask('token1', 'DenyLoginSubtask'),
        );

      await expect(auth.login('testuser', 'wrongpass')).rejects.toThrow(
        'Authentication error: DenyLoginSubtask',
      );
    });

    it('should handle 2FA challenge', async () => {
      mockLoginFlow(loginFlows.twoFactor);
      await auth.login('testuser', 'testpass', undefined, 'JBSWY3DPEHPK3PXP');
      // Guest token + 5 subtask calls = 6 total
      expect(mockFetch).toHaveBeenCalledTimes(6);
    });

    it('should retry 2FA challenge after failure', async () => {
      mockFetch
        .mockResolvedValueOnce(mockResponses.guestToken)
        // initLogin
        .mockResolvedValueOnce(
          mockResponses.subtask('token1', 'LoginTwoFactorAuthChallenge'),
        )
        // First 2FA attempt fails - returns same subtask
        .mockResolvedValueOnce(
          mockResponses.subtask('token2', 'LoginTwoFactorAuthChallenge'),
        )
        // Second 2FA attempt succeeds
        .mockResolvedValueOnce(
          mockResponses.subtask('token3', 'LoginSuccessSubtask'),
        );

      await auth.login('testuser', 'testpass', undefined, 'JBSWY3DPEHPK3PXP');
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });

    it('should handle all 2FA attempts failing', async () => {
      mockFetch
        .mockResolvedValueOnce(mockResponses.guestToken)
        // initLogin returns 2FA challenge
        .mockResolvedValueOnce(
          mockResponses.subtask('token1', 'LoginTwoFactorAuthChallenge'),
        )
        // First 2FA attempt fails
        .mockResolvedValueOnce(mockResponses.error(236, 'Bad 2FA code'))
        // Second 2FA attempt fails
        .mockResolvedValueOnce(mockResponses.error(236, 'Bad 2FA code'))
        // Third 2FA attempt fails
        .mockResolvedValueOnce(mockResponses.error(236, 'Bad 2FA code'));

      await expect(
        auth.login('testuser', 'testpass', undefined, 'JBSWY3DPEHPK3PXP'),
      ).rejects.toThrow('Bad 2FA code');
    });

    it('should handle missing TOTP secret during 2FA challenge', async () => {
      mockFetch
        .mockResolvedValueOnce(mockResponses.guestToken)
        // initLogin returns 2FA challenge
        .mockResolvedValueOnce(
          mockResponses.subtask('token1', 'LoginTwoFactorAuthChallenge'),
        );

      await expect(auth.login('testuser', 'testpass')).rejects.toThrow(
        'Two-factor authentication is required but no secret was provided',
      );
    });

    it('should handle invalid TOTP secret during 2FA challenge', async () => {
      mockFetch
        .mockResolvedValueOnce(mockResponses.guestToken)
        // initLogin returns 2FA challenge
        .mockResolvedValueOnce(
          mockResponses.subtask('token1', 'LoginTwoFactorAuthChallenge'),
        );

      await expect(
        auth.login('testuser', 'testpass', undefined, 'INVALID_SECRET'),
      ).rejects.toThrow();
    });

    it('should handle invalid subtask type', async () => {
      mockFetch
        .mockResolvedValueOnce(mockResponses.guestToken)
        .mockResolvedValueOnce(
          mockResponses.subtask('token1', 'UnknownSubtask'),
        );

      await expect(auth.login('testuser', 'testpass')).rejects.toThrow(
        'Unknown subtask UnknownSubtask',
      );
    });

    it('should handle network errors', async () => {
      mockFetch
        .mockResolvedValueOnce(mockResponses.guestToken)
        // initLogin fails on task endpoint
        .mockRejectedValueOnce(new Error('Network error'));

      await expect(auth.login('testuser', 'testpass')).rejects.toThrow(
        'Network error',
      );
    });

    it('should handle invalid response format', async () => {
      mockFetch
        .mockResolvedValueOnce(mockResponses.guestToken)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({}),
          text: () => Promise.resolve('{}'),
          headers: new Headers(),
        } as Response);

      await expect(auth.login('testuser', 'testpass')).rejects.toThrow();
    });

    it('should handle rate limit errors', async () => {
      mockFetch
        .mockResolvedValueOnce(mockResponses.guestToken)
        // initLogin gets rate limited
        .mockResolvedValueOnce(
          mockResponses.httpError(429, 'Too Many Requests', 'Rate limit hit'),
        );

      await expect(auth.login('testuser', 'testpass')).rejects.toThrow(
        'Rate limit hit',
      );
    });

    it('should handle unauthorized errors', async () => {
      mockFetch
        .mockResolvedValueOnce(mockResponses.guestToken)
        // initLogin gets 401 error
        .mockResolvedValueOnce(
          mockResponses.httpError(
            401,
            'Unauthorized',
            'Could not authenticate you',
          ),
        );

      await expect(auth.login('testuser', 'testpass')).rejects.toThrow(
        'Could not authenticate you',
      );
    });
  });

  describe('logout', () => {
    it('should handle successful logout', async () => {
      await setupAuthenticatedState();
      mockFetch.mockResolvedValueOnce(mockResponses.success('logout'));

      await auth.logout();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.x.com/1.1/account/logout.json',
        expect.objectContaining({
          method: 'POST',
        }),
      );

      expect(auth.hasToken()).toBe(false);
      expect(await auth.cookieJar().getCookies('https://x.com')).toHaveLength(
        0,
      );
    });

    it('should clear state on network error during logout', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      await auth.logout();

      expect(auth.hasToken()).toBe(false);
      expect(await auth.cookieJar().getCookies('https://x.com')).toHaveLength(
        0,
      );
    });

    it('should clear state on failed logout', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponses.httpError(400, 'Bad Request', 'User not found'),
      );

      await auth.logout();

      expect(auth.hasToken()).toBe(false);
      expect(await auth.cookieJar().getCookies('https://x.com')).toHaveLength(
        0,
      );
    });
  });

  describe('isLoggedIn', () => {
    it('should return true when ct0 cookie is present', async () => {
      // Set up a ct0 cookie in the jar
      await auth.cookieJar().setCookie('ct0=test_token', 'https://x.com');
      const result = await auth.isLoggedIn();
      expect(result).toBe(true);
    });

    it('should return false when ct0 cookie is not present', async () => {
      const result = await auth.isLoggedIn();
      expect(result).toBe(false);
    });

    it('should return false after logout', async () => {
      // Set up authenticated state with login
      await setupAuthenticatedState();

      // Manually set ct0 cookie to ensure isLoggedIn returns true
      await auth.cookieJar().setCookie('ct0=test_token', 'https://x.com');
      expect(await auth.isLoggedIn()).toBe(true);

      // Logout should clear cookies
      mockFetch.mockResolvedValueOnce(mockResponses.success('logout'));
      await auth.logout();

      // Now should be logged out
      const result = await auth.isLoggedIn();
      expect(result).toBe(false);
    });
  });
});
