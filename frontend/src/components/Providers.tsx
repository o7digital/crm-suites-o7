'use client';

import { ReactNode } from 'react';
import { ChakraProvider, Theme, defaultSystem } from '@chakra-ui/react';
import { AuthProvider } from '../contexts/AuthContext';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ChakraProvider value={defaultSystem}>
      <Theme appearance="dark" hasBackground={false}>
        <AuthProvider>{children}</AuthProvider>
      </Theme>
    </ChakraProvider>
  );
}
