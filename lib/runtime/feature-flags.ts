/**
 * Public deployments keep paid, real-model requests off unless an operator
 * explicitly opts in at runtime. This value is deliberately not a public env
 * variable, so clients cannot enable the route themselves.
 */
export function isRealAiEnabled(): boolean {
  return process.env.ENABLE_REAL_AI === "true";
}
