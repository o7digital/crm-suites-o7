'use client';

import { useMemo, useState } from 'react';
import { AppShell } from '../../components/AppShell';
import { Guard } from '../../components/Guard';
import { useIA } from '@/hooks/useIA';
import {
  Alert,
  Box,
  Button,
  Card,
  Heading,
  Input,
  Separator,
  SimpleGrid,
  Spinner,
  Stack,
  Text,
  Textarea,
} from '@chakra-ui/react';

export default function IaPulsePage() {
  const [text, setText] = useState('');
  const [leadName, setLeadName] = useState('');

  const {
    analyzeLead,
    summarize,
    generateEmail,
    improveProposal,
    reset,
    sentiment,
    summary,
    draftEmail,
    improvedProposal,
    loadingSentiment,
    loadingSummary,
    loadingEmail,
    loadingImprove,
    errorSentiment,
    errorSummary,
    errorEmail,
    errorImprove,
  } = useIA();

  const canUseText = useMemo(() => text.trim().length > 0, [text]);
  const canGenerateEmail = useMemo(
    () => canUseText && leadName.trim().length > 0,
    [canUseText, leadName],
  );

  const clearAll = () => {
    setText('');
    setLeadName('');
    reset();
  };

  const errors = useMemo(
    () =>
      [errorSentiment, errorSummary, errorEmail, errorImprove].filter(
        (x): x is string => Boolean(x),
      ),
    [errorEmail, errorImprove, errorSentiment, errorSummary],
  );

  return (
    <Guard>
      <AppShell>
        <Box maxW="900px" mx="auto" p={{ base: 0, md: 2 }} color="whiteAlpha.900">
          <Heading mb={2} size="lg">
            o7 IA Pulse
          </Heading>
          <Text color="whiteAlpha.700" mb={6}>
            Assistant commercial intelligent (sentiment, emails, devis, resumes)
          </Text>

          <Stack gap={4}>
            <Textarea
              placeholder="Collez ici le texte du lead, notes, email ou devis..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              bg="whiteAlpha.50"
              borderColor="whiteAlpha.200"
              _focusVisible={{ borderColor: 'cyan.300' }}
            />

            <Input
              placeholder="Nom du lead (pour les emails)"
              value={leadName}
              onChange={(e) => setLeadName(e.target.value)}
              bg="whiteAlpha.50"
              borderColor="whiteAlpha.200"
              _focusVisible={{ borderColor: 'cyan.300' }}
            />

            <SimpleGrid columns={{ base: 1, md: 2, lg: 4 }} gap={3}>
              <Button
                colorScheme="blue"
                disabled={!canUseText || loadingSentiment}
                onClick={() => void analyzeLead(text.trim())}
              >
                {loadingSentiment ? <Spinner size="sm" /> : 'Analyser lead'}
              </Button>

              <Button
                colorScheme="teal"
                disabled={!canUseText || loadingSummary}
                onClick={() => void summarize(text.trim())}
              >
                {loadingSummary ? <Spinner size="sm" /> : 'Resumer'}
              </Button>

              <Button
                colorScheme="purple"
                disabled={!canGenerateEmail || loadingEmail}
                onClick={() => void generateEmail(leadName.trim(), text.trim())}
              >
                {loadingEmail ? <Spinner size="sm" /> : 'Generer email'}
              </Button>

              <Button
                colorScheme="orange"
                disabled={!canUseText || loadingImprove}
                onClick={() => void improveProposal(text.trim())}
              >
                {loadingImprove ? <Spinner size="sm" /> : 'Ameliorer devis'}
              </Button>
            </SimpleGrid>

            <Box display="flex" justifyContent="flex-end">
              <Button variant="outline" borderColor="whiteAlpha.300" onClick={clearAll}>
                Effacer tout
              </Button>
            </Box>
          </Stack>

          {errors.length ? (
            <Alert.Root status="error" mt={6} borderRadius="md">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>Erreur</Alert.Title>
                <Alert.Description>
                  <Box mt={1}>
                    {errors.map((message, idx) => (
                      <Text key={`${message}-${idx}`}>{message}</Text>
                    ))}
                  </Box>
                </Alert.Description>
              </Alert.Content>
            </Alert.Root>
          ) : null}

          <Separator my={8} borderColor="whiteAlpha.200" />

          <Stack gap={6}>
            {sentiment ? (
              <Card.Root bg="whiteAlpha.50" borderWidth="1px" borderColor="whiteAlpha.200">
                <Card.Body>
                  <Heading size="sm" mb={2}>
                    Analyse de sentiment
                  </Heading>
                  <Box as="pre" fontSize="sm" whiteSpace="pre-wrap">
                    {JSON.stringify(sentiment, null, 2)}
                  </Box>
                </Card.Body>
              </Card.Root>
            ) : null}

            {summary?.summary ? (
              <Card.Root bg="whiteAlpha.50" borderWidth="1px" borderColor="whiteAlpha.200">
                <Card.Body>
                  <Heading size="sm" mb={2}>
                    Resume
                  </Heading>
                  <Text whiteSpace="pre-wrap">{summary.summary}</Text>
                </Card.Body>
              </Card.Root>
            ) : null}

            {draftEmail ? (
              <Card.Root bg="whiteAlpha.50" borderWidth="1px" borderColor="whiteAlpha.200">
                <Card.Body>
                  <Heading size="sm" mb={2}>
                    Email genere
                  </Heading>
                  <Text fontWeight="bold">Objet :</Text>
                  <Text mb={3}>{draftEmail.subject || '—'}</Text>
                  <Text whiteSpace="pre-wrap">{draftEmail.body || '—'}</Text>
                </Card.Body>
              </Card.Root>
            ) : null}

            {improvedProposal?.improvedProposal ? (
              <Card.Root bg="whiteAlpha.50" borderWidth="1px" borderColor="whiteAlpha.200">
                <Card.Body>
                  <Heading size="sm" mb={2}>
                    Proposition amelioree
                  </Heading>
                  <Text whiteSpace="pre-wrap">{improvedProposal.improvedProposal}</Text>
                </Card.Body>
              </Card.Root>
            ) : null}
          </Stack>
        </Box>
      </AppShell>
    </Guard>
  );
}
