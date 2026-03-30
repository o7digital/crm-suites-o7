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
import { LeadAnalysisDto } from './dto/lead-analysis.dto';
import { Crm360Dto } from './dto/crm-360.dto';
import { CurrentUser } from '../common/user.decorator';
import type { RequestUser } from '../common/user.decorator';
import { DealsService } from '../deals/deals.service';
import { PrismaService } from '../prisma/prisma.service';
import { FxService } from '../fx/fx.service';

const SENTIMENT_MODEL =
  process.env.HF_SENTIMENT_MODEL || 'cardiffnlp/twitter-roberta-base-sentiment';
const SUMMARY_MODEL = process.env.HF_SUMMARY_MODEL || 'facebook/bart-large-cnn';
// `tiiuae/falcon-7b-instruct` is often not available on HF Inference; keep this configurable.
const INSTRUCT_MODEL =
  process.env.HF_INSTRUCT_MODEL || 'HuggingFaceTB/SmolLM3-3B';
const WAIT_FOR_MODEL =
  String(process.env.HF_WAIT_FOR_MODEL || '').toLowerCase() === 'true';
const IA_FAIL_HARD =
  process.env.NODE_ENV !== 'production' &&
  String(process.env.IA_FAIL_HARD || '').toLowerCase() === 'true';

@UseGuards(JwtAuthGuard)
@Controller('ia')
export class IaController {
  private readonly logger = new Logger(IaController.name);

