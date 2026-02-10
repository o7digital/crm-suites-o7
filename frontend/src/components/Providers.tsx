'use client';

import { ReactNode } from 'react';
import { AuthProvider } from '../contexts/AuthContext';
import { I18nProvider } from '../contexts/I18nContext';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      <AuthProvider>{children}</AuthProvider>
    </I18nProvider>
  );
}
