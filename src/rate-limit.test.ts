import { ApiError } from './errors';
import { ErrorRateLimitStrategy } from './rate-limit';

test('error rate limit strategy throws error when triggered', async () => {
  const strategy = new ErrorRateLimitStrategy();

  await expect(() =>
    strategy.onRateLimit({
      fetchParameters: ['/', {}],
      response: {
        headers: new Headers(),
        ok: false,
        redirected: false,
        status: 0,
        statusText: '',
        type: 'basic',
        url: '',
        clone: function (): Response {
          throw new Error('Function not implemented.');
        },
        body: null,
        bodyUsed: false,
        arrayBuffer: function (): Promise<ArrayBuffer> {
          throw new Error('Function not implemented.');
        },
        blob: function (): Promise<Blob> {
          throw new Error('Function not implemented.');
        },
        formData: function (): Promise<FormData> {
          throw new Error('Function not implemented.');
        },
        json: function (): Promise<any> {
          throw new Error('Function not implemented.');
        },
        text: function (): Promise<string> {
          throw new Error('Function not implemented.');
        },
      },
    }),
  ).rejects.toThrow(ApiError);
});
