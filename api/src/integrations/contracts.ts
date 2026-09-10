export type IntegrationProvider = 'mailchimp' | 'cloudbeds' | 'ga4' | 'olivia';
export type IntegrationState = 'not_configured' | 'configured_unverified' | 'unavailable' | 'connected' | 'error';
export interface IntegrationContext { tenantId: string; actorId: string; }
export interface IntegrationStatus {
  provider: IntegrationProvider;
  state: IntegrationState;
  capabilities: string[];
  missing: string[];
  message: string;
}
// Adapters are invoked server-side after authorization, never with a browser-selected tenant.
export interface ConnectionAdapter {
  status(context: IntegrationContext): Promise<IntegrationStatus>;
}
export interface MailchimpAdapter extends ConnectionAdapter {
  createDraft(context: IntegrationContext, input: { subject: string; html: string; audienceId: string; idempotencyKey: string }): Promise<{ providerId: string; status: 'draft' }>;
}
export interface CloudbedsAdapter extends ConnectionAdapter {
  readReservations(context: IntegrationContext, input: { propertyId: string; cursor?: string }): Promise<{ records: Array<{ externalId: string; guestId: string; arrival: string; departure: string }>; cursor?: string }>;
}
export interface AnalyticsAdapter extends ConnectionAdapter {
  readReport(context: IntegrationContext, input: { propertyId: string; from: string; to: string; timeZone: string }): Promise<{ generatedAt: string; rows: Array<{ date: string; activeUsers: number; sessions: number }> }>;
}
export interface OliviaAdapter extends ConnectionAdapter {
  propose(context: IntegrationContext, input: { text: string; idempotencyKey: string }): Promise<{ jobId: string; state: 'queued' | 'running'; sandbox: boolean }>;
  readJob(context: IntegrationContext, jobId: string): Promise<{ state: 'queued' | 'running' | 'failed' | 'completed'; suggestion?: string; sandbox: boolean }>;
}
