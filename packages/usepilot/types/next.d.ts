// `usepilot/next`: Pilot starts with `next dev` (never with next build or next start). Wrap the config: `export default withPilot(nextConfig)`.
export declare const DEV_PHASE = "phase-development-server";

export declare function withPilot<Config>(
  config: Config | ((phase: string, context: unknown) => Config | Promise<Config>),
): (phase: string, context: unknown) => Config | Promise<Config>;
export default withPilot;
