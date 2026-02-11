'use client';

import { useCallback, useState } from 'react';
import { useApi, useAuth } from '@/contexts/AuthContext';

export type SentimentResult = {
  sentiment: string;
  confidence: number;
};

export type SummaryResult = {
  summary: string;
};

export type DraftEmailResult = {
  subject: string;
  body: string;
};

export type ImproveProposalResult = {
  improvedProposal: string;
};

export type IaDiagnostics = {
  build: string;
  timestamp: string;
  nodeEnv: string;
  iaFailHard: boolean;
  models: {
    sentiment: string;
    summary: string;
    instruct: string;
  };
  hf: {
    baseUrl: string;
    timeoutMs: number;
    keySource: 'HF_API_KEY' | 'HF_TOKEN' | null;
    hasKey: boolean;
  };
};

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

function logIADebug(scope: string, payload: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  // Console logs are useful to validate which runtime/build is active in production.
  console.warn(`[IA DEBUG][${scope}] ${timestamp}`, payload);
}

function shouldUseLocalFallback(message: string): boolean {
  const value = (message || '').toLowerCase().trim();
  if (!value) return true;

  if (value.includes('unauthorized') || value.includes('forbidden') || value.includes('jwt')) {
    return false;
  }

  return (
    value.includes('hf error') ||
    value.includes('huggingface') ||
    value.includes('hf_api_key') ||
    value.includes('hf_token') ||
    value.includes('request failed (5') ||
    value.includes('failed to fetch') ||
    value.includes('networkerror')
  );
}

function fallbackSentiment(text: string): SentimentResult {
  const value = (text || '').toLowerCase();
  const positive = ['ok', 'merci', 'gracias', 'perfecto', 'confirm', 'vale', 'super', 'si', 'yes'];
  const negative = ['retard', 'delay', 'problem', 'problema', 'urgent', 'cancel', 'no puedo', 'error'];

  const pos = positive.reduce((n, w) => n + (value.includes(w) ? 1 : 0), 0);
  const neg = negative.reduce((n, w) => n + (value.includes(w) ? 1 : 0), 0);

  if (pos > neg) return { sentiment: 'POSITIVE', confidence: 0.62 };
  if (neg > pos) return { sentiment: 'NEGATIVE', confidence: 0.62 };
  return { sentiment: 'NEUTRAL', confidence: 0.5 };
}

function fallbackSummary(text: string): string {
  const normalized = (text || '').replace(/\r\n/g, '\n').trim();
  if (!normalized) return '';
  const lines = normalized
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);
  const preview = lines.slice(0, 4).join(' ');
  if (preview.length <= 280) return preview;
  return `${preview.slice(0, 277).trim()}...`;
}

function fallbackDraftEmail(leadName: string, leadContext: string): DraftEmailResult {
  const safeName = (leadName || 'client').trim() || 'client';
  const context = fallbackSummary(leadContext || '');
  const subject = `Suivi de votre projet - ${safeName}`;
  const body = [
    `Bonjour ${safeName},`,
    '',
    'Merci pour votre retour.',
    context ? `Contexte: ${context}` : '',
    'Je vous propose un court appel pour valider les prochaines etapes.',
    'Pouvez-vous me partager vos disponibilites ?',
    '',
    'Bien a vous,',
  ]
    .filter(Boolean)
    .join('\n');
  return { subject, body };
}

function fallbackImprovedProposal(text: string): ImproveProposalResult {
  const base = fallbackSummary(text || '');
  const source = base || (text || '').trim();
  if (!source) return { improvedProposal: '' };
  return {
    improvedProposal: [
      'Proposition amelioree',
      '',
      source,
      '',
      'Livrables:',
      '- Cadrage et validation des besoins',
      '- Plan de mise en oeuvre detaille',
      '- Suivi et reporting de l avancement',
      '',
      'Prochaine etape: planifier un appel de validation.',
    ].join('\n'),
  };
}