  constructor(
    private readonly hf: HfClientService,
    private readonly dealsService: DealsService,
    private readonly prisma: PrismaService,
    private readonly fx: FxService,
  ) {}

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
      waitForModel: WAIT_FOR_MODEL,
      hf: this.hf.diagnostics(),
    };
  }

  @Post('lead-analysis')
  async leadAnalysis(
    @Body() body: LeadAnalysisDto,
    @CurrentUser() user: RequestUser,
  ) {
    const deal = (await this.dealsService.findOne(
      body.dealId,
      user,
    )) as unknown as CrmLeadDeal;
    const [pipeline, stages, enteredCurrentStage] = await Promise.all([
      this.prisma.pipeline.findFirst({
        where: { id: deal.pipelineId, tenantId: user.tenantId },
        select: { id: true, name: true },
      }),
      this.prisma.stage.findMany({
        where: { pipelineId: deal.pipelineId, tenantId: user.tenantId },
        orderBy: { position: 'asc' },
        select: {
          id: true,
          name: true,
          status: true,
          position: true,
          probability: true,
        },
      }),
      this.prisma.dealStageHistory.findFirst({
        where: {
          tenantId: user.tenantId,
          dealId: deal.id,
          toStageId: deal.stageId,
        },
        orderBy: { movedAt: 'desc' },
        select: { movedAt: true },
      }),
    ]);

    const currentStage = stages.find((stage) => stage.id === deal.stageId);
    const firstWonStage =
      stages.find((stage) => stage.status === 'WON') || null;
    const firstLostStage =
      stages.find((stage) => stage.status === 'LOST') || null;
    const nextOpenStage =
      currentStage?.status === 'OPEN'
        ? stages.find(
            (stage) =>
              stage.status === 'OPEN' && stage.position > currentStage.position,
          ) || null
        : null;

    const createdAt = toDateOrNow(deal.createdAt);
    const stageEnteredAt = enteredCurrentStage?.movedAt || createdAt;
    const expectedCloseDate = toDateOrNull(deal.expectedCloseDate);

    const value = Number(deal.value);
    const currency = String(deal.currency || 'USD').toUpperCase();
    let valueUsd: number | null = Number.isFinite(value) ? value : null;
    let fxDate: string | null = null;
    if (valueUsd !== null && currency !== 'USD') {
      try {
        const snapshot = await this.fx.getUsdRates();
        valueUsd = this.fx.toUsd(value, currency, snapshot);
        fxDate = snapshot.date;
      } catch {
        valueUsd = null;
      }
    }

    const clientName =
      [deal.client?.firstName, deal.client?.name]
        .map((part) => String(part || '').trim())
        .filter(Boolean)
        .join(' ')
        .trim() ||
      String(deal.client?.name || '').trim() ||
      null;

    const score = buildLeadScoreAnalysis({
      stageStatus: currentStage?.status ?? 'OPEN',
      stageProbability: Number(currentStage?.probability ?? 0),
      daysToClose: expectedCloseDate ? daysUntil(expectedCloseDate) : null,
      daysInStage: daysSince(stageEnteredAt),
      hasClient: Boolean(clientName || deal.clientId),
      valueUsd,
      context: body.context || '',
      wonStage: firstWonStage,
      lostStage: firstLostStage,
      currentStage,
      nextOpenStage,
    });

    return {
      lead: {
        dealId: deal.id,
        dealTitle: deal.title,
        pipelineId: deal.pipelineId,
        pipelineName: pipeline?.name || deal.pipelineId,
        stageId: deal.stageId,
        stageName: currentStage?.name || 'Unknown',
        stageStatus: currentStage?.status || 'OPEN',
        stageProbability: Number(currentStage?.probability ?? 0),
        daysInStage: score.signals.daysInStage,
        expectedCloseDate: expectedCloseDate
          ? expectedCloseDate.toISOString()
          : null,
        daysToClose: score.signals.daysToClose,
        value,
        currency,
        valueUsd,
        fxDate,
        clientName,
      },
      analysis: score.analysis,
    };
  }

  @Post('crm-360')
  async crm360(@Body() body: Crm360Dto, @CurrentUser() user: RequestUser) {
    const deal = (await this.dealsService.findOne(
      body.dealId,
      user,
    )) as unknown as Crm360Deal;
    const [pipeline, stages, enteredCurrentStage, historyRows, tasks, invoices] =
      await Promise.all([
        this.prisma.pipeline.findFirst({
          where: { id: deal.pipelineId, tenantId: user.tenantId },
          select: { id: true, name: true },
        }),
        this.prisma.stage.findMany({
          where: { pipelineId: deal.pipelineId, tenantId: user.tenantId },
          orderBy: { position: 'asc' },
          select: {
            id: true,
            name: true,
            status: true,
            position: true,
            probability: true,
          },
        }),
        this.prisma.dealStageHistory.findFirst({
          where: {
            tenantId: user.tenantId,
            dealId: deal.id,
            toStageId: deal.stageId,
          },
          orderBy: { movedAt: 'desc' },
          select: { movedAt: true },
        }),
        this.prisma.dealStageHistory.findMany({
          where: { tenantId: user.tenantId, dealId: deal.id },
          orderBy: { movedAt: 'desc' },
          take: 8,
          select: {
            id: true,
            movedAt: true,
            fromStage: { select: { name: true } },
            toStage: { select: { name: true } },
          },
        }),
        deal.clientId
          ? this.prisma.task.findMany({
              where: { tenantId: user.tenantId, clientId: deal.clientId },
              orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
              take: 12,
              select: {
                id: true,
                title: true,
                status: true,
                dueDate: true,
                createdAt: true,
              },
            })
          : Promise.resolve([] as Crm360TaskRow[]),
        deal.clientId
          ? this.prisma.invoice.findMany({
              where: { tenantId: user.tenantId, clientId: deal.clientId },
              orderBy: { createdAt: 'desc' },
              take: 8,
              select: {
                id: true,
                amount: true,
                currency: true,
                status: true,
                createdAt: true,
                dueDate: true,
              },
            })
          : Promise.resolve([] as Crm360InvoiceRow[]),
      ]);

    const currentStage = stages.find((stage) => stage.id === deal.stageId) || null;
    const createdAt = toDateOrNow(deal.createdAt);
    const updatedAt = toDateOrNow(deal.updatedAt);
    const stageEnteredAt = enteredCurrentStage?.movedAt || createdAt;
    const expectedCloseDate = toDateOrNull(deal.expectedCloseDate);
    const daysInStage = daysSince(stageEnteredAt);
    const daysSinceUpdate = daysSince(updatedAt);

    const relatedDeals = deal.clientId
      ? await this.prisma.deal.findMany({
          where: {
            tenantId: user.tenantId,
            clientId: deal.clientId,
            id: { not: deal.id },
          },
          orderBy: { updatedAt: 'desc' },
          take: 8,
          select: {
            id: true,
            title: true,
            value: true,
            currency: true,
            updatedAt: true,
            expectedCloseDate: true,
            pipeline: { select: { name: true } },
            stage: { select: { name: true, status: true } },
          },
        })
      : [];

    const openTasks = tasks.filter((task) => task.status !== 'DONE').length;
    const overdueTasks = tasks.filter(
      (task) => task.status !== 'DONE' && isPastDue(task.dueDate),
    ).length;
    const openRelatedDeals = relatedDeals.filter(
      (item) => item.stage?.status === 'OPEN',
    ).length;
    const totalInvoiceAmount = invoices.reduce((sum, invoice) => {
      const amount = Number(invoice.amount);
      return Number.isFinite(amount) ? sum + amount : sum;
    }, 0);

    const signals = {
      openTasks,
      overdueTasks,
      totalInvoices: invoices.length,
      totalInvoiceAmount: round2(totalInvoiceAmount),
      openRelatedDeals,
      staleStage: daysInStage >= 14,
      closingLate: expectedCloseDate ? daysUntil(expectedCloseDate) < 0 : false,
      noRecentTask: tasks.length === 0,
      noClient: !deal.clientId,
      hasProposal: Boolean(deal.proposalFilePath),
      daysInStage,
      daysSinceUpdate,
    };

    return {
      lead: {
        dealId: deal.id,
        title: deal.title,
        pipelineId: deal.pipelineId,
        pipelineName: pipeline?.name || deal.pipelineId,
        stageId: deal.stageId,
        stageName: currentStage?.name || deal.stage?.name || 'Unknown',
        stageStatus: currentStage?.status || deal.stage?.status || 'OPEN',
        value: Number(deal.value),
        currency: String(deal.currency || 'USD').toUpperCase(),
        expectedCloseDate: expectedCloseDate ? expectedCloseDate.toISOString() : null,
        createdAt: createdAt.toISOString(),
        updatedAt: updatedAt.toISOString(),
        daysInStage,
        hasProposal: signals.hasProposal,
        productNames: (deal.items || [])
          .map((item) => String(item.product?.name || '').trim())
          .filter(Boolean)
          .slice(0, 8),
      },
      client: deal.client
        ? {
            id: deal.clientId,
            name:
              [deal.client.firstName, deal.client.name]
                .map((part) => String(part || '').trim())
                .filter(Boolean)
                .join(' ')
                .trim() || String(deal.client.name || '').trim() || null,
            status: String(deal.client.clientStatus || '').toUpperCase() || null,
            company: deal.client.company || null,
            email: deal.client.email || null,
            phone: deal.client.phone || null,
            website: deal.client.website || null,
            address: deal.client.address || null,
            notes: deal.client.notes || null,
          }
        : null,
      tasks: tasks.map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status,
        dueDate: task.dueDate ? task.dueDate.toISOString() : null,
        createdAt: task.createdAt.toISOString(),
      })),
      invoices: invoices.map((invoice) => ({
        id: invoice.id,
        amount: Number(invoice.amount),
        currency: String(invoice.currency || 'USD').toUpperCase(),
        status: invoice.status,
        createdAt: invoice.createdAt.toISOString(),
        dueDate: invoice.dueDate ? invoice.dueDate.toISOString() : null,
      })),
      relatedDeals: relatedDeals.map((item) => ({
        id: item.id,
        title: item.title,
        pipelineName: item.pipeline?.name || null,
        stageName: item.stage?.name || null,
        stageStatus: item.stage?.status || 'OPEN',
        value: Number(item.value),
        currency: String(item.currency || 'USD').toUpperCase(),
        updatedAt: item.updatedAt.toISOString(),
        expectedCloseDate: item.expectedCloseDate
          ? item.expectedCloseDate.toISOString()
          : null,
      })),
      stageHistory: historyRows.map((row) => ({
        id: row.id,
        fromStageName: row.fromStage?.name || null,
        toStageName: row.toStage.name,
        movedAt: row.movedAt.toISOString(),
      })),
      signals,
      coach: buildCrm360Coach({
        dealTitle: deal.title,
        stageName: currentStage?.name || deal.stage?.name || 'Unknown',
        stageStatus: currentStage?.status || deal.stage?.status || 'OPEN',
        hasClient: Boolean(deal.clientId),
        openTasks,
        overdueTasks,
        totalInvoices: invoices.length,
        openRelatedDeals,
        staleStage: signals.staleStage,
        closingLate: signals.closingLate,
        hasProposal: signals.hasProposal,
        daysInStage,
        daysSinceUpdate,
      }),
    };
  }

  @Post('sentiment')
  async sentiment(@Body() body: SentimentDto) {
    try {
      const output: unknown = await this.hf.callHuggingFace(SENTIMENT_MODEL, {
        inputs: body.text,
        options: { wait_for_model: WAIT_FOR_MODEL },
      });

      const { label, score } = pickBestLabelScore(output);

      return {
        sentiment: label ?? 'UNKNOWN',
        confidence: score ?? 0,
      };
    } catch (err) {
      this.logger.warn(
        `[sentiment] fallback used; message="${toErrorMessage(err)}"`,
      );
      if (IA_FAIL_HARD)
        throw new InternalServerErrorException(toErrorMessage(err));
      return fallbackSentiment(body.text);
    }
  }

  @Post('summary')
  async summary(@Body() body: SummaryDto) {
    try {
      const output: unknown = await this.hf.callHuggingFace(SUMMARY_MODEL, {
        inputs: body.text,
        parameters: { max_length: 150, min_length: 60 },
        options: { wait_for_model: WAIT_FOR_MODEL },
      });

      const summaryText = extractSummaryText(output);
      return { summary: summaryText || fallbackSummary(body.text) };
    } catch (err) {
      this.logger.warn(
        `[summary] fallback used; message="${toErrorMessage(err)}"`,
      );
      if (IA_FAIL_HARD)
        throw new InternalServerErrorException(toErrorMessage(err));
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
        options: { wait_for_model: WAIT_FOR_MODEL },
      });

      const textOut = extractGeneratedText(output);
      const { subject, body: emailBody } = parseEmailSubjectBody(textOut);

      if ((subject || '').trim() || (emailBody || '').trim()) {
        return { subject, body: emailBody };
      }
      return fallbackDraftEmail(body.leadName, body.leadContext);
    } catch (err) {
      this.logger.warn(
        `[draft-email] fallback used; message="${toErrorMessage(err)}"`,
      );
      if (IA_FAIL_HARD)
        throw new InternalServerErrorException(toErrorMessage(err));
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
        options: { wait_for_model: WAIT_FOR_MODEL },
      });

      const improved = extractGeneratedText(output).trim();
      return {
        improvedProposal:
          improved || fallbackImprovedProposal(body.proposalText),
      };
    } catch (err) {
      this.logger.warn(
        `[improve-proposal] fallback used; message="${toErrorMessage(err)}"`,
      );
      if (IA_FAIL_HARD)
        throw new InternalServerErrorException(toErrorMessage(err));
      return { improvedProposal: fallbackImprovedProposal(body.proposalText) };
    }
  }
}

