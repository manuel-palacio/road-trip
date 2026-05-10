import { Routes, Route, Navigate } from 'react-router-dom';
import { useConfig } from './hooks/useConfig';
import { useAuth } from './hooks/useAuth';
import { useMe } from './hooks/useMe';
import { initFirebase, signOutFirebase } from './lib/firebase';
import { ApiError } from './lib/api';
import { Loading } from './screens/Loading';
import { Login } from './screens/Login';
import { Dashboard } from './screens/Dashboard';
import { AccessDenied } from './screens/AccessDenied';
import { Builder } from './screens/Builder';
import { Viewer } from './screens/Viewer';
import { Share } from './screens/Share';
import type { MeResponse } from './lib/types';

export default function App() {
  const cfg = useConfig();

  if (cfg.isLoading) return <Loading label="Loading config" />;
  if (cfg.error || !cfg.data?.firebaseConfig?.apiKey) {
    return <Login />;
  }

  initFirebase(cfg.data.firebaseConfig as any);
  return (
    <Routes>
      {/* Public — no auth gate. Anyone with a valid share token can view. */}
      <Route path="/share/:token" element={<Share />} />
      {/* Everything else funnels through the authed shell. */}
      <Route path="*" element={<AppAuthed />} />
    </Routes>
  );
}

function AppAuthed() {
  const auth = useAuth();
  const isSignedIn = auth.status === 'signed-in';
  const me = useMe(isSignedIn);

  if (auth.status === 'loading') return <Loading />;
  if (auth.status === 'signed-out') return <Login />;

  if (me.isLoading) return <Loading label="Loading profile" />;

  if (me.error instanceof ApiError && me.error.status === 403) {
    signOutFirebase();
    return <AccessDenied />;
  }

  if (me.error || !me.data) {
    return <Login />;
  }

  return <AuthedRoutes me={me.data} />;
}

function AuthedRoutes({ me }: { me: MeResponse }) {
  return (
    <Routes>
      <Route path="/" element={<Dashboard me={me} />} />
      <Route path="/builder" element={<Builder />} />
      <Route path="/builder/:tripId" element={<Builder />} />
      <Route path="/viewer/:tripId" element={<Viewer />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
