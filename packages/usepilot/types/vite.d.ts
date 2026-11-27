// `usepilot/vite`: Pilot starts with Vite's dev server (never in a build). Add `pilot()` to the config's plugins.
export interface PilotPlugin {
  name: string;
  apply: "serve";
  configureServer(server: unknown): void;
}

export declare function pilot(): PilotPlugin;
export default pilot;
