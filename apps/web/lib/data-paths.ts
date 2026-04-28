// Where on the host the writable demo state lives. Both spawned goose-runner
// machines (recipes) and the agentgateway container (registry) bind-mount
// these paths read-only, so we *write* from the web process and the other
// containers see the changes within a refresh interval.
//
// On Fly (M5) these become Fly Volumes mounted into the same containers.

import path from "node:path";

const ROOT = process.env.GLOOP_DATA_DIR ?? path.resolve(process.cwd(), "data");

export const DATA_PATHS = {
  root: ROOT,
  recipesDir: path.join(ROOT, "goose-recipes"),
  registry: path.join(ROOT, "gateway", "registry.json"),
  sessions: path.join(ROOT, "sessions.db"),
};

/** Absolute paths for `docker run -v <abs>:<container>` bind mounts. */
export const DOCKER_MOUNTS = {
  recipesDir: DATA_PATHS.recipesDir,
};
