'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AppShell } from '../../components/AppShell';
import { Guard } from '../../components/Guard';
import { useApi, useAuth } from '@/contexts/AuthContext';
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

type Pipeline = {
  id: string;
  name: string;
  isDefault?: boolean;
};

type Stage = {
  id: string;
  name: string;
  status: 'OPEN' | 'WON' | 'LOST';
  position: number;
  probability: number;
  pipelineId: string;
};

type Client = {
  firstName?: string | null;
  name?: string | null;
  company?: string | null;
};

type Deal = {
  id: string;
  title: string;
  value: number | string;
  currency: string;
  expectedCloseDate?: string | null;
  stageId: string;
  pipelineId: string;
  client?: Client | null;
  stage?: {
    id: string;
    name: string;
    status: 'OPEN' | 'WON' | 'LOST';
    probability: number;
    position: number;
  };
};

function getClientLabel(client?: Client | null): string {
  if (!client) return '';
  const parts = [client.firstName, client.name]
    .map((x) => String(x || '').trim())
    .filter(Boolean);
  const fullName = parts.join(' ').trim();
  if (fullName) return fullName;
  return String(client.name || '').trim();
}

function toErrorMessage(err: unknown): string {
  if (!err) return 'Unknown error';
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function IaPulsePageContent() {
  const searchParams = useSearchParams();
  const prefilledDealId = searchParams.get('dealId') || '';
  const { token } = useAuth();
  const api = useApi(token);

  const [text, setText] = useState('');
  const [leadName, setLeadName] = useState('');
  const iaUiBuild = 'ia-ui-crm-lead-analysis-v1';
  const apiTarget =
    process.env.NEXT_PUBLIC_API_ROOT || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [pipelineId, setPipelineId] = useState('');
  const [stages, setStages] = useState<Stage[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [dealId, setDealId] = useState('');
  const [loadingCrm, setLoadingCrm] = useState(false);
  const [errorCrm, setErrorCrm] = useState<string | null>(null);
  const [applyInfo, setApplyInfo] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applyingRecommendation, setApplyingRecommendation] = useState(false);

  const {
    analyzeLead,
    analyzeCrmLead,
    summarize,
    generateEmail,
    improveProposal,
    fetchDiagnostics,
    reset,
    sentiment,
    summary,
    draftEmail,
    improvedProposal,
    leadAnalysis,
    loadingSentiment,
    loadingSummary,
    loadingEmail,
    loadingImprove,
    loadingLeadAnalysis,
    errorSentiment,
    errorSummary,
    errorEmail,
    errorImprove,
    errorLeadAnalysis,
    diagnostics,
    loadingDiagnostics,
    errorDiagnostics,
  } = useIA();

  useEffect(() => {
    if (!token) return;
    void fetchDiagnostics().catch(() => undefined);
  }, [fetchDiagnostics, token]);

  useEffect(() => {
    if (!token) return;
    let active = true;
    setErrorCrm(null);

    api<Pipeline[]>('/pipelines')
      .then((raw) => {
        if (!active) return;
        let filtered = raw.filter((p) => p.name !== 'B2C');
        if (filtered.length === 0) filtered = raw;
        setPipelines(filtered);
        setPipelineId((prev) => {
          if (prev && filtered.some((p) => p.id === prev)) return prev;
          const fallback = filtered.find((p) => p.name === 'New Sales') || filtered.find((p) => p.isDefault) || filtered[0];
          return fallback?.id || '';
        });
      })
      .catch((err) => {
        if (!active) return;
        setErrorCrm(toErrorMessage(err));
      });

    return () => {
      active = false;
    };
  }, [api, token]);

  useEffect(() => {
    if (!token) return;
    if (!prefilledDealId) return;
    let active = true;

    api<Deal>(`/deals/${prefilledDealId}`)
      .then((deal) => {
        if (!active) return;
        setPipelineId(deal.pipelineId);
        setDealId(deal.id);
        setLeadName((prev) => (prev.trim() ? prev : deal.title || ''));
      })
      .catch(() => {
        // Ignore invalid/missing deal ids in URL.
      });

    return () => {
      active = false;
    };
  }, [api, prefilledDealId, token]);

  const loadPipelineContext = useCallback(
    async (targetPipelineId: string, preferredDealId?: string) => {
      if (!targetPipelineId) {
        setStages([]);
        setDeals([]);
        setDealId('');
        return;
      }

      setLoadingCrm(true);
      setErrorCrm(null);
      try {
        const [pipelineStages, pipelineDeals] = await Promise.all([
          api<Stage[]>(`/stages?pipelineId=${targetPipelineId}`),
          api<Deal[]>(`/deals?pipelineId=${targetPipelineId}`),
        ]);

        setStages(pipelineStages);
        setDeals(pipelineDeals);
        setDealId((prev) => {
          if (preferredDealId && pipelineDeals.some((d) => d.id === preferredDealId)) return preferredDealId;
          if (prev && pipelineDeals.some((d) => d.id === prev)) return prev;
          return pipelineDeals[0]?.id || '';
        });
      } catch (err) {
        setErrorCrm(toErrorMessage(err));
        setStages([]);
        setDeals([]);
      } finally {
        setLoadingCrm(false);
      }
    },
    [api],
  );

  useEffect(() => {
    if (!token || !pipelineId) return;
    void loadPipelineContext(pipelineId, prefilledDealId || undefined);
  }, [loadPipelineContext, pipelineId, prefilledDealId, token]);

  const canUseText = useMemo(() => text.trim().length > 0, [text]);
  const canGenerateEmail = useMemo(
    () => canUseText && leadName.trim().length > 0,
    [canUseText, leadName],
  );

  const stageById = useMemo(() => {
    const map: Record<string, Stage> = {};
    for (const stage of stages) map[stage.id] = stage;
    return map;
  }, [stages]);

  const selectedDeal = useMemo(() => deals.find((deal) => deal.id === dealId) || null, [dealId, deals]);
  const selectedDealStage =
    (selectedDeal ? stageById[selectedDeal.stageId] : null) ||
    (selectedDeal?.stage
      ? {
          id: selectedDeal.stage.id,
          name: selectedDeal.stage.name,
          status: selectedDeal.stage.status,
          probability: selectedDeal.stage.probability,
          position: selectedDeal.stage.position,
          pipelineId: selectedDeal.pipelineId,
        }
      : null);

  const clearAll = () => {
    setText('');
    setLeadName('');
    setApplyInfo(null);
    setApplyError(null);
    reset();
  };

  const errors = useMemo(
    () =>
      [errorSentiment, errorSummary, errorEmail, errorImprove, errorLeadAnalysis].filter(
        (x): x is string => Boolean(x),
      ),
    [errorEmail, errorImprove, errorLeadAnalysis, errorSentiment, errorSummary],
  );

  const canAnalyzeCrmLead = Boolean(dealId) && !loadingLeadAnalysis;

  const handleAnalyzeSelectedLead = async () => {
    if (!dealId) return;
    setApplyInfo(null);
    setApplyError(null);
    try {
      const result = await analyzeCrmLead(dealId, text.trim() || undefined);
      setLeadName((prev) => {
        if (prev.trim()) return prev;
        if (result.lead.clientName) return result.lead.clientName;
        return result.lead.dealTitle || '';
      });
    } catch {
      // Error is surfaced via hook state.
    }
  };

  const canApplyRecommendation = useMemo(() => {
    if (!leadAnalysis) return false;
    const stageId = leadAnalysis.analysis.recommendedStageId;
    if (!stageId) return false;
    return stageId !== leadAnalysis.lead.stageId;
  }, [leadAnalysis]);

  const applyRecommendedStage = async () => {
    if (!leadAnalysis?.analysis.recommendedStageId) return;
    setApplyingRecommendation(true);
    setApplyInfo(null);
    setApplyError(null);

    try {
      await api(`/deals/${leadAnalysis.lead.dealId}/move-stage`, {
        method: 'POST',
        body: JSON.stringify({ stageId: leadAnalysis.analysis.recommendedStageId }),
      });

      setApplyInfo(
        `Etape appliquee: ${leadAnalysis.analysis.recommendedStageName || leadAnalysis.analysis.recommendedStageId}`,
      );

      await loadPipelineContext(leadAnalysis.lead.pipelineId, leadAnalysis.lead.dealId);
      await analyzeCrmLead(leadAnalysis.lead.dealId, text.trim() || undefined);
    } catch (err) {
      setApplyError(toErrorMessage(err));
    } finally {
      setApplyingRecommendation(false);
    }
  };

  return (
    <Guard>
      <AppShell>
        <Box maxW="980px" mx="auto" p={{ base: 0, md: 2 }} color="whiteAlpha.900">
          <Heading mb={2} size="lg">
            o7 IA Pulse
          </Heading>
          <Text color="whiteAlpha.700" mb={6}>
            Analyse intelligente des leads CRM (score, risques, recommandations de next action et d etape)
          </Text>
          <Text color="whiteAlpha.500" fontSize="xs" mb={4}>
            UI build: {iaUiBuild} · API target: {apiTarget}
          </Text>

          <Stack gap={4}>
            <Card.Root bg="whiteAlpha.50" borderWidth="1px" borderColor="whiteAlpha.200">
              <Card.Body>
                <Heading size="sm" mb={3}>
                  Source CRM
                </Heading>
                <SimpleGrid columns={{ base: 1, md: 2 }} gap={3}>
                  <Box>
                    <Text fontSize="sm" color="whiteAlpha.800" mb={1}>
                      Pipeline
                    </Text>
                    <select
                      value={pipelineId}
                      onChange={(e) => {
                        const next = e.currentTarget.value;
                        setPipelineId(next);
                        setApplyInfo(null);
                        setApplyError(null);
                      }}
                      disabled={loadingCrm || pipelines.length === 0}
                      style={{
                        width: '100%',
                        borderRadius: '0.75rem',
                        background: 'rgba(255, 255, 255, 0.08)',
                        border: '1px solid rgba(255, 255, 255, 0.24)',
                        padding: '0.5rem 0.75rem',
                      }}
                    >
                      <option value="">Selectionner pipeline</option>
                      {pipelines.map((pipeline) => (
                        <option key={pipeline.id} value={pipeline.id}>
                          {pipeline.name}
                        </option>
                      ))}
                    </select>
                  </Box>

                  <Box>
                    <Text fontSize="sm" color="whiteAlpha.800" mb={1}>
                      Lead CRM
                    </Text>
                    <select
                      value={dealId}
                      onChange={(e) => {
                        const nextDealId = e.currentTarget.value;
                        setDealId(nextDealId);
                        const next = deals.find((deal) => deal.id === nextDealId);
                        if (next) {
                          setLeadName((prev) => (prev.trim() ? prev : next.title || ''));
                        }
                      }}
                      disabled={loadingCrm || deals.length === 0}
                      style={{
                        width: '100%',
                        borderRadius: '0.75rem',
                        background: 'rgba(255, 255, 255, 0.08)',
                        border: '1px solid rgba(255, 255, 255, 0.24)',
                        padding: '0.5rem 0.75rem',
                      }}
                    >
                      <option value="">Selectionner lead</option>
                      {deals.map((deal) => {
                        const stage = stageById[deal.stageId] || deal.stage;
                        return (
                          <option key={deal.id} value={deal.id}>
                            {deal.title}
                            {stage?.name ? ` · ${stage.name}` : ''}
                          </option>
                        );
                      })}
                    </select>
                  </Box>
                </SimpleGrid>

                {selectedDeal ? (
                  <Text mt={3} fontSize="xs" color="whiteAlpha.700">
                    Deal: {selectedDeal.title} · Stage: {selectedDealStage?.name || selectedDeal.stageId} · Status:{' '}
                    {selectedDealStage?.status || selectedDeal.stage?.status || 'OPEN'} · Value:{' '}
                    {(selectedDeal.currency || 'USD').toUpperCase()} {Number(selectedDeal.value || 0).toLocaleString()}
                    {selectedDeal.client ? ` · Client: ${getClientLabel(selectedDeal.client) || 'N/A'}` : ''}
                  </Text>
                ) : null}

                <Box mt={3} display="flex" justifyContent="flex-end">
                  <Button
                    colorPalette="blue"
                    disabled={!canAnalyzeCrmLead}
                    onClick={() => void handleAnalyzeSelectedLead()}
                    borderRadius="xl"
                  >
                    {loadingLeadAnalysis ? <Spinner size="sm" /> : 'Analyser lead CRM'}
                  </Button>
                </Box>

                {errorCrm ? (
                  <Alert.Root status="warning" mt={3} borderRadius="md">
                    <Alert.Indicator />
                    <Alert.Content>
                      <Alert.Title>CRM</Alert.Title>
                      <Alert.Description>{errorCrm}</Alert.Description>
                    </Alert.Content>
                  </Alert.Root>
                ) : null}
              </Card.Body>
            </Card.Root>

            <Textarea
              placeholder="Contexte additionnel: derniers echanges, objections, notes call..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              bg="whiteAlpha.50"
              borderColor="whiteAlpha.200"
              _focusVisible={{ borderColor: 'cyan.300' }}
              borderRadius="xl"
            />

            <Input
              placeholder="Nom du lead (pour les emails)"
              value={leadName}
              onChange={(e) => setLeadName(e.target.value)}
              bg="whiteAlpha.50"
              borderColor="whiteAlpha.200"
              _focusVisible={{ borderColor: 'cyan.300' }}
              borderRadius="xl"
            />

            <SimpleGrid columns={{ base: 1, md: 2, lg: 4 }} gap={3}>
              <Button
                colorPalette="blue"
                disabled={!canUseText || loadingSentiment}
                onClick={() => void analyzeLead(text.trim())}
                borderRadius="xl"
              >
                {loadingSentiment ? <Spinner size="sm" /> : 'Analyser texte'}
              </Button>

              <Button
                colorPalette="teal"
                disabled={!canUseText || loadingSummary}
                onClick={() => void summarize(text.trim())}
                borderRadius="xl"
              >
                {loadingSummary ? <Spinner size="sm" /> : 'Resumer'}
              </Button>

              <Button
                colorPalette="purple"
                disabled={!canGenerateEmail || loadingEmail}
                onClick={() => void generateEmail(leadName.trim(), text.trim())}
                borderRadius="xl"
              >
                {loadingEmail ? <Spinner size="sm" /> : 'Generer email'}
              </Button>

              <Button
                colorPalette="orange"
                disabled={!canUseText || loadingImprove}
                onClick={() => void improveProposal(text.trim())}
                borderRadius="xl"
              >
                {loadingImprove ? <Spinner size="sm" /> : 'Ameliorer devis'}
              </Button>
            </SimpleGrid>

            <Box display="flex" justifyContent="flex-end">
              <SimpleGrid columns={{ base: 1, sm: 2 }} gap={3}>
                <Button
                  variant="outline"
                  borderColor="whiteAlpha.300"
                  onClick={() => void fetchDiagnostics()}
                  borderRadius="xl"
                >
                  {loadingDiagnostics ? <Spinner size="sm" /> : 'Diagnostic IA'}
                </Button>
                <Button
                  variant="outline"
                  borderColor="whiteAlpha.300"
                  onClick={clearAll}
                  borderRadius="xl"
                >
                  Effacer tout
                </Button>
              </SimpleGrid>
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

          {errorDiagnostics ? (
            <Alert.Root status="warning" mt={4} borderRadius="md">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>Diagnostic IA</Alert.Title>
                <Alert.Description>{errorDiagnostics}</Alert.Description>
              </Alert.Content>
            </Alert.Root>
          ) : null}

          <Separator my={8} borderColor="whiteAlpha.200" />

          <Stack gap={6}>
            {leadAnalysis ? (
              <Card.Root bg="whiteAlpha.50" borderWidth="1px" borderColor="whiteAlpha.200">
                <Card.Body>
                  <Heading size="sm" mb={3}>
                    Analyse lead CRM
                  </Heading>

                  <SimpleGrid columns={{ base: 1, md: 3 }} gap={3}>
                    <Box>
                      <Text fontSize="xs" color="whiteAlpha.600">
                        Score
                      </Text>
                      <Text fontSize="2xl" fontWeight="bold">
                        {leadAnalysis.analysis.score}/100
                      </Text>
                    </Box>
                    <Box>
                      <Text fontSize="xs" color="whiteAlpha.600">
                        Win Probability
                      </Text>
                      <Text fontSize="2xl" fontWeight="bold">
                        {Math.round(leadAnalysis.analysis.winProbability * 100)}%
                      </Text>
                    </Box>
                    <Box>
                      <Text fontSize="xs" color="whiteAlpha.600">
                        Risk
                      </Text>
                      <Text fontSize="2xl" fontWeight="bold">
                        {leadAnalysis.analysis.lossRisk}
                      </Text>
                    </Box>
                  </SimpleGrid>

                  <Text mt={3} fontSize="sm" color="whiteAlpha.800">
                    {leadAnalysis.lead.dealTitle} · {leadAnalysis.lead.pipelineName} · {leadAnalysis.lead.stageName} ·
                    {(leadAnalysis.lead.currency || 'USD').toUpperCase()} {Number(leadAnalysis.lead.value).toLocaleString()}
                    {leadAnalysis.lead.valueUsd !== null
                      ? ` (USD ${Math.round(leadAnalysis.lead.valueUsd).toLocaleString()})`
                      : ''}
                  </Text>

                  <Text mt={2} fontSize="sm" color="whiteAlpha.700">
                    {leadAnalysis.analysis.explanation}
                  </Text>

                  {leadAnalysis.analysis.reasons.length > 0 ? (
                    <Box mt={3}>
                      <Text fontWeight="semibold" mb={1}>
                        Raisons
                      </Text>
                      <Stack gap={1}>
                        {leadAnalysis.analysis.reasons.map((reason) => (
                          <Text key={reason} fontSize="sm" color="whiteAlpha.800">
                            • {reason}
                          </Text>
                        ))}
                      </Stack>
                    </Box>
                  ) : null}

                  {leadAnalysis.analysis.nextBestActions.length > 0 ? (
                    <Box mt={3}>
                      <Text fontWeight="semibold" mb={1}>
                        Next Best Actions
                      </Text>
                      <Stack gap={1}>
                        {leadAnalysis.analysis.nextBestActions.map((action) => (
                          <Text key={action} fontSize="sm" color="whiteAlpha.800">
                            • {action}
                          </Text>
                        ))}
                      </Stack>
                    </Box>
                  ) : null}

                  <Box mt={4} display="flex" justifyContent="space-between" alignItems="center" gap={3}>
                    <Text fontSize="sm" color="whiteAlpha.700">
                      Recommendation: {leadAnalysis.analysis.recommendedOutcome}
                      {leadAnalysis.analysis.recommendedStageName
                        ? ` → ${leadAnalysis.analysis.recommendedStageName}`
                        : ''}
                    </Text>
                    <Button
                      colorPalette="green"
                      onClick={() => void applyRecommendedStage()}
                      disabled={!canApplyRecommendation || applyingRecommendation}
                      borderRadius="xl"
                    >
                      {applyingRecommendation ? <Spinner size="sm" /> : 'Appliquer recommandation'}
                    </Button>
                  </Box>

                  {applyInfo ? <Text mt={2} color="green.300">{applyInfo}</Text> : null}
                  {applyError ? <Text mt={2} color="red.300">{applyError}</Text> : null}
                </Card.Body>
              </Card.Root>
            ) : null}

            {diagnostics ? (
              <Card.Root bg="whiteAlpha.50" borderWidth="1px" borderColor="whiteAlpha.200">
                <Card.Body>
                  <Heading size="sm" mb={2}>
                    Diagnostic runtime
                  </Heading>
                  <Box as="pre" fontSize="xs" whiteSpace="pre-wrap">
                    {JSON.stringify(diagnostics, null, 2)}
                  </Box>
                </Card.Body>
              </Card.Root>
            ) : null}

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

export default function IaPulsePage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-300">Loading IA Pulse...</div>}>
      <IaPulsePageContent />
    </Suspense>
  );
}
