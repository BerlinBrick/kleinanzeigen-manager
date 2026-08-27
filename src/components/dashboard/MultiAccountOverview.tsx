'use client';

import { useRouter } from 'next/navigation';
import { Card, Badge, Spinner } from '@/components/ui';
import { useAccount } from '@/contexts/AccountContext';
import { useAccountsOverview } from '@/hooks/useAccounts';
import type { AdListItem } from '@/types/ad';
import styles from './MultiAccountOverview.module.scss';

const STATUS: Record<string, { label: string; variant: 'success' | 'warning' | 'muted' }> = {
  connected: { label: 'Verbunden', variant: 'success' },
  disconnected: { label: 'Getrennt', variant: 'warning' },
  no_credentials: { label: 'Keine Daten', variant: 'muted' },
};

/** Cross-account dashboard: totals + a compact per-account overview. */
export function MultiAccountOverview({ onlineAds }: { onlineAds: AdListItem[] }) {
  const { data, isLoading } = useAccountsOverview();
  const { setActiveAccount, activeAccountId } = useAccount();
  const router = useRouter();

  if (isLoading || !data) {
    return (
      <div className={styles.loading}><Spinner size="lg" /></div>
    );
  }

  const { totals, accounts, recent_ads } = data;
  const activeAccount = accounts.find((account) => account.id === activeAccountId);
  const displayedRecentAds = [
    ...onlineAds.map((ad) => ({
      account_id: activeAccountId,
      account_name: activeAccount?.display_name ?? '',
      id: ad.id ?? null,
      title: ad.title,
    })),
    ...recent_ads.filter((ad) => ad.account_id !== activeAccountId),
  ];

  const tiles = [
    { label: 'Konten verbunden', value: `${totals.connected}/${totals.accounts}` },
    {
      label: 'Aktive Anzeigen',
      value: totals.active_ads
        - (activeAccount?.active_ads ?? 0)
        + onlineAds.length,
    },
    { label: 'Ungelesene Nachrichten', value: totals.unread },
    { label: 'Automatisierungen', value: totals.automations },
  ];

  return (
    <div className={styles.wrap} data-testid="multi-account-overview">
      <div className={styles.tiles}>
        {tiles.map((t) => (
          <Card key={t.label} className={styles.tile}>
            <Card.Body>
              <span className={styles.tileValue}>{t.value}</span>
              <span className={styles.tileLabel}>{t.label}</span>
            </Card.Body>
          </Card>
        ))}
      </div>

      <div className={styles.columns}>
        <Card className={styles.panel}>
          <Card.Header><Card.Title>Konten-Übersicht</Card.Title></Card.Header>
          <Card.Body>
            <div className={styles.accountList} data-testid="overview-account-list">
              {accounts.map((a) => {
                const status = STATUS[a.login_status] ?? STATUS.disconnected;
                return (
                  <button
                    key={a.id}
                    type="button"
                    className={`${styles.accountRow} ${a.id === activeAccountId ? styles.accountRowActive : ''}`}
                    onClick={() => setActiveAccount(a.id)}
                    data-testid={`overview-account-${a.id}`}
                  >
                    <div className={styles.accountMain}>
                      <span className={styles.accountName}>{a.display_name}</span>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </div>
                    <div className={styles.accountMeta}>
                      <span>{a.id === activeAccountId ? onlineAds.length : a.active_ads} Anzeigen</span>
                      <span className={a.unread ? styles.unread : ''}>
                        {a.unread ?? 0} ungelesen
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </Card.Body>
        </Card>

        <Card className={styles.panel}>
          <Card.Header><Card.Title>Zuletzt veröffentlicht</Card.Title></Card.Header>
          <Card.Body>
            {displayedRecentAds.length === 0 ? (
              <p className={styles.empty}>Noch keine Anzeigen.</p>
            ) : (
              <div className={styles.recentList} data-testid="overview-recent-list">
                {displayedRecentAds.map((r, i) => (
                  <div key={`${r.account_id}-${r.id ?? i}`} className={styles.recentRow}>
                    <span className={styles.recentTitle}>{r.title}</span>
                    <Badge variant="info">{r.account_name}</Badge>
                  </div>
                ))}
              </div>
            )}
          </Card.Body>
        </Card>
      </div>

      <button className={styles.manageLink} onClick={() => router.push('/accounts')} data-testid="overview-manage-accounts">
        Alle Konten verwalten →
      </button>
    </div>
  );
}
