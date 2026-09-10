import type { Request } from 'express';

export const CHATGPT_READ_SCOPES = [
  'clients:read',
  'deals:read',
  'tasks:read',
  'invoices:read',
  'forecast:read',
] as const;

export type ChatGptScope = (typeof CHATGPT_READ_SCOPES)[number];

export type ChatGptAuthContext = {
  tenantId: string;
  apiKeyId: string;
  scopes: ChatGptScope[];
};

export type ChatGptRequest = Request & {
  chatGptAuth?: ChatGptAuthContext;
};
