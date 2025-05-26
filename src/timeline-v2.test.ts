import { TimelineV2, parseTimelineTweetsV2 } from './timeline-v2';

test('parseTimelineTweetsV2 handles pinned tweets correctly', async () => {
  const data: TimelineV2 = {
    data: {
      user: {
        result: {
          __typename: 'User',
          timeline: {
            timeline: {
              instructions: [
                {
                  type: 'TimelinePinEntry',
                  entry: {
                    entryId: 'tweet-1',
                    content: {
                      entryType: 'TimelineTimelineItem',
                      __typename: 'TimelineTimelineItem',
                      itemContent: {
                        itemType: 'TimelineTweet',
                        __typename: 'TimelineTweet',
                        tweet_results: {
                          result: {
                            __typename: 'Tweet',
                            rest_id: '1',
                            core: {
                              user_results: {
                                result: {
                                  core: {
                                    created_at:
                                      'Tue Oct 13 15:48:33 +0000 2015',
                                    name: 'DOFUS Touch',
                                    screen_name: 'DofusTouch',
                                  },
                                  legacy: {
                                    pinned_tweet_ids_str: ['1'],
                                  },
                                },
                              },
                            },
                            legacy: {
                              created_at: 'Mon Jan 1 12:00:00 +0000 2025',
                              conversation_id_str: '1',
                              entities: {},
                              favorite_count: 32,
                              full_text: 'test',
                              reply_count: 21,
                              retweet_count: 4,
                              user_id_str: '1',
                              id_str: '1',
                            },
                          },
                        },
                        tweetDisplayType: 'Tweet',
                      },
                    },
                  },
                },
                {
                  type: 'TimelineAddEntries',
                  entries: [
                    {
                      entryId: 'cursor-top-2',
                      content: {
                        entryType: 'TimelineTimelineCursor',
                        __typename: 'TimelineTimelineCursor',
                        value: 'A',
                        cursorType: 'Top',
                      },
                    },
                    {
                      entryId: 'cursor-bottom-3',
                      content: {
                        entryType: 'TimelineTimelineCursor',
                        __typename: 'TimelineTimelineCursor',
                        value: 'B',
                        cursorType: 'Bottom',
                      },
                    },
                  ],
                },
              ],
            },
          },
        },
      },
    },
  };

  const result = parseTimelineTweetsV2(data);
  expect(result.tweets.length).toBe(1);
  expect(result.tweets[0].id).toBe('1');
  expect(result.tweets[0].isPin).toBe(true);
  expect(result.previous).toBe('A');
  expect(result.next).toBe('B');
  expect(result.tweets[0].text).toBe('test');
});
