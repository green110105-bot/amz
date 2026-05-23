import { routeRegistry } from './route-registry.mjs';
import { documentedRoutes } from '../generated/documented-routes.mjs';

export function buildOpenApiDocument() {
  const paths = {};
  for (const route of mergeRoutes(routeRegistry, documentedRoutes)) {
    paths[route.path] ||= {};
    paths[route.path][route.method] = {
      operationId: route.operationId,
      tags: route.tags,
      summary: route.summary,
      parameters: route.parameters || [],
      responses: {
        200: {
          description: 'Successful response',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ApiResponse' },
            },
          },
        },
        202: { description: 'Accepted asynchronous or queued response' },
        400: { $ref: '#/components/responses/BadRequest' },
        404: { $ref: '#/components/responses/NotFound' },
        500: { $ref: '#/components/responses/InternalError' },
      },
    };

    if (['post', 'put', 'patch'].includes(route.method)) {
      paths[route.path][route.method].requestBody = {
        required: false,
        content: {
          'application/json': {
            schema: { type: 'object', additionalProperties: true },
          },
        },
      };
    }
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'amz AI Operator API',
      version: '0.1.0',
      description: 'Contract-first API surface for the PRD-driven Amazon AI operator. External integrations are mock-gated until credentials exist.',
    },
    servers: [{ url: process.env.API_BASE_URL || 'http://localhost:8080' }],
    paths,
    components: {
      schemas: {
        ApiResponse: {
          type: 'object',
          additionalProperties: true,
          properties: {
            sourceMode: { type: 'string', enum: ['mock', 'sandbox', 'real'] },
            generatedAt: { type: 'string', format: 'date-time' },
          },
        },
        ErrorResponse: {
          type: 'object',
          required: ['error'],
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
            requestId: { type: 'string' },
          },
        },
      },
      responses: {
        BadRequest: { description: 'Bad request', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        NotFound: { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        InternalError: { description: 'Internal error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
      },
    },
  };
}

function mergeRoutes(primary, documented) {
  const merged = [];
  const seen = new Set();
  for (const route of [...primary, ...documented]) {
    const key = `${route.method} ${route.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(route);
  }
  return merged;
}
