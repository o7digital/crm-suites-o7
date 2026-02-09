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
    setLoadingSentiment(false);
    setLoadingSummary(false);
    setLoadingEmail(false);
    setLoadingImprove(false);
  }, []);

  return {
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
  };
}

