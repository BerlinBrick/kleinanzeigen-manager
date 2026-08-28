'use client';

import { useState } from 'react';
import { Card, Button, Badge, Modal, Input, EmptyState, PageLoader, useToast, showConfirm } from '@/components/ui';
import { useAccount } from '@/contexts/AccountContext';
import {
  useAccountsList,
  useCreateAccount,
  useRenameAccount,
  useDisconnectAccount,
  useDeleteAccount,
  useAccountCredentials,
  useSetCredentials,
} from '@/hooks/useAccounts';
import { api } from '@/lib/api/client';
import { useVncLogin } from '@/hooks/useVncLogin';
import { VncLoginModal } from '@/components/bot/VncLoginModal';
import type { AccountSummary } from '@/contexts/AccountContext';
import styles from './page.module.scss';

const STATUS: Record<string, { label: string; variant: 'success' | 'warning' | 'muted' }> = {
  connected: { label: 'Verbunden', variant: 'success' },
  disconnected: { label: 'Getrennt', variant: 'warning' },
  no_credentials: { label: 'Keine Zugangsdaten', variant: 'muted' },
};

function formatSync(iso: string | null): string {
  if (!iso) return 'Nie synchronisiert';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Nie synchronisiert';
  return `Zuletzt: ${d.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}`;
}

