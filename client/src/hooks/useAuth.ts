import { useEffect, useState } from 'react';
import { listenAuth, type User } from '../lib/firebase';

export type AuthState =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; user: User };

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    const unsub = listenAuth((user) => {
      setState(user ? { status: 'signed-in', user } : { status: 'signed-out' });
    });
    return unsub;
  }, []);

  return state;
}
