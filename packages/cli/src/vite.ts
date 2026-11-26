import { startWithDevServer } from "./dev.ts";

/**
 * `usepilot/vite`: Pilot starts with Vite's dev server (and the frameworks
 * built on it: SvelteKit, Astro, Nuxt, React Router), so the designer never
 * runs `npx usepilot`. Only while Vite serves (`apply: "serve"`): a build
 * never has it. It starts the runner (dev.ts), and leaves loading Pilot in
 * the page to the app's own loader, as `init` writes it.
 *
 * ```ts
 * import { pilot } from "usepilot/vite";
 * export default defineConfig({ plugins: [pilot()] });
 * ```
 *
 * No dependency on Vite: the plugin is a plain object of the shape Vite reads.
 */

/** The part of Vite's dev server the plugin uses. */
interface DevServer {
  config: { root: string; logger: { info(message: string, options?: { timestamp?: boolean }): void } };
  httpServer?: { once(event: "listening" | "close", listener: () => void): unknown } | null;
  resolvedUrls?: { local: string[] } | null;
}

export interface PilotPlugin {
  name: string;
  apply: "serve";
  configureServer(server: DevServer): void;
}

export function pilot(): PilotPlugin {
  return {
    name: "usepilot",
    apply: "serve",
    configureServer(server) {
      const start = () => {
        const runner = startWithDevServer({
          cwd: server.config.root,
          // Vite's own address for the app, once it listens (none in middleware mode: Pilot finds the page by project).
          ...(server.resolvedUrls?.local[0] ? { url: server.resolvedUrls.local[0] } : {}),
          out: (line) => server.config.logger.info(`[pilot] ${line}`, { timestamp: true }),
        });
        // Vite restarting (its config changed) closes this server and starts another: the runner goes with it.
        server.httpServer?.once("close", () => void runner?.close());
      };
      // Vite sets its addresses just after the server starts listening.
      if (server.httpServer) server.httpServer.once("listening", () => setTimeout(start, 0));
      else start();
    },
  };
}

export default pilot;
