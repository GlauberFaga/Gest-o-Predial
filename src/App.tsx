/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { signInWithCustomToken } from 'firebase/auth';
import { auth } from './lib/firebase';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import ErrorBoundary from './components/ErrorBoundary';
import Login from './components/Login';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Vencimentos from './pages/Vencimentos';
import Kanban from './pages/Kanban';
import Estrutura from './pages/Estrutura';
import Usuarios from './pages/Usuarios';
import Relatorios from './pages/Relatorios';
import Empresas from './pages/Empresas';
import Auditoria from './pages/Auditoria';

const ssoExchangeCache = new Map<string, Promise<void>>();

function readSsoTokenFromUrl(): string | null {
  const searchParams = new URLSearchParams(window.location.search);
  const fromSearch = searchParams.get('sso_token') || searchParams.get('ssoToken');
  if (fromSearch) return fromSearch;

  const hash = window.location.hash || '';
  const hashQueryIdx = hash.indexOf('?');
  if (hashQueryIdx !== -1) {
    const hashParams = new URLSearchParams(hash.slice(hashQueryIdx + 1));
    return hashParams.get('sso_token') || hashParams.get('ssoToken');
  }

  return null;
}

function clearSsoTokenFromUrl(): void {
  const searchParams = new URLSearchParams(window.location.search);
  let changed = false;

  if (searchParams.has('sso_token')) {
    searchParams.delete('sso_token');
    changed = true;
  }
  if (searchParams.has('ssoToken')) {
    searchParams.delete('ssoToken');
    changed = true;
  }

  let newHash = window.location.hash || '';
  const hashQueryIdx = newHash.indexOf('?');
  if (hashQueryIdx !== -1) {
    const hashPrefix = newHash.slice(0, hashQueryIdx);
    const hashParams = new URLSearchParams(newHash.slice(hashQueryIdx + 1));
    let hashChanged = false;

    if (hashParams.has('sso_token')) {
      hashParams.delete('sso_token');
      hashChanged = true;
    }
    if (hashParams.has('ssoToken')) {
      hashParams.delete('ssoToken');
      hashChanged = true;
    }

    if (hashChanged) {
      const q = hashParams.toString();
      newHash = `${hashPrefix}${q ? `?${q}` : ''}`;
      changed = true;
    }
  }

  if (changed) {
    const newSearch = searchParams.toString();
    const cleanUrl = `${window.location.pathname}${newSearch ? `?${newSearch}` : ''}${newHash}`;
    window.history.replaceState({}, document.title, cleanUrl);
  }
}

function performSsoExchange(token: string): Promise<void> {
  const existing = ssoExchangeCache.get(token);
  if (existing) return existing;

  const promise = (async () => {
    const response = await fetch('/api/sso/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sso_token: token, ssoToken: token }),
    });

    const data = (await response.json().catch(() => ({}))) as {
      customToken?: string;
      error?: string;
    };

    if (!response.ok || !data.customToken) {
      throw new Error(data.error || 'Falha ao validar token SSO');
    }

    await signInWithCustomToken(auth, data.customToken);
  })();

  ssoExchangeCache.set(token, promise);
  return promise;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { currentUser, userData, logout } = useAuth();
  if (!currentUser) return <Navigate to="/login" replace />;
  if (userData && userData.active === false) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center text-neutral-300">
        <div className="text-center p-8 bg-[#141414] border border-[#262626] rounded-xl shadow-lg">
          <h2 className="text-2xl font-bold text-red-400 mb-2">Conta Inativa</h2>
          <p className="mb-6">Sua conta foi desativada pelo administrador.</p>
          <button
            onClick={logout}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            Sair
          </button>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

function AppRoutes() {
  const { currentUser } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={currentUser ? <Navigate to="/" replace /> : <Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="vencimentos" element={<Vencimentos />} />
        <Route path="manutencao" element={<Kanban />} />
        <Route path="estrutura" element={<Estrutura />} />
        <Route path="empresas" element={<Empresas />} />
        <Route path="usuarios" element={<Usuarios />} />
        <Route path="relatorios" element={<Relatorios />} />
        <Route path="auditoria" element={<Auditoria />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  const [ssoToken] = useState<string | null>(() => readSsoTokenFromUrl());
  const [ssoLoading, setSsoLoading] = useState<boolean>(Boolean(ssoToken));
  const [ssoError, setSsoError] = useState<string | null>(null);

  useEffect(() => {
    if (!ssoToken) return;

    let active = true;
    clearSsoTokenFromUrl();

    performSsoExchange(ssoToken)
      .then(() => {
        if (active) {
          setSsoLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (active) {
          setSsoError(
            err instanceof Error ? err.message : 'Falha na autenticação via Portal.'
          );
          setSsoLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [ssoToken]);

  if (ssoLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center gap-4 text-neutral-200 px-4">
        <div className="h-10 w-10 rounded-full border-2 border-indigo-500/30 border-t-indigo-500 animate-spin" />
        <p className="text-sm font-medium text-neutral-300">Autenticando via Portal...</p>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <AuthProvider initialSsoError={ssoError}>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}
