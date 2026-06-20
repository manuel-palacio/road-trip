import { useState } from 'react';

type Props = {
  collaborators: string[];
  collaboratorProfiles: Record<string, { displayName: string; photoURL: string }>;
  onRemove: (uid: string) => Promise<void>;
};

export function CollaboratorList({ collaborators, collaboratorProfiles, onRemove }: Props) {
  const [removingUid, setRemovingUid] = useState<string | null>(null);

  if (collaborators.length === 0) {
    return (
      <p className="text-paper-muted text-[11.5px] italic">
        No collaborators yet. Invite someone above.
      </p>
    );
  }

  async function handleRemove(uid: string) {
    setRemovingUid(uid);
    try {
      await onRemove(uid);
    } finally {
      setRemovingUid(null);
    }
  }

  return (
    <ul className="space-y-1.5">
      {collaborators.map((uid) => {
        const profile = collaboratorProfiles[uid];
        const label = profile?.displayName || uid.slice(0, 8) + '…';
        return (
          <li key={uid} className="flex items-center justify-between gap-2">
            <span className="text-paper text-[12px] truncate" title={uid}>
              {label}
            </span>
            <button
              type="button"
              onClick={() => handleRemove(uid)}
              disabled={removingUid === uid}
              className="shrink-0 text-paper-muted hover:text-accent text-[11px] font-mono uppercase tracking-[0.16em] disabled:opacity-50 transition-colors"
              aria-label={`Remove ${label}`}
            >
              {removingUid === uid ? '…' : 'Remove'}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
