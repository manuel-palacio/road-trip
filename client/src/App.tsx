import { useEffect } from 'react';
import { useConfig } from './hooks/useConfig';
import { useAuth } from './hooks/useAuth';
import { useMe } from './hooks/useMe';
import { initFirebase, signOutFirebase } from './lib/firebase';
import { ApiError } from './lib/api';
import { Loading } from './screens/Loading';
import { Login } from './screens/Login';
import { Dashboard } from './screens/Dashboard';
import { AccessDenied } from './screens/AccessDenied';

export default function App() {
  const cfg = useConfig();

  // Initialize Firebase as soon as we have config
  useEffect(() => {
    if (cfg.data?.firebaseConfig?.apiKey) {
      initFirebase(cfg.data.firebaseConfig as any);
    }
  }, [cfg.data]);

  if (cfg.isLoading) return <Loading label="Loading config" />;
  if (cfg.error || !cfg.data?.firebaseConfig?.apiKey) {
    return <Login />; // bare login with no config — sign-in will fail visibly
  }

  return <AppAuthed />;
}

function AppAuthed() {
  const auth = useAuth();
  const isSignedIn = auth.status === 'signed-in';
  const me = useMe(isSignedIn);

  if (auth.status === 'loading') return <Loading />;
  if (auth.status === 'signed-out') return <Login />;

  if (me.isLoading) return <Loading label="Loading profile" />;

  if (me.error instanceof ApiError && me.error.status === 403) {
    // Sign out so they can try a different account
    signOutFirebase();
    return <AccessDenied />;
  }

  if (me.error || !me.data) {
    return <Login />;
  }

  return <Dashboard me={me.data} />;
}
