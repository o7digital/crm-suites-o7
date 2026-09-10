import { SetMetadata } from '@nestjs/common';
import type { ChatGptScope } from './chatgpt-auth.types';

export const CHATGPT_SCOPE_METADATA = 'chatgpt:scope';
export const RequireChatGptScopes = (...scopes: ChatGptScope[]) =>
  SetMetadata(CHATGPT_SCOPE_METADATA, scopes);
