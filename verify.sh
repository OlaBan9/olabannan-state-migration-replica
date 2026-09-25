#!/usr/bin/env bash
# WebCraft 2.0 operational verify for olabannan-state-migration-replica.
#
#   ./verify.sh --plan   # dry run: print what would happen, change nothing
#   ./verify.sh          # dev profile: compose build + up, then health check
#   ./verify.sh --prod   # production profile: plain `docker build` + `docker run`, then health check
#
# The replica is a dependency-free static site served by nginx, so both
# profiles serve the identical file set; there is no dev server and no build
# step that could diverge between profiles. Setup needs zero live fetch:
# all JS libraries, map geometry, and the dataset are vendored in the repo.
set -euo pipefail

PORT=8901
URL="http://localhost:${PORT}/"
PROD_IMAGE="olabannan-state-migration-replica:prod"
PROD_CONTAINER="olabannan-state-migration-replica-prod"

wait_for_health() {
  local tries=60
  while [ "$tries" -gt 0 ]; do
    if curl -fsS --max-time 2 "$URL" > /dev/null 2>&1; then
      echo "health: PASS ($URL)"
      return 0
    fi
    tries=$((tries - 1))
    sleep 1
  done
  echo "health: FAIL ($URL did not respond within 60s)" >&2
  return 1
}

plan() {
  cat <<EOF
plan: olabannan-state-migration-replica (static site + nginx, port ${PORT}, health /)
  dev:  docker compose up --build -d   # single service: app
        curl -fsS $URL                  # health check
  prod: docker build -f environment/Dockerfile -t ${PROD_IMAGE} .
        docker run -d --name ${PROD_CONTAINER} -p ${PORT}:8901 ${PROD_IMAGE}
        curl -fsS $URL                  # health check
  notes: no package install, no build step, no registry fetch at setup;
         d3/topojson/us-atlas vendored under vendor/, dataset vendored as CSV.
         deterministic seed: static files only, no store — clean boots are identical.
EOF
}

dev() {
  # Free the host port so dev boots clean even after a prod run.
  docker rm -f "$PROD_CONTAINER" > /dev/null 2>&1 || true
  docker compose down --remove-orphans > /dev/null 2>&1 || true
  docker compose up --build -d
  wait_for_health
  echo "dev: UP at $URL"
}

prod() {
  # Free the host port so the prod container boots clean even after a dev run.
  docker compose down --remove-orphans > /dev/null 2>&1 || true
  docker rm -f "$PROD_CONTAINER" > /dev/null 2>&1 || true
  docker build -f environment/Dockerfile -t "$PROD_IMAGE" .
  docker run -d --name "$PROD_CONTAINER" -p "${PORT}:8901" "$PROD_IMAGE"
  wait_for_health
  echo "prod: UP at $URL (container $PROD_CONTAINER)"
}

case "${1:-}" in
  --plan) plan ;;
  --prod) prod ;;
  "") dev ;;
  *) echo "usage: ./verify.sh [--plan|--prod]" >&2; exit 2 ;;
esac
