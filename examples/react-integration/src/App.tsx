import { useEffect, useRef, useState } from 'react';
import { Scraper, Tweet } from '@the-convocation/twitter-scraper';
import './App.css';

function getProxyHost(host: string): string {
  if (host.startsWith('api')) {
    return 'localhost:5174';
  } else {
    return 'localhost:5175';
  }
}

function FetchTweet() {
  const [tweet, setTweet] = useState<Tweet | null>(null);

  const scraper = useRef(
    new Scraper({
      transform: {
        request(input: RequestInfo | URL, init?: RequestInit) {
          console.log(input, init);
          if (input instanceof URL) {
            input.protocol = 'http';
            input.host = getProxyHost(input.host);
            return [input, init];
          } else if (typeof input === 'string') {
            const proxy = new URL(input);
            proxy.protocol = 'http';
            proxy.host = getProxyHost(proxy.host);
            return [proxy, init];
          } else {
            throw new Error('Unexpected request input type');
          }
        },
      },
    }),
  );
  const loggedIn = useRef(false);

  useEffect(() => {
    async function getTweet() {
      if (!loggedIn.current) {
        await scraper.current.login(
          import.meta.env.VITE_TWITTER_USERNAME,
          import.meta.env.VITE_TWITTER_PASSWORD,
          import.meta.env.VITE_TWITTER_EMAIL,
        );
        loggedIn.current = true;
      }

      const latestTweet = await scraper.current.getTweet('1585338303800578049');
      if (latestTweet) {
        setTweet(latestTweet);
      }
    }

    getTweet();
  }, []);

  return <p>{tweet?.text}</p>;
}

function App() {
  return (
    <>
      <div className="card">
        <FetchTweet />
      </div>
    </>
  );
}

export default App;
