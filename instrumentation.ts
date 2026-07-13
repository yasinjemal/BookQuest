import type { Instrumentation } from "next";

export function register() {
  // Reserved for future tracing initialization.
}

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context
) => {
  // Instrumentation is compiled for both Node and Edge runtimes, so importing
  // the PostgreSQL observability writer here would pull Node-only modules into
  // the Edge bundle. Critical API routes persist their structured errors; this
  // universal last-resort hook emits a bounded provider-log event.
  console.error(JSON.stringify({
    event_type: "server.request_error",
    area: context.routePath.slice(0, 160),
    error_name: error instanceof Error ? error.name.slice(0, 80) : "UnknownError",
    method: request.method,
    route_type: context.routeType,
    router_kind: context.routerKind,
  }));
};