export function useIA() {
  const { token } = useAuth();
  const api = useApi(token);

  const [sentiment, setSentiment] = useState<SentimentResult | null>(null);
  const [summary, setSummary] = useState<SummaryResult | null>(null);
  const [draftEmail, setDraftEmail] = useState<DraftEmailResult | null>(null);
  const [improvedProposal, setImprovedProposal] = useState<ImproveProposalResult | null>(null);

  const [loadingSentiment, setLoadingSentiment] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [loadingEmail, setLoadingEmail] = useState(false);
  const [loadingImprove, setLoadingImprove] = useState(false);

  const [errorSentiment, setErrorSentiment] = useState<string | null>(null);
  const [errorSummary, setErrorSummary] = useState<string | null>(null);
  const [errorEmail, setErrorEmail] = useState<string | null>(null);
  const [errorImprove, setErrorImprove] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<IaDiagnostics | null>(null);
  const [loadingDiagnostics, setLoadingDiagnostics] = useState(false);
  const [errorDiagnostics, setErrorDiagnostics] = useState<string | null>(null);

  const fetchDiagnostics = useCallback(async () => {
    setLoadingDiagnostics(true);
    setErrorDiagnostics(null);
    try {
      const result = await api<IaDiagnostics>('/ia/diagnostics');
      setDiagnostics(result);
      logIADebug('diagnostics', result as unknown as Record<string, unknown>);
      return result;
    } catch (err) {
      const message = toErrorMessage(err);
      setErrorDiagnostics(message);
      logIADebug('diagnostics-error', { message });
      throw err;
    } finally {
      setLoadingDiagnostics(false);
    }
  }, [api]);

  const analyzeLead = useCallback(
    async (text: string) => {
      setLoadingSentiment(true);
      setErrorSentiment(null);
      try {
        const result = await api<SentimentResult>('/ia/sentiment', {
          method: 'POST',
          body: JSON.stringify({ text }),
        });
        setSentiment(result);
        return result;
      } catch (err) {
        const message = toErrorMessage(err);
        const fallbackUsed = shouldUseLocalFallback(message);
        logIADebug('sentiment-error', { message, fallbackUsed });
        if (fallbackUsed) {
          const fallback = fallbackSentiment(text);
          setSentiment(fallback);
          setErrorSentiment(null);
          return fallback;
        }
        setErrorSentiment(message);
        throw err;
      } finally {
        setLoadingSentiment(false);
      }
    },
    [api],
  );

  const summarize = useCallback(
    async (text: string) => {
      setLoadingSummary(true);
      setErrorSummary(null);
      try {
        const result = await api<SummaryResult>('/ia/summary', {
          method: 'POST',
          body: JSON.stringify({ text }),
        });
        setSummary(result);
        return result;
      } catch (err) {
        const message = toErrorMessage(err);
        const fallbackUsed = shouldUseLocalFallback(message);
        logIADebug('summary-error', { message, fallbackUsed });
        if (fallbackUsed) {
          const fallback = { summary: fallbackSummary(text) };
          setSummary(fallback);
          setErrorSummary(null);
          return fallback;
        }
        setErrorSummary(message);
        throw err;
      } finally {
        setLoadingSummary(false);
      }
    },
    [api],
  );

  const generateEmail = useCallback(
    async (leadName: string, leadContext: string) => {
      setLoadingEmail(true);
      setErrorEmail(null);
      try {
        const result = await api<DraftEmailResult>('/ia/draft-email', {
          method: 'POST',
          body: JSON.stringify({ leadName, leadContext }),
        });
        setDraftEmail(result);
        return result;
      } catch (err) {
        const message = toErrorMessage(err);
        const fallbackUsed = shouldUseLocalFallback(message);
        logIADebug('draft-email-error', { message, fallbackUsed });
        if (fallbackUsed) {
          const fallback = fallbackDraftEmail(leadName, leadContext);
          setDraftEmail(fallback);
          setErrorEmail(null);
          return fallback;
        }
        setErrorEmail(message);
        throw err;
      } finally {
        setLoadingEmail(false);
      }
    },
    [api],
  );

  const improveProposal = useCallback(
    async (proposalText: string) => {
      setLoadingImprove(true);
      setErrorImprove(null);
      try {
        const result = await api<ImproveProposalResult>('/ia/improve-proposal', {
          method: 'POST',
          body: JSON.stringify({ proposalText }),
        });
        setImprovedProposal(result);
        return result;
      } catch (err) {
        const message = toErrorMessage(err);
        const fallbackUsed = shouldUseLocalFallback(message);
        logIADebug('improve-proposal-error', { message, fallbackUsed });
        if (fallbackUsed) {
          const fallback = fallbackImprovedProposal(proposalText);
          setImprovedProposal(fallback);
          setErrorImprove(null);
          return fallback;
        }
        setErrorImprove(message);
        throw err;
      } finally {
        setLoadingImprove(false);
      }
    },
    [api],
  );

  const reset = useCallback(() => {
    setSentiment(null);
    setSummary(null);
    setDraftEmail(null);
    setImprovedProposal(null);
    setErrorSentiment(null);
    setErrorSummary(null);
    setErrorEmail(null);
    setErrorImprove(null);
    setDiagnostics(null);
    setErrorDiagnostics(null);
    setLoadingSentiment(false);
    setLoadingSummary(false);
    setLoadingEmail(false);
    setLoadingImprove(false);
    setLoadingDiagnostics(false);
  }, []);

  return {
    analyzeLead,
    summarize,
    generateEmail,
    improveProposal,
    fetchDiagnostics,
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
    diagnostics,
    loadingDiagnostics,
    errorDiagnostics,
  };
}
