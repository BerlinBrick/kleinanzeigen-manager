'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount } from '@/contexts/AccountContext';
import styles from './AccountSwitcher.module.scss';

const STATUS_DOT: Record<string, string> = {
  connected: styles.dotConnected,
  disconnected: styles.dotDisconnected,
  no_credentials: styles.dotNone,
};

/**
 * Header account switcher: selects the ACTIVE Kleinanzeigen account. Every
 * account-scoped request is then routed to that account's isolated session.
 */
export function AccountSwitcher() {
  const { accounts, activeAccount, setActiveAccount } = useAccount();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [open]);

  if (!accounts.length) return null;

  return (
    <div className={styles.switcher} ref={ref} data-testid="account-switcher">
      <button
        type="button"
        className={styles.trigger}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        title="Kleinanzeigen-Konto wechseln"
        data-testid="account-switcher-trigger"
      >
        <span className={`${styles.dot} ${STATUS_DOT[activeAccount?.login_status ?? 'disconnected']}`} />
        <span className={styles.name}>{activeAccount?.display_name ?? 'Konto'}</span>
        <svg className={styles.chevron} viewBox="0 0 24 24" width="14" height="14">
          <polyline points="6 9 12 15 18 9" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      </button>

      {open && (
        <div className={styles.menu} data-testid="account-switcher-menu">
          <div className={styles.menuLabel}>Kleinanzeigen-Konten</div>
          {accounts.map((a) => (
            <button
              key={a.id}
              type="button"
              className={`${styles.item} ${a.id === activeAccount?.id ? styles.itemActive : ''}`}
              onClick={() => {
                setActiveAccount(a.id);
                setOpen(false);
              }}
              data-testid={`account-option-${a.id}`}
            >
              <span className={`${styles.dot} ${STATUS_DOT[a.login_status]}`} />
              <span className={styles.itemName}>{a.display_name}</span>
              <span className={styles.itemMeta}>
                {a.ad_count} Anz.
                {a.unread ? ` · ${a.unread} neu` : ''}
              </span>
            </button>
          ))}
          <div className={styles.separator} />
          <button
            type="button"
            className={styles.manage}
            onClick={() => {
              setOpen(false);
              router.push('/accounts');
            }}
            data-testid="account-switcher-manage"
          >
            + Konten verwalten
          </button>
        </div>
      )}
    </div>
  );
}
