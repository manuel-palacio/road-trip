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

  if (cfg.isLoading) return <Loading label="Loading config" />;
  if (cfg.error || !cfg.data?.firebaseConfig?.apiKey) {
    // No config → render bare Login; clicking sign-in will surface the error
    return <Login />;
  }

  // Init synchronously BEFORE rendering AppAuthed so its child hooks can use
  // getFirebaseAuth() on the same render. initFirebase is idempotent.
  initFirebase(cfg.data.firebaseConfig as any);

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
