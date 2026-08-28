import { describe, expect, it } from 'vitest';
import { allowsAutomaticBrowserRetry } from '../queue';
import { isJobCommandRepeatable } from '../jobs';

describe('publish browser retry policy', () => {
  it('never automatically retries publish after a browser connection failure', () => {
    expect(allowsAutomaticBrowserRetry('publish --ads=new')).toBe(false);
    expect(allowsAutomaticBrowserRetry('publish --ads=3496141302')).toBe(false);
  });

  it('blocks generic manual repeats for publish because they lose the owning draft/preflight', () => {
    expect(isJobCommandRepeatable('publish --ads=new')).toBe(false);
    expect(isJobCommandRepeatable(' publish --ads=3496141302 ')).toBe(false);
    expect(isJobCommandRepeatable('verify')).toBe(true);
  });

  it('keeps retry eligibility for non-publishing browser commands', () => {
    expect(allowsAutomaticBrowserRetry('verify')).toBe(true);
    expect(allowsAutomaticBrowserRetry('download')).toBe(true);
  });
});