export default function AccountsPage() {
  const { data, isLoading } = useAccountsList();
  const { activeAccountId, setActiveAccount, refresh } = useAccount();
  const { toast } = useToast();
  const vnc = useVncLogin(() => {
    refresh();
    toast('success', 'Kleinanzeigen-Konto verbunden');
  });

  const createAccount = useCreateAccount();
  const renameAccount = useRenameAccount();
  const disconnect = useDisconnectAccount();
  const deleteAccount = useDeleteAccount();

  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [editAccount, setEditAccount] = useState<AccountSummary | null>(null);

  const accounts = data?.accounts ?? [];

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      await createAccount.mutateAsync(newName.trim());
      toast('success', `Konto „${newName.trim()}" hinzugefügt`);
      setNewName('');
      setAddOpen(false);
    } catch {
      toast('error', 'Konto konnte nicht angelegt werden');
    }
  };

  const handleConnect = async (a: AccountSummary) => {
    setActiveAccount(a.id);
    toast('info', `Manuelle Anmeldung für „${a.display_name}" wird geöffnet`);
    await vnc.start();
  };

  const handleSync = async (a: AccountSummary) => {
    setActiveAccount(a.id);
    try {
      await api.post('/api/bot/verify', { verbose: true });
      toast('success', `Synchronisierung für „${a.display_name}" gestartet`);
    } catch {
      toast('error', 'Synchronisierung konnte nicht gestartet werden (Bot erforderlich)');
    }
  };

  const handleDisconnect = async (a: AccountSummary) => {
    const ok = await showConfirm(
      'Konto trennen',
      `Die Kleinanzeigen-Sitzung für „${a.display_name}" wird beendet. Zugangsdaten bleiben erhalten.`,
      'Trennen',
      'Abbrechen',
    );
    if (!ok) return;
    try {
      await disconnect.mutateAsync(a.id);
      toast('success', 'Konto getrennt');
    } catch {
      toast('error', 'Trennen fehlgeschlagen');
    }
  };

  const handleRemove = async (a: AccountSummary) => {
    const ok = await showConfirm(
      'Konto entfernen',
      `„${a.display_name}" wird mit allen lokalen Daten entfernt.`,
      'Entfernen',
      'Abbrechen',
      undefined,
      'dangerSolid',
    );
    if (!ok) return;
    try {
      await deleteAccount.mutateAsync(a.id);
      toast('success', 'Konto entfernt');
    } catch {
      toast('error', 'Entfernen fehlgeschlagen');
    }
  };

  if (isLoading) return <PageLoader />;

  return (
    <div className={`${styles.page} animStagger`} data-testid="accounts-page">
      <div className={styles.headerRow}>
        <div>
          <h2 className={styles.pageTitle}>Kleinanzeigen-Konten</h2>
          <p className={styles.subtitle}>
            Verwalte mehrere Kleinanzeigen-Konten mit jeweils eigener Sitzung.
          </p>
        </div>
        <Button variant="primary" onClick={() => setAddOpen(true)} data-testid="add-account-button">
          + Konto hinzufügen
        </Button>
      </div>

      {accounts.length === 0 ? (
        <EmptyState
          title="Noch keine Konten"
          message="Füge dein erstes Kleinanzeigen-Konto hinzu."
          action={<Button variant="primary" onClick={() => setAddOpen(true)}>Konto hinzufügen</Button>}
        />
      ) : (
        <div className={styles.grid} data-testid="accounts-grid">
          {accounts.map((a) => {
            const status = STATUS[a.login_status] ?? STATUS.disconnected;
            const isActive = a.id === activeAccountId;
            return (
              <Card key={a.id} hoverable className={styles.card} data-testid={`account-card-${a.id}`}>
                <Card.Body>
                  <div className={styles.cardTop}>
                    <div className={styles.cardTitleGroup}>
                      <h3 className={styles.cardName}>{a.display_name}</h3>
                      {a.is_default && <Badge variant="info">Standard</Badge>}
                      {isActive && <Badge variant="primary">Aktiv</Badge>}
                    </div>
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </div>

                  <div className={styles.stats}>
                    <div className={styles.stat}>
                      <span className={styles.statValue}>{a.ad_count}</span>
                      <span className={styles.statLabel}>Anzeigen</span>
                    </div>
                    <div className={styles.stat}>
                      <span className={styles.statValue}>{a.unread ?? '–'}</span>
                      <span className={styles.statLabel}>Ungelesen</span>
                    </div>
                  </div>

                  <p className={styles.syncInfo}>{formatSync(a.last_sync)}</p>

                  <div className={styles.actions}>
                    {!isActive && (
                      <Button size="sm" variant="secondary" onClick={() => setActiveAccount(a.id)} data-testid={`select-account-${a.id}`}>
                        Auswählen
                      </Button>
                    )}
                    <Button size="sm" variant="primary" loading={vnc.busy && isActive} onClick={() => void handleConnect(a)} data-testid={`connect-account-${a.id}`}>
                      Anmelden
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => handleSync(a)} data-testid={`sync-account-${a.id}`}>
                      Synchronisieren
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditAccount(a)} data-testid={`edit-account-${a.id}`}>
                      Bearbeiten
                    </Button>
                    {a.login_status === 'connected' && (
                      <Button size="sm" variant="ghost" onClick={() => handleDisconnect(a)} data-testid={`disconnect-account-${a.id}`}>
                        Trennen
                      </Button>
                    )}
                    {!a.is_default && (
                      <Button size="sm" variant="danger" onClick={() => handleRemove(a)} data-testid={`remove-account-${a.id}`}>
                        Entfernen
                      </Button>
                    )}
                  </div>
                </Card.Body>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Konto hinzufügen"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>Abbrechen</Button>
            <Button variant="primary" loading={createAccount.isPending} onClick={handleCreate} data-testid="create-account-submit">
              Anlegen
            </Button>
          </>
        }
      >
        <Input
          label="Anzeigename"
          placeholder="z. B. BerlinBrick, Privat, Sales"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
          data-testid="new-account-name-input"
          autoFocus
        />
        <p className={styles.modalHint}>
          Zugangsdaten kannst du direkt nach dem Anlegen unter „Bearbeiten&quot; hinterlegen.
        </p>
      </Modal>

      {editAccount && (
        <EditAccountModal
          account={editAccount}
          onClose={() => setEditAccount(null)}
          onRename={async (name) => {
            await renameAccount.mutateAsync({ id: editAccount.id, display_name: name });
          }}
        />
      )}
      <VncLoginModal open={vnc.modalOpen} token={vnc.token} onClose={() => void vnc.close()} />
    </div>
  );
}

function EditAccountModal({
  account,
  onClose,
  onRename,
}: {
  account: AccountSummary;
  onClose: () => void;
  onRename: (name: string) => Promise<void>;
}) {
  const { toast } = useToast();
  const { data: creds } = useAccountCredentials(account.id);
  const setCreds = useSetCredentials();
  const [name, setName] = useState(account.display_name);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);

  // Prefill username once credentials load
  if (creds && username === '' && creds.username) {
    setUsername(creds.username);
  }

  const handleSave = async () => {
    setSaving(true);
    try {
      if (name.trim() && name.trim() !== account.display_name) {
        await onRename(name.trim());
      }
      if (username.trim()) {
        await setCreds.mutateAsync({ id: account.id, username: username.trim(), password });
      }
      toast('success', 'Konto aktualisiert');
      onClose();
    } catch {
      toast('error', 'Speichern fehlgeschlagen');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`„${account.display_name}" bearbeiten`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Abbrechen</Button>
          <Button variant="primary" loading={saving} onClick={handleSave} data-testid="save-account-edit">
            Speichern
          </Button>
        </>
      }
    >
      <Input
        label="Anzeigename"
        value={name}
        onChange={(e) => setName(e.target.value)}
        data-testid="edit-account-name-input"
      />
      <div style={{ marginTop: 'var(--space-4)' }}>
        <Input
          label="Kleinanzeigen-Benutzername (E-Mail)"
          placeholder="konto@example.com"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          data-testid="edit-account-username-input"
        />
      </div>
      <div style={{ marginTop: 'var(--space-4)' }}>
        <Input
          label="Kleinanzeigen-Passwort"
          type="password"
          placeholder={creds?.password ? '•••••••• (unverändert)' : 'Passwort'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hint="Leer lassen, um das gespeicherte Passwort beizubehalten."
          data-testid="edit-account-password-input"
        />
      </div>
    </Modal>
  );
}
