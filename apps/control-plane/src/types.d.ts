import type { FastifyReply, FastifyRequest } from 'fastify';

interface JwtUser {
  userId: string;
  email: string;
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void>;
  }

  interface FastifyRequest {
    user: JwtUser;
    rawBody?: Buffer;
  }
}
