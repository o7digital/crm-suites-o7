import {
  Body,
  Controller,
  Get,
  InternalServerErrorException,
  Logger,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { HfClientService } from './hf-client.service';
import { SentimentDto } from './dto/sentiment.dto';
import { SummaryDto } from './dto/summary.dto';
import { DraftEmailDto } from './dto/draft-email.dto';
import { ImproveProposalDto } from './dto/improve-proposal.dto';

const SENTIMENT_MODEL = process.env.HF_SENTIMENT_MODEL || 'cardiffnlp/twitter-roberta-base-sentiment';
const SUMMARY_MODEL = process.env.HF_SUMMARY_MODEL || 'facebook/bart-large-cnn';
// `tiiuae/falcon-7b-instruct` is often not available on HF Inference; keep this configurable.
const INSTRUCT_MODEL = process.env.HF_INSTRUCT_MODEL || 'HuggingFaceTB/SmolLM3-3B';
const IA_FAIL_HARD =
  process.env.NODE_ENV !== 'production' &&
  String(process.env.IA_FAIL_HARD || '').toLowerCase() === 'true';

@UseGuards(JwtAuthGuard)
@Controller('ia')
export class IaController {
  private readonly logger = new Logger(IaController.name);

  constructor(private readonly hf: HfClientService) {}

  @Get('diagnostics')
  diagnostics() {
    return {
      build: 'ia-logs-v1',
      timestamp: new Date().toISOString(),
      nodeEnv: process.env.NODE_ENV || 'unknown',
      iaFailHard: IA_FAIL_HARD,
      models: {
        sentiment: SENTIMENT_MODEL,
        summary: SUMMARY_MODEL,
        instruct: INSTRUCT_MODEL,
      },
      hf: this.hf.diagnostics(),
    };
  }

  @Post('sentiment')
  async sentiment(@Body() body: SentimentDto) {
    try {
      const output: unknown = await this.hf.callHuggingFace(SENTIMENT_MODEL, {
        inputs: body.text,
        options: { wait_for_model: true },
      });

      const { label, score } = pickBestLabelScore(output);

      return {
        sentiment: label ?? 'UNKNOWN',
        confidence: score ?? 0,
      };
    } catch (err) {
      this.logger.warn(`[sentiment] fallback used; message="${toErrorMessage(err)}"`);
      if (IA_FAIL_HARD) throw new InternalServerErrorException(toErrorMessage(err));
      return fallbackSentiment(body.text);
    }
  }

  @Post('summary')
  async summary(@Body() body: SummaryDto) {
    try {
      const output: unknown = await this.hf.callHuggingFace(SUMMARY_MODEL, {
        inputs: body.text,
        parameters: { max_length: 150, min_length: 60 },
        options: { wait_for_model: true },
      });

      const summaryText = extractSummaryText(output);
      return { summary: summaryText || fallbackSummary(body.text) };
    } catch (err) {
      this.logger.warn(`[summary] fallback used; message="${toErrorMessage(err)}"`);
      if (IA_FAIL_HARD) throw new InternalServerErrorException(toErrorMessage(err));
      return { summary: fallbackSummary(body.text) };
    }
  }

  @Post('draft-email')
  async draftEmail(@Body() body: DraftEmailDto) {
    const prompt = [
      'You are a professional assistant.',
      'Write a follow-up email for this lead.',
      '',
      `Lead: ${body.leadName}`,
      `Context: ${body.leadContext}`,
      '',
      'Return exactly this format:',
      'Subject: <subject line>',
      'Body: <email body>',
      '',
    ].join('\n');

    try {
      const output: unknown = await this.hf.callHuggingFace(INSTRUCT_MODEL, {
        inputs: prompt,
        parameters: { max_new_tokens: 250, return_full_text: false },
        options: { wait_for_model: true },
      });

      const textOut = extractGeneratedText(output);
      const { subject, body: emailBody } = parseEmailSubjectBody(textOut);

      if ((subject || '').trim() || (emailBody || '').trim()) {
        return { subject, body: emailBody };
      }
      return fallbackDraftEmail(body.leadName, body.leadContext);
    } catch (err) {
      this.logger.warn(`[draft-email] fallback used; message="${toErrorMessage(err)}"`);
      if (IA_FAIL_HARD) throw new InternalServerErrorException(toErrorMessage(err));
      return fallbackDraftEmail(body.leadName, body.leadContext);
    }
  }

  @Post('improve-proposal')
  async improveProposal(@Body() body: ImproveProposalDto) {
    const prompt = [
      'You are a business assistant.',
      'Improve this proposal text to make it clearer and more compelling:',
      '',
      body.proposalText,
      '',
      'Return the improved version only.',
      '',
    ].join('\n');

    try {
      const output: unknown = await this.hf.callHuggingFace(INSTRUCT_MODEL, {
        inputs: prompt,
        parameters: { max_new_tokens: 350, return_full_text: false },
        options: { wait_for_model: true },
      });

      const improved = extractGeneratedText(output).trim();
      return { improvedProposal: improved || fallbackImprovedProposal(body.proposalText) };
    } catch (err) {
      this.logger.warn(`[improve-proposal] fallback used; message="${toErrorMessage(err)}"`);
      if (IA_FAIL_HARD) throw new InternalServerErrorException(toErrorMessage(err));
      return { improvedProposal: fallbackImprovedProposal(body.proposalText) };
    }
  }
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

function scoreOrNull(obj: unknown): number | null {
  if (!obj || typeof obj !== 'object') return null;
  const rec = obj as Record<string, unknown>;
  return typeof rec.score === 'number' ? rec.score : null;
}

function pickBestLabelScore(output: unknown): {
  label: string | null;
  score: number | null;
} {
  const pick = (obj: unknown) => {
    if (!obj || typeof obj !== 'object') return { label: null, score: null };
    const rec = obj as Record<string, unknown>;
    return {
      label: typeof rec.label === 'string' ? rec.label : null,
      score: typeof rec.score === 'number' ? rec.score : null,
    };
  };

  if (Array.isArray(output)) {
    if (output.length === 0) return { label: null, score: null };
    const first = output[0];
    if (Array.isArray(first)) {
      // When `return_all_scores` is enabled, HF returns a list of labels; pick the max score.
      const best = first.reduce<unknown>((acc, cur) => {
        const curScore = scoreOrNull(cur);
        if (curScore === null) return acc;
        const accScore = scoreOrNull(acc);
        if (accScore === null) return cur;
        return curScore > accScore ? cur : acc;
      }, null);
      return pick(best ?? (first.length ? first[0] : null));
    }
    return pick(first);
  }

  return pick(output);
}

function extractSummaryText(output: unknown): string {
  if (Array.isArray(output)) {
    const first = output[0];
    if (first && typeof first === 'object') {
      const rec = first as Record<string, unknown>;
      if (typeof rec.summary_text === 'string') return rec.summary_text;
    }
  }
  if (output && typeof output === 'object') {
    const rec = output as Record<string, unknown>;
    if (typeof rec.summary_text === 'string') return rec.summary_text;
  }
  return '';
}

function extractGeneratedText(output: unknown): string {
  if (Array.isArray(output)) {
    const first = output[0];
    if (first && typeof first === 'object') {
      const rec = first as Record<string, unknown>;
      if (typeof rec.generated_text === 'string') return rec.generated_text;
    }
  }
  if (output && typeof output === 'object') {
    const rec = output as Record<string, unknown>;
    if (typeof rec.generated_text === 'string') return rec.generated_text;
  }
  if (typeof output === 'string') return output;
  try {
    return JSON.stringify(output);
  } catch {
    return '';
  }
}

function parseEmailSubjectBody(text: string): {
  subject: string;
  body: string;
} {
  const normalized = (text || '').replace(/\r\n/g, '\n').trim();
  if (!normalized) return { subject: '', body: '' };

  const idxSubject = normalized.toLowerCase().indexOf('subject:');
  const cropped = idxSubject >= 0 ? normalized.slice(idxSubject) : normalized;
  const lines = cropped.split('\n').map((l) => l.trimEnd());

  const subjectIdx = lines.findIndex((l) => /^subject\s*:/i.test(l));
  const bodyIdx = lines.findIndex((l) => /^body\s*:/i.test(l));

  const subjectLine = subjectIdx >= 0 ? lines[subjectIdx] : '';
  const subject = subjectLine.replace(/^subject\s*:\s*/i, '').trim();

  if (bodyIdx >= 0) {
    const firstBody = lines[bodyIdx].replace(/^body\s*:\s*/i, '');
    const rest = lines.slice(bodyIdx + 1).join('\n');
    const body = `${firstBody}\n${rest}`.trim();
    return { subject, body };
  }

  // Fallback: everything after the subject line is the body.
  if (subjectIdx >= 0) {
    return {
      subject,
      body: lines
        .slice(subjectIdx + 1)
        .join('\n')
        .trim(),
    };
  }

  // Worst-case: no markers, return the whole text as body.
  return { subject: '', body: normalized };
}

function fallbackSentiment(text: string): {
  sentiment: string;
  confidence: number;
} {
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

function fallbackDraftEmail(leadName: string, leadContext: string): {
  subject: string;
  body: string;
} {
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

function fallbackImprovedProposal(text: string): string {
  const base = fallbackSummary(text || '');
  const source = base || (text || '').trim();
  if (!source) return '';
  return [
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
  ].join('\n');
}
