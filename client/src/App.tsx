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
import { Handoff } from './screens/Handoff';
import { Templates } from './screens/Templates';
import { Favorites } from './screens/Favorites';
import { Admin } from './screens/Admin';
import { Privacy } from './screens/Privacy';
import { Terms } from './screens/Terms';
import { OfflineBadge } from './components/OfflineBadge';
import { CookieBanner } from './components/CookieBanner';
import { Footer } from './components/Footer';
import type { AppConfig, MeResponse } from './lib/types';

export default function App() {
  const cfg = useConfig();

  if (cfg.isLoading) return <Loading label="Loading config" />;
  if (cfg.error || !cfg.data?.firebaseConfig?.apiKey) {
    return <Login />;
  }

  initFirebase(cfg.data.firebaseConfig as any);
  return (
    <div className="min-h-screen flex flex-col">
      <OfflineBadge />
      <CookieBanner />
      <main className="flex-1 flex flex-col">
        <Routes>
          {/* Public — no auth gate. Anyone with a valid share token can view. */}
          <Route path="/share/:token" element={<Share />} />
          {/* Public mobile-first hand-off page; the share token gates access. */}
          <Route path="/handoff/share/:token" element={<Handoff />} />
          {/* Public templates library — browsable without auth, clone needs sign-in. */}
          <Route path="/templates" element={<Templates />} />
          {/* Public legal pages — no auth required. */}
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          {/* Everything else funnels through the authed shell. */}
          <Route path="*" element={<AppAuthed />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}

function AppAuthed() {
  const cfg = useConfig();
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

  return <AuthedRoutes me={me.data} config={cfg.data!} />;
}

function AuthedRoutes({ me, config }: { me: MeResponse; config: AppConfig }) {
  return (
    <Routes>
      <Route path="/" element={<Dashboard me={me} config={config} />} />
      <Route path="/builder" element={<Builder />} />
      <Route path="/builder/:tripId" element={<Builder />} />
      <Route path="/viewer/:tripId" element={<Viewer />} />
      <Route path="/handoff/:tripId" element={<Handoff />} />
      <Route path="/favorites" element={<Favorites />} />
      <Route path="/admin" element={<Admin me={me} config={config} />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
