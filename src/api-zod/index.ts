export * from "./generated/api";
export * from "./generated/types";

// The names below are defined in both ./generated/api (as Zod schemas,
// the canonical runtime validators this package exists to provide) and
// ./generated/types (as plain TS interfaces from the same OpenAPI spec).
// Re-exporting them explicitly from the Zod module resolves the ambiguity.
export {
  AdminLoginBody,
  AdminLoginResponse,
  AppLoginBody,
  AppRegisterBody,
  RevenuecatWebhookBody,
} from "./generated/api";
