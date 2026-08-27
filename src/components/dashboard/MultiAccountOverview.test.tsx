import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MultiAccountOverview } from './MultiAccountOverview';
import type { AdListItem } from '@/types/ad';

const useAccountsOverview = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/contexts/AccountContext', () => ({
  useAccount: () => ({ activeAccountId: 'default', setActiveAccount: vi.fn() }),
}));
vi.mock('@/hooks/useAccounts', () => ({ useAccountsOverview: () => useAccountsOverview() }));

const onlineAds = [3471966411, 3458799115, 3458801379].map((id, index): AdListItem => ({
  id,
  title: `Online-Anzeige ${index + 1}`,
  active: true,
  type: 'OFFER',
  images: 1,
  repost_count: 0,
  price_reduction_count: 0,
  has_description: true,
  is_changed: false,
  is_orphaned: false,
  is_archived: false,
  file: '',
}));

describe('MultiAccountOverview', () => {
  beforeEach(() => {
    useAccountsOverview.mockReturnValue({
      isLoading: false,
      data: {
        totals: { accounts: 1, connected: 1, active_ads: 1, unread: 0, automations: 0 },
        accounts: [{
          id: 'default',
          display_name: 'Testkonto',
          login_status: 'connected',
          active_ads: 1,
          unread: 0,
        }],
        recent_ads: [{
          account_id: 'default',
          account_name: 'Testkonto',
          id: 3471966411,
          title: 'Nur lokal vorhandene Anzeige',
        }],
      },
    });
  });

  it('shows all online ads instead of reducing the active account to its local ads', () => {
    const html = renderToStaticMarkup(<MultiAccountOverview onlineAds={onlineAds} />);

    expect(html).toContain('Aktive Anzeigen');
    expect(html).toContain('3 Anzeigen');
    for (const ad of onlineAds) expect(html).toContain(ad.title);
    expect(html).not.toContain('Nur lokal vorhandene Anzeige');
  });
});
