// Screen 4: the state of the group (wireframe gruppenuebersicht.html).

import { useState } from 'react';
import { balanceText } from '../format';
import { useGroup } from '../group';
import { navigate } from '../router';
import { invitationLink, shareInvitation } from '../share';
import { Button, Card, Dialog, IconButton, MenuIcon, Screen, SectionTitle, useToast } from '../ui';

export function Overview() {
  const group = useGroup();
  const [toast, showToast] = useToast();
  const [showLink, setShowLink] = useState(false);

  const share = async () => {
    const result = await shareInvitation(group.token, group.name);
    if (result === 'copied') showToast('Link kopiert');
    if (result === 'unavailable') setShowLink(true);
  };

  // People who are even and no longer in the group need no line.
  const rows = group.members.filter(
    (member) => member.active || (group.balances.get(member.id) ?? 0) !== 0,
  );

  return (
    <Screen
      title={group.name}
      actions={
        <>
          <Button variant="text" className="px-3" onClick={() => void share()}>
            Link teilen
          </Button>
          <IconButton
            label="Gruppeneinstellungen"
            onClick={() => navigate(`/g/${group.token}/einstellungen`)}
          >
            <MenuIcon />
          </IconButton>
        </>
      }
    >
      <div className="flex flex-col gap-5 p-4">
        <section className="flex flex-col gap-2" aria-label="Salden">
          <div className="flex min-h-11 items-center">
            <div className="flex-1">
              <SectionTitle>Salden</SectionTitle>
            </div>
          </div>
          <Card>
            {rows.map((member) => {
              const cents = group.balances.get(member.id) ?? 0;
              const isMe = member.id === group.me.id;
              return (
                <div key={member.id} className="flex gap-3 px-3.5 py-3">
                  <span className={`min-w-0 flex-1 truncate ${isMe ? 'font-semibold' : ''}`}>
                    {group.label(member.id)}
                    {!member.active && <span className="text-muted"> (entfernt)</span>}
                  </span>
                  <span className={cents > 0 ? 'font-semibold' : 'text-muted'}>
                    {balanceText(cents)}
                  </span>
                </div>
              );
            })}
          </Card>
        </section>
      </div>
      {toast}
      {showLink && (
        <Dialog title="Link teilen" onClose={() => setShowLink(false)}>
          <p className="m-0 text-sm text-muted">
            Wer diesen Link hat, darf in der Gruppe alles. Gib ihn nur an Mitglieder weiter.
          </p>
          <p className="m-0 select-all break-all rounded-lg border border-line bg-panel p-3 text-sm">
            {invitationLink(group.token)}
          </p>
        </Dialog>
      )}
    </Screen>
  );
}
