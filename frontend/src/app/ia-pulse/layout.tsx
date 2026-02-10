'use client';

import { ChakraProvider, Theme, defaultSystem } from '@chakra-ui/react';

export default function IaPulseLayout({ children }: { children: React.ReactNode }) {
  // Chakra Provider is scoped to IA Pulse only so it doesn't affect the rest of the app styling.
  return (
    <ChakraProvider value={defaultSystem}>
      <Theme appearance="dark" hasBackground={false}>
        {children}
      </Theme>
    </ChakraProvider>
  );
}