type StageStatus = 'OPEN' | 'WON' | 'LOST';

type CrmLeadDeal = {
  id: string;
  title: string;
  value: number | string;
  currency: string;
  expectedCloseDate?: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  pipelineId: string;
  stageId: string;
  clientId?: string | null;
  client?: {
    firstName?: string | null;
    name?: string | null;
    company?: string | null;
    email?: string | null;
  } | null;
};

type Crm360Deal = CrmLeadDeal & {
  proposalFilePath?: string | null;
  stage?: {
    id?: string;
    name?: string;
    status?: StageStatus;
    probability?: number;
    position?: number;
  } | null;
  items?: Array<{
    product?: {
      name?: string | null;
    } | null;
  }>;
  client?: {
    firstName?: string | null;
    name?: string | null;
    company?: string | null;
    email?: string | null;
    phone?: string | null;
    website?: string | null;
    address?: string | null;
    notes?: string | null;
    clientStatus?: string | null;
  } | null;
};

type StageLite = {
  id: string;
  name: string;
  status: StageStatus;
  position: number;
  probability: number;
};

type LeadScoreInput = {
  stageStatus: StageStatus;
  stageProbability: number;
  daysToClose: number | null;
  daysInStage: number;
  hasClient: boolean;
  valueUsd: number | null;
  context: string;
  wonStage: StageLite | null;
  lostStage: StageLite | null;
  currentStage: StageLite | undefined;
  nextOpenStage: StageLite | null;
};

