import type { FastifyReply, FastifyRequest } from 'fastify';

interface JwtUser {
  userId: string;
  email: string;
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void>;
    jwt: {
      sign(payload: object, options?: object): string;
      verify(token: string, options?: object): object;
      decode(token: string, options?: object): object | null;
    };
  }

  interface FastifyRequest {
    user: JwtUser;
    rawBody?: Buffer;
    jwtVerify(options?: object): Promise<void>;
    jwtDecode(options?: object): Promise<object | null>;
  }

  interface FastifyReply {
    jwtSign(payload: object, options?: object): Promise<string>;

    // @fastify/sensible HTTP error reply helpers
    badRequest(message?: string): FastifyReply;
    unauthorized(message?: string): FastifyReply;
    paymentRequired(message?: string): FastifyReply;
    forbidden(message?: string): FastifyReply;
    notFound(message?: string): FastifyReply;
    methodNotAllowed(message?: string): FastifyReply;
    notAcceptable(message?: string): FastifyReply;
    proxyAuthenticationRequired(message?: string): FastifyReply;
    requestTimeout(message?: string): FastifyReply;
    conflict(message?: string): FastifyReply;
    gone(message?: string): FastifyReply;
    lengthRequired(message?: string): FastifyReply;
    preconditionFailed(message?: string): FastifyReply;
    payloadTooLarge(message?: string): FastifyReply;
    uriTooLong(message?: string): FastifyReply;
    unsupportedMediaType(message?: string): FastifyReply;
    rangeNotSatisfiable(message?: string): FastifyReply;
    expectationFailed(message?: string): FastifyReply;
    imateapot(message?: string): FastifyReply;
    misdirectedRequest(message?: string): FastifyReply;
    unprocessableEntity(message?: string): FastifyReply;
    locked(message?: string): FastifyReply;
    failedDependency(message?: string): FastifyReply;
    tooEarly(message?: string): FastifyReply;
    upgradeRequired(message?: string): FastifyReply;
    preconditionRequired(message?: string): FastifyReply;
    tooManyRequests(message?: string): FastifyReply;
    requestHeaderFieldsTooLarge(message?: string): FastifyReply;
    unavailableForLegalReasons(message?: string): FastifyReply;
    internalServerError(message?: string): FastifyReply;
    notImplemented(message?: string): FastifyReply;
    badGateway(message?: string): FastifyReply;
    serviceUnavailable(message?: string): FastifyReply;
    gatewayTimeout(message?: string): FastifyReply;
    httpVersionNotSupported(message?: string): FastifyReply;
    variantAlsoNegotiates(message?: string): FastifyReply;
    insufficientStorage(message?: string): FastifyReply;
    loopDetected(message?: string): FastifyReply;
    bandwidthLimitExceeded(message?: string): FastifyReply;
    notExtended(message?: string): FastifyReply;
    networkAuthenticationRequired(message?: string): FastifyReply;
  }
}
