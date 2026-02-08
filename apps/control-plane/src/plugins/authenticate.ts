import type { FastifyReply, FastifyRequest } from 'fastify';

import fp from 'fastify-plugin';

export default fp(async (app) => {
  app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      reply.unauthorized('Unauthorized');
    }
  });
});
