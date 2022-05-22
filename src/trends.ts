import { addApiParams, requestApi } from './api';
import { TwitterGuestAuth } from './auth';
import { TimelineRaw } from './timeline';

export async function getTrends(
  includeTweetReplies: boolean,
  auth: TwitterGuestAuth,
): Promise<string[]> {
  const params = new URLSearchParams();
  addApiParams(params, includeTweetReplies);

  params.set('count', '20');
  params.set('candidate_source', 'trends');
  params.set('include_page_configuration', 'false');
  params.set('entity_tokens', 'false');

  const res = await requestApi<TimelineRaw>(
    `https://twitter.com/i/api/2/guide.json?${params.toString()}`,
    auth,
  );
  if (!res.success) {
    throw res.err;
  }

  const instructions = res.value.timeline?.instructions ?? [];
  if (instructions.length < 2) {
    throw new Error('No trend entries found.');
  }

  // Some of this is silly, but for now we're assuming we know nothing about the
  // data, and that anything can be missing. Go has non-nilable strings and empty
  // slices are nil, so it largely doesn't need to worry about this.
  const entries = instructions[1].addEntries?.entries ?? [];
  if (entries.length < 2) {
    throw new Error('No trend entries found.');
  }

  const items = entries[1].content?.timelineModule?.items ?? [];
  const trends: string[] = [];
  for (const item of items) {
    const trend =
      item.item?.clientEventInfo?.details?.guideDetails?.transparentGuideDetails
        ?.trendMetadata?.trendName;
    if (trend != null) {
      trends.push(trend);
    }
  }

  return trends;
}
