import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

export class AppError extends Error {
  public readonly httpCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;
  public readonly description: string;

  constructor(params: {
    code: string;
    httpCode: number;
    description: string;
    isOperational?: boolean;
  }) {
    super(params.description);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'AppError';
    this.code = params.code;
    this.httpCode = params.httpCode;
    this.description = params.description;
    this.isOperational = params.isOperational ?? true;
  }
}

export function registerErrorHandlers(app: FastifyInstance): void {
  app.setNotFoundHandler((request, reply) => {
    void reply.status(404).send({
      error: {
        code: 'NOT_FOUND',
        message: `Route ${request.method} ${request.url} not found`,
      },
    });
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      request.log.warn(
        { code: error.code, httpCode: error.httpCode, err: error },
        error.description,
      );
      void reply.status(error.httpCode).send({
        error: {
          code: error.code,
          message: error.description,
        },
      });
      return;
    }

    if (error instanceof ZodError) {
      request.log.warn({ issues: error.issues }, 'Request validation failed');
      void reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: error.issues.map((issue) => issue.message).join('; '),
        },
      });
      return;
    }

    request.log.error({ err: error }, 'Unhandled internal server error');
    void reply.status(500).send({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred',
      },
    });
  });
}
