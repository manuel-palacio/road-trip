import { signOutFirebase } from '../lib/firebase';
import type { MeResponse } from '../lib/types';
import { Brand } from '../components/Brand';

function initials(name: string) {
  if (!name) return '··';
  const parts = name.split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '··';
}

export function Dashboard({ me }: { me: MeResponse }) {
  return (
    <div className="min-h-screen relative">
      <header className="fixed inset-x-0 top-0 z-50 flex items-center justify-between px-9 py-5 border-b border-line bg-canvas/85 backdrop-blur-md">
        <Brand size="sm" />
        <div className="flex items-center gap-[18px]">
          <span className={`font-mono text-[9.5px] tracking-[0.18em] uppercase px-[9px] py-[5px] rounded-full border ${
            me.plan === 'pro'
              ? 'text-accent border-accent bg-accent-soft'
              : 'text-paper-dim border-line-strong'
          }`}>
            {me.plan}
          </span>
          <div className="flex items-center gap-3">
            <div className="relative w-[34px] h-[34px] rounded-full overflow-hidden bg-surface-2 flex items-center justify-center border border-line">
              {me.photoURL ? (
                <img src={me.photoURL} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="font-mono text-[11px] tracking-wide text-paper-dim">{initials(me.displayName || me.email)}</span>
              )}
            </div>
            <span className="text-[14px] max-w-[180px] truncate">{me.displayName || me.email}</span>
          </div>
          <button
            type="button"
            onClick={() => signOutFirebase()}
            className="bg-transparent border border-line text-paper-dim px-[14px] py-[7px] rounded text-[12px] transition-colors duration-200 ease-out-soft hover:border-paper-dim hover:text-paper"
          >
            Sign out
          </button>
        </div>
      </header>
      <main className="max-w-[1100px] mx-auto pt-[140px] px-9 pb-20">
        <div className="font-mono text-[10px] tracking-[0.22em] uppercase text-paper-muted mb-3.5">
          Workspace <span className="text-accent mx-1.5">·</span> trips <span className="text-accent mx-1.5">·</span> {me.tripCount}
        </div>
        <h2 className="font-serif italic font-normal text-[clamp(48px,7vw,76px)] tracking-tight leading-none">
          Your trips
        </h2>
        <div className="mt-10 p-12 border border-dashed border-line-strong rounded-lg text-center">
          <p className="font-serif italic text-[18px] text-paper-dim max-w-[420px] mx-auto leading-[1.5]">
            Trip cards, builder, viewer and the rest of the editor are migrating to React over the next few commits.
          </p>
        </div>
      </main>
    </div>
  );
}
