import { TwitterUserAuth } from './auth-user';
import { bearerToken } from './api';

describe('TwitterUserAuth', () => {
  const mockFetch = jest.fn();
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
    },
    guestToken: {
      ok: true,
      json: () => Promise.resolve({ guest_token: 'test-guest-token' }),
      text: () =>
        Promise.resolve(JSON.stringify({ guest_token: 'test-guest-token' })),
      headers: new Headers(),
    },
    success: (token: string) => ({
      ok: true,
      json: () => Promise.resolve({ flow_token: token }),
      text: () => Promise.resolve(JSON.stringify({ flow_token: token })),
      headers: new Headers(),
    }),
    subtask: (token: string, subtaskId: string) => ({
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
    }),
    error: (code: number, message: string) => ({
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
    }),
    httpError: (status: number, statusText: string, message: string) => ({
      ok: false,
      status,
      statusText,
      headers: new Headers(),
      text: () => Promise.resolve(message),
      json: () => Promise.resolve({ errors: [{ code: status, message }] }),
    }),
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
    mockFetch
      .mockResolvedValueOnce(mockResponses.guestToken)
      .mockResolvedValueOnce(mockResponses.xcomHomepage) // For transaction ID generation
      .mockResolvedValueOnce(mockResponses.subtask('token1', subtasks[0]));

    for (let i = 1; i < subtasks.length; i++) {
      mockFetch
        .mockResolvedValueOnce(mockResponses.xcomHomepage) // For each transaction ID generation
        .mockResolvedValueOnce(
          mockResponses.subtask(`token${i + 1}`, subtasks[i]),
        );
    }
    mockFetch.mockResolvedValueOnce(mockResponses.success('final'));
  };

  const setupAuthenticatedState = async () => {
    mockFetch
      .mockResolvedValueOnce(mockResponses.guestToken)
      .mockResolvedValueOnce(mockResponses.xcomHomepage)
      .mockResolvedValueOnce(
        mockResponses.subtask('token1', 'LoginSuccessSubtask'),
      )
      .mockResolvedValueOnce(mockResponses.xcomHomepage)
      .mockResolvedValueOnce(mockResponses.success('final'));

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

      // Guest token + (x.com + subtask) * 4 standard flows + final = 10 total
      expect(mockFetch).toHaveBeenCalledTimes(10);
      expect(mockFetch.mock.calls[0][0]).toBe(
        'https://api.x.com/1.1/guest/activate.json',
      );
      expect(mockFetch.mock.calls[1][0]).toBe('https://x.com');
      expect(mockFetch.mock.calls[2][0]).toBe(
        'https://api.x.com/1.1/onboarding/task.json?flow_name=login',
      );
    });

    it('should handle login failure', async () => {
      mockFetch
        .mockResolvedValueOnce(mockResponses.guestToken)
        .mockResolvedValueOnce(mockResponses.xcomHomepage)
        .mockResolvedValueOnce(mockResponses.error(99, 'Invalid credentials'));

      await expect(auth.login('testuser', 'wrongpass')).rejects.toThrow(
        'Authentication error (99): Invalid credentials',
      );
    });

    it('should handle DenyLoginSubtask flow', async () => {
      mockFetch
        .mockResolvedValueOnce(mockResponses.guestToken)
        .mockResolvedValueOnce(mockResponses.xcomHomepage)
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
      // Guest token + (x.com + subtask) * 5 2FA flows + final = 12 total
      expect(mockFetch).toHaveBeenCalledTimes(12);
    });

    it('should retry 2FA challenge after failure', async () => {
      mockFetch
        .mockResolvedValueOnce(mockResponses.guestToken)
        .mockResolvedValueOnce(mockResponses.xcomHomepage)
        // First 2FA challenge
        .mockResolvedValueOnce(
          mockResponses.subtask('token1', 'LoginTwoFactorAuthChallenge'),
        )
        .mockResolvedValueOnce(mockResponses.xcomHomepage)
        // First attempt fails
        .mockResolvedValueOnce(
          mockResponses.subtask('token2', 'LoginTwoFactorAuthChallenge'),
        )
        .mockResolvedValueOnce(mockResponses.xcomHomepage)
        // Second attempt succeeds
        .mockResolvedValueOnce(
          mockResponses.subtask('token3', 'LoginSuccessSubtask'),
        )
        .mockResolvedValueOnce(mockResponses.xcomHomepage)
        // Final success
        .mockResolvedValueOnce(mockResponses.success('final'));

      await auth.login('testuser', 'testpass', undefined, 'JBSWY3DPEHPK3PXP');
      expect(mockFetch).toHaveBeenCalledTimes(9);
    });

    it('should handle all 2FA attempts failing', async () => {
      mockFetch
        .mockResolvedValueOnce(mockResponses.guestToken)
        .mockResolvedValueOnce(mockResponses.xcomHomepage)
        .mockResolvedValueOnce(
          mockResponses.subtask('token1', 'LoginTwoFactorAuthChallenge'),
        )
        .mockResolvedValueOnce(mockResponses.xcomHomepage)
        .mockResolvedValueOnce(mockResponses.error(236, 'Bad 2FA code'))
        .mockResolvedValueOnce(mockResponses.xcomHomepage)
        .mockResolvedValueOnce(mockResponses.error(236, 'Bad 2FA code'))
        .mockResolvedValueOnce(mockResponses.xcomHomepage)
        .mockResolvedValueOnce(mockResponses.error(236, 'Bad 2FA code'));

      await expect(
        auth.login('testuser', 'testpass', undefined, 'JBSWY3DPEHPK3PXP'),
      ).rejects.toThrow('Bad 2FA code');
    });

    it('should handle missing TOTP secret during 2FA challenge', async () => {
      mockFetch
        .mockResolvedValueOnce(mockResponses.guestToken)
        .mockResolvedValueOnce(mockResponses.xcomHomepage)
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
        .mockResolvedValueOnce(mockResponses.xcomHomepage)
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
        .mockResolvedValueOnce(mockResponses.xcomHomepage)
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
        .mockResolvedValueOnce(mockResponses.xcomHomepage)
        .mockRejectedValueOnce(new Error('Network error'));

      await expect(auth.login('testuser', 'testpass')).rejects.toThrow(
        'Network error',
      );
    });

    it('should handle invalid response format', async () => {
      mockFetch
        .mockResolvedValueOnce(mockResponses.guestToken)
        .mockResolvedValueOnce(mockResponses.xcomHomepage)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({}),
          text: () => Promise.resolve('{}'),
          headers: new Headers(),
        });

      await expect(auth.login('testuser', 'testpass')).rejects.toThrow();
    });

    it('should handle rate limit errors', async () => {
      mockFetch
        .mockResolvedValueOnce(mockResponses.guestToken)
        .mockResolvedValueOnce(mockResponses.xcomHomepage)
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
        .mockResolvedValueOnce(mockResponses.xcomHomepage)
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
    it('should return true when logged in', async () => {
      mockFetch.mockResolvedValueOnce(mockResponses.success('verify'));
      const result = await auth.isLoggedIn();
      expect(result).toBe(true);
    });

    it('should return false when not logged in', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ errors: [{ code: 99 }] }),
        text: () => Promise.resolve(JSON.stringify({ errors: [{ code: 99 }] })),
        headers: new Headers(),
      });

      const result = await auth.isLoggedIn();
      expect(result).toBe(false);
    });

    it('should handle network error during status check', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      const result = await auth.isLoggedIn();
      expect(result).toBe(false);
    });

    it('should handle invalid response during status check', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ errors: [{ code: -1 }] }),
        text: () => Promise.resolve(JSON.stringify({ errors: [{ code: -1 }] })),
        headers: new Headers(),
      });

      const result = await auth.isLoggedIn();
      expect(result).toBe(false);
    });
  });
});
