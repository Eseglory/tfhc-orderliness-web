import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map } from 'rxjs/operators';

// Relations can include nested users and meetings. Strip credentials at the HTTP
// boundary while keeping signing secrets available to internal services.
export function removeResponseSecrets(value: any): any {
  if (value === null || typeof value !== 'object' || value instanceof Date || Buffer.isBuffer(value)) return value;
  if (Array.isArray(value)) return value.map(removeResponseSecrets);
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !['passwordHash', 'qrSecret', 'googleSubject'].includes(key))
    .map(([key, nested]) => [key, removeResponseSecrets(nested)]));
}

@Injectable()
export class ResponseSecretsInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler) {
    return next.handle().pipe(map(removeResponseSecrets));
  }
}