type LeadScoreResult = {
  signals: {
    daysToClose: number | null;
    daysInStage: number;
  };
  analysis: {
    score: number;
    winProbability: number;
    confidence: number;
    lossRisk: 'LOW' | 'MEDIUM' | 'HIGH';
    reasons: string[];
    strengths: string[];
    risks: string[];
    nextBestActions: string[];
    recommendedOutcome: 'KEEP' | 'WON' | 'LOST';
    recommendedStageId: string | null;
    recommendedStageName: string | null;
    explanation: string;
  };
};

type Crm360CoachInput = {
  dealTitle: string;
  stageName: string;
  stageStatus: StageStatus;
  hasClient: boolean;
  openTasks: number;
  overdueTasks: number;
  totalInvoices: number;
  openRelatedDeals: number;
  staleStage: boolean;
  closingLate: boolean;
  hasProposal: boolean;
  daysInStage: number;
  daysSinceUpdate: number;
};

type Crm360TaskRow = {
  id: string;
  title: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'DONE';
  dueDate: Date | null;
  createdAt: Date;
};

type Crm360InvoiceRow = {
  id: string;
  amount: number | string;
  currency: string;
  status: string;
  createdAt: Date;
  dueDate: Date | null;
};

function buildLeadScoreAnalysis(input: LeadScoreInput): LeadScoreResult {
  const reasons: string[] = [];
  const strengths: string[] = [];
  const risks: string[] = [];
  const nextBestActions: string[] = [];

  const stageProbability = clamp(input.stageProbability, 0, 1);
  const baseScore = Math.round(stageProbability * 100);

  if (input.stageStatus === 'WON') {
    return {
      signals: {
        daysToClose: input.daysToClose,
        daysInStage: input.daysInStage,
      },
      analysis: {
        score: 100,
        winProbability: 1,
        confidence: 0.95,
        lossRisk: 'LOW',
        reasons: ['Le lead est deja en etape Gagnee.'],
        strengths: ['Opportunite deja close en WON.'],
        risks: [],
        nextBestActions: ['Lancer onboarding, contrat et facturation.'],
        recommendedOutcome: 'WON',
        recommendedStageId: input.wonStage?.id || null,
        recommendedStageName: input.wonStage?.name || null,
        explanation: 'Lead deja gagne.',
      },
    };
  }

  if (input.stageStatus === 'LOST') {
    return {
      signals: {
        daysToClose: input.daysToClose,
        daysInStage: input.daysInStage,
      },
      analysis: {
        score: 0,
        winProbability: 0,
        confidence: 0.95,
        lossRisk: 'HIGH',
        reasons: ['Le lead est deja en etape Perdue.'],
        strengths: [],
        risks: ['Lead deja classe LOST.'],
        nextBestActions: [
          'Qualifier la raison de perte et relancer plus tard si pertinent.',
        ],
        recommendedOutcome: 'LOST',
        recommendedStageId: input.lostStage?.id || null,
        recommendedStageName: input.lostStage?.name || null,
        explanation: 'Lead deja perdu.',
      },
    };
  }

  let score = baseScore;
  reasons.push(
    `Score de base aligne sur la probabilite d'etape (${Math.round(stageProbability * 100)}%).`,
  );

  if (input.hasClient) {
    score += 4;
    strengths.push('Client/contact relie au deal.');
  } else {
    score -= 8;
    risks.push('Aucun client relie au deal.');
    nextBestActions.push('Associer un client decisionnaire au lead.');
  }

  if (input.daysToClose === null) {
    score -= 6;
    risks.push('Date de closing non renseignee.');
    nextBestActions.push('Definir une date de closing claire avec le client.');
  } else if (input.daysToClose < 0) {
    score -= 18;
    risks.push(
      `Lead en retard de ${Math.abs(input.daysToClose)} jour(s) sur la date de closing.`,
    );
    nextBestActions.push(
      'Revalider le planning et le blocage principal avec le client.',
    );
  } else if (input.daysToClose <= 7) {
    score += 6;
    strengths.push('Date de closing proche: momentum de decision eleve.');
    nextBestActions.push(
      'Confirmer call de closing et verrouiller les derniers points.',
    );
  } else if (input.daysToClose <= 21) {
    score += 2;
  } else if (input.daysToClose > 90) {
    score -= 5;
    risks.push('Horizon de closing lointain.');
    nextBestActions.push(
      'Decouper le deal en jalons intermediaires mesurables.',
    );
  }

  if (input.daysInStage >= 30) {
    score -= 15;
    risks.push(
      `Lead bloque depuis ${input.daysInStage} jours dans la meme etape.`,
    );
    nextBestActions.push(
      'Faire une relance executive et fixer une date de decision.',
    );
  } else if (input.daysInStage >= 14) {
    score -= 8;
    risks.push(
      `Lead present depuis ${input.daysInStage} jours dans cette etape.`,
    );
    nextBestActions.push(
      'Identifier le bloqueur principal et planifier une action de debloquage.',
    );
  } else {
    strengths.push('Lead recemment actif dans son etape.');
  }

  if (input.valueUsd !== null && Number.isFinite(input.valueUsd)) {
    if (input.valueUsd >= 100_000) {
      score -= 4;
      risks.push('Montant eleve: cycle de decision potentiellement plus long.');
    } else if (input.valueUsd > 0 && input.valueUsd <= 5_000) {
      score += 2;
      strengths.push(
        'Montant modere: deal potentiellement plus rapide a conclure.',
      );
    }
  }

  const textSignals = detectTextSignals(input.context);
  if (textSignals.positiveHits.length > 0) {
    const bonus = Math.min(12, textSignals.positiveHits.length * 4);
    score += bonus;
    strengths.push(
      `Signaux positifs detectes: ${textSignals.positiveHits.join(', ')}.`,
    );
    reasons.push(`Contexte texte positif (+${bonus}).`);
  }
  if (textSignals.negativeHits.length > 0) {
    const penalty = Math.min(18, textSignals.negativeHits.length * 6);
    score -= penalty;
    risks.push(
      `Signaux de risque detectes: ${textSignals.negativeHits.join(', ')}.`,
    );
    reasons.push(`Contexte texte risque (-${penalty}).`);
  }

  if (stageProbability >= 0.8 && input.daysInStage > 20) {
    score -= 8;
    risks.push(
      'Proba elevee mais pas d avancement recent: risque de faux positif de pipeline.',
    );
  }

  score = Math.round(clamp(score, 0, 100));
  const winProbability = round2(score / 100);
  const confidence = round2(
    clamp(
      0.5 +
        (input.daysToClose !== null ? 0.1 : 0) +
        (input.daysInStage >= 0 ? 0.1 : 0) +
        (input.hasClient ? 0.1 : 0) +
        (input.valueUsd !== null ? 0.1 : 0) +
        ((input.context || '').trim().length > 0 ? 0.1 : 0),
      0.45,
      0.95,
    ),
  );

  const lossRisk: 'LOW' | 'MEDIUM' | 'HIGH' =
    score >= 70 ? 'LOW' : score >= 40 ? 'MEDIUM' : 'HIGH';

  let recommendedOutcome: 'KEEP' | 'WON' | 'LOST' = 'KEEP';
  let recommendedStageId: string | null = input.currentStage?.id || null;
  let recommendedStageName: string | null = input.currentStage?.name || null;

  if (score >= 85 && input.wonStage) {
    recommendedOutcome = 'WON';
    recommendedStageId = input.wonStage.id;
    recommendedStageName = input.wonStage.name;
    nextBestActions.unshift(
      'Passer en WON et declencher onboarding/facturation.',
    );
  } else if (score <= 20 && input.lostStage) {
    recommendedOutcome = 'LOST';
    recommendedStageId = input.lostStage.id;
    recommendedStageName = input.lostStage.name;
    nextBestActions.unshift('Passer en LOST et tracer la raison de perte.');
  } else if (
    input.currentStage &&
    input.nextOpenStage &&
    score >= Math.round(stageProbability * 100) + 12
  ) {
    recommendedStageId = input.nextOpenStage.id;
    recommendedStageName = input.nextOpenStage.name;
    nextBestActions.unshift(
      `Faire avancer le lead vers l etape "${input.nextOpenStage.name}".`,
    );
  }

  if (nextBestActions.length === 0) {
    nextBestActions.push('Planifier une action commerciale concrete sous 48h.');
  }

  return {
    signals: {
      daysToClose: input.daysToClose,
      daysInStage: input.daysInStage,
    },
    analysis: {
      score,
      winProbability,
      confidence,
      lossRisk,
      reasons: uniqueText(reasons),
      strengths: uniqueText(strengths),
      risks: uniqueText(risks),
      nextBestActions: uniqueText(nextBestActions).slice(0, 5),
      recommendedOutcome,
      recommendedStageId,
      recommendedStageName,
      explanation:
        recommendedOutcome === 'WON'
          ? 'Le lead est suffisamment mature pour etre clos en WON.'
          : recommendedOutcome === 'LOST'
            ? 'Les signaux sont trop faibles; classement LOST recommande.'
            : `Lead a suivre activement${recommendedStageName ? ` (etape cible: ${recommendedStageName})` : ''}.`,
    },
  };
}

