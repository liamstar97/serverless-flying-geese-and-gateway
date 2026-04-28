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
  /**
   * One directory holds both metadata (.json) and recipe (.yaml) for each
   * persona. Bind-mounted into spawned goose-runners as /etc/goose-recipes:ro,
   * which only reads the .yaml files — the .json metadata is harmlessly
   * ignored by goose.
   */
  personasDir: path.join(ROOT, "personas"),
  registry: path.join(ROOT, "gateway", "registry.json"),
  sessions: path.join(ROOT, "sessions.db"),
};

/** Absolute paths for `docker run -v <abs>:<container>` bind mounts. */
export const DOCKER_MOUNTS = {
  recipesDir: DATA_PATHS.personasDir,
};
