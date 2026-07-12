import type { Instrumentation } from "next";

export function register() {
  // Reserved for future tracing initialization.
}

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context
) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { recordOperationalError } = await import("./lib/observability");
  await recordOperationalError({
    eventType: "server.request_error",
    area: context.routePath,
    error,
    metadata: {
      method: request.method,
      route_type: context.routeType,
      router_kind: context.routerKind,
    },
  });
};
