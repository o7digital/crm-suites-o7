'use client';

import { ReactNode } from 'react';
import { ClerkProvider } from '@clerk/nextjs';
import { AuthProvider } from '../contexts/AuthContext';
import { BrandingProvider } from '../contexts/BrandingContext';
import { I18nProvider } from '../contexts/I18nContext';

export function Providers({ children }: { children: ReactNode }) {
  const hasClerk = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

  const content = (
    <AuthProvider>
      <I18nProvider>
        <BrandingProvider>{children}</BrandingProvider>
      </I18nProvider>
    </AuthProvider>
  );

  if (hasClerk) {
    return <ClerkProvider>{content}</ClerkProvider>;
  }

  return (
    content
  );
}
