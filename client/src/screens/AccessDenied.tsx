import { signOutFirebase } from '../lib/firebase';

export function AccessDenied() {
  return (
    <div className="min-h-screen flex items-center justify-center px-8">
      <div className="max-w-[480px] w-full text-center">
        <div className="font-mono text-[10px] tracking-[0.22em] uppercase text-accent mb-[18px] animate-rise [animation-delay:0.05s]">
          Access · denied
        </div>
        <h1 className="font-serif italic font-normal text-[clamp(48px,8vw,72px)] tracking-tight leading-none animate-rise [animation-delay:0.15s]">
          Not on the list.
        </h1>
        <div className="mx-auto my-7 w-[60px] h-px route-mark-muted animate-rise [animation-delay:0.28s]" aria-hidden />
        <p className="text-[15px] text-paper-dim leading-[1.65] animate-rise [animation-delay:0.4s]">
          This site is in private beta. Only invited Google accounts can sign in.
          If you think you should have access, ping the owner.
        </p>
        <div className="mt-9 flex gap-3 justify-center animate-rise [animation-delay:0.5s]">
          <button
            type="button"
            onClick={() => signOutFirebase()}
            className="bg-transparent border border-line text-paper-dim px-[14px] py-[7px] rounded text-[12px] tracking-wide transition-colors duration-200 ease-out-soft hover:border-paper-dim hover:text-paper"
          >
            Try a different account
          </button>
        </div>
      </div>
    </div>
  );
}
