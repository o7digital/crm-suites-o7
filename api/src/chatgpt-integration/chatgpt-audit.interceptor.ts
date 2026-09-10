import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Response } from 'express';
import { Observable } from 'rxjs';
import { finalize, tap } from 'rxjs/operators';
import type { ChatGptRequest } from './chatgpt-auth.types';
import { ChatGptAuditService } from './chatgpt-audit.service';

@Injectable()
export class ChatGptAuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: ChatGptAuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<ChatGptRequest>();
    const response = http.getResponse<Response>();
    const auth = request.chatGptAuth;
    let statusHttp: number | null = null;

    return next.handle().pipe(
      tap({
        error: (error: unknown) => {
          statusHttp = error instanceof HttpException ? error.getStatus() : 500;
        },
      }),
      finalize(() => {
        if (!auth) return;
        void this.audit.record({
          tenantId: auth.tenantId,
          apiKeyId: auth.apiKeyId,
          endpoint: (request.originalUrl || request.url || '').split('?')[0],
          statusHttp: statusHttp ?? response.statusCode,
        });
      }),
    );
  }
}