function buildCrm360Coach(input: Crm360CoachInput) {
  const proofPoints: string[] = [];
  const blockers: string[] = [];
  const suggestedActions: Array<{
    kind: 'TASK' | 'EMAIL' | 'WHATSAPP' | 'ADVANCE_STAGE' | 'PROPOSAL';
    label: string;
    dueInDays: number | null;
  }> = [];

  if (input.hasClient) {
    proofPoints.push('Lead relie a un client CRM identifiable.');
  } else {
    blockers.push('Aucun client relie a cette opportunite.');
    suggestedActions.push({
      kind: 'TASK',
      label: 'Qualifier le decisionnaire et relier le lead a un client CRM',
      dueInDays: 1,
    });
  }

  if (input.openTasks > 0) {
    proofPoints.push(`${input.openTasks} tache(s) ouverte(s) deja rattachee(s) au client.`);
  } else {
    blockers.push('Aucune tache ouverte pour piloter la prochaine action.');
    suggestedActions.push({
      kind: 'TASK',
      label: 'Creer une tache de suivi datee sous 24h',
      dueInDays: 1,
    });
  }

  if (input.overdueTasks > 0) {
    blockers.push(`${input.overdueTasks} tache(s) en retard sur ce compte.`);
  }

  if (input.staleStage) {
    blockers.push(`Lead fige depuis ${input.daysInStage} jours dans l etape "${input.stageName}".`);
    suggestedActions.push({
      kind: 'EMAIL',
      label: 'Envoyer une relance decisionnaire avec prochaine etape datee',
      dueInDays: 0,
    });
  } else {
    proofPoints.push(`Mouvement recent conserve dans l etape actuelle (${input.daysInStage} jours).`);
  }

  if (input.closingLate) {
    blockers.push('Date de closing depassee: le planning doit etre revalide.');
    suggestedActions.push({
      kind: 'WHATSAPP',
      label: 'Revalider tout de suite timing et blocage principal',
      dueInDays: 0,
    });
  }

  if (input.hasProposal) {
    proofPoints.push('Une proposition commerciale est deja disponible sur le deal.');
  } else if (input.stageStatus === 'OPEN') {
    suggestedActions.push({
      kind: 'PROPOSAL',
      label: 'Preparer une proposition ou recap clair des livrables',
      dueInDays: 2,
    });
  }

  if (input.totalInvoices > 0) {
    proofPoints.push(`${input.totalInvoices} facture(s) historique(s) existent sur ce client.`);
  }

  if (input.openRelatedDeals > 0) {
    proofPoints.push(`${input.openRelatedDeals} autre(s) deal(s) ouvert(s) sur le meme compte.`);
  }

  if (input.stageStatus === 'OPEN' && !input.staleStage && input.daysSinceUpdate <= 3) {
    suggestedActions.push({
      kind: 'ADVANCE_STAGE',
      label: 'Verifier si le lead peut avancer a l etape suivante',
      dueInDays: 1,
    });
  }

  const priority: 'LOW' | 'MEDIUM' | 'HIGH' =
    input.overdueTasks > 0 || input.closingLate || (!input.hasClient && input.stageStatus === 'OPEN')
      ? 'HIGH'
      : input.staleStage || input.openTasks === 0
        ? 'MEDIUM'
        : 'LOW';

  const summary =
    priority === 'HIGH'
      ? `Attention immediate requise sur "${input.dealTitle}".`
      : priority === 'MEDIUM'
        ? `Lead a reprendre activement pour maintenir le momentum.`
        : `Lead globalement sous controle, avec marge pour accelerer.`;

  return {
    priority,
    summary,
    proofPoints: uniqueText(proofPoints).slice(0, 6),
    blockers: uniqueText(blockers).slice(0, 6),
    suggestedActions: uniqueText(
      suggestedActions.map((item) => JSON.stringify(item)),
    )
      .map((item) => JSON.parse(item) as (typeof suggestedActions)[number])
      .slice(0, 6),
  };
}

