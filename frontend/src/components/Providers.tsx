'use client';

import { ReactNode } from 'react';
import { AuthProvider } from '../contexts/AuthContext';
import { BrandingProvider } from '../contexts/BrandingContext';
import { I18nProvider } from '../contexts/I18nContext';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      <AuthProvider>
        <BrandingProvider>{children}</BrandingProvider>
      </AuthProvider>
    </I18nProvider>
  );
}