function detectTextSignals(text: string): {
  positiveHits: string[];
  negativeHits: string[];
} {
  const value = (text || '').toLowerCase();
  if (!value.trim()) return { positiveHits: [], negativeHits: [] };

  const positive = [
    'ok',
    'accord',
    'valide',
    'go',
    'confirme',
    'approved',
    'approved budget',
    'ready',
    'decision',
    'signature',
  ];
  const negative = [
    'retard',
    'delay',
    'bloque',
    'blocked',
    'budget freeze',
    'no budget',
    'pas de budget',
    'cancel',
    'silence',
    'ghost',
    'risk',
    'risque',
  ];

  return {
    positiveHits: positive.filter((word) => value.includes(word)),
    negativeHits: negative.filter((word) => value.includes(word)),
  };
}

function toDateOrNull(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toDateOrNow(value: Date | string | null | undefined): Date {
  return toDateOrNull(value) || new Date();
}

function daysSince(value: Date): number {
  const diffMs = Date.now() - value.getTime();
  return Math.max(0, Math.floor(diffMs / 86_400_000));
}

function daysUntil(value: Date): number {
  const diffMs = value.getTime() - Date.now();
  return Math.ceil(diffMs / 86_400_000);
}

function isPastDue(value: Date | null | undefined): boolean {
  if (!value) return false;
  return value.getTime() < Date.now();
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function round2(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

function uniqueText(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const raw of values) {
    const value = String(raw || '').trim();
    if (!value) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    output.push(value);
  }
  return output;
}

function toErrorMessage(err: unknown): string {
  if (!err) return 'Unknown error';
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return 'Unknown error';
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
    const [first] = output as unknown[];
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
    const [first] = output as unknown[];
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
    const [first] = output as unknown[];
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
  const positive = [
    'ok',
    'merci',
    'gracias',
    'perfecto',
    'confirm',
    'vale',
    'super',
    'si',
    'yes',
  ];
  const negative = [
    'retard',
    'delay',
    'problem',
    'problema',
    'urgent',
    'cancel',
    'no puedo',
    'error',
  ];

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

function fallbackDraftEmail(
  leadName: string,
  leadContext: string,
): {
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
