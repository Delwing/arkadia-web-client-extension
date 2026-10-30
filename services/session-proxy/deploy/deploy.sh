#!/usr/bin/env bash
# Build the proxy and put it on the server.
#
#   ./deploy.sh user@host [arm64|amd64]
#
# Deploying restarts the service, which drops every live session — the game connection
# lives in this process. Run it when nobody is playing.
set -euo pipefail

TARGET="${1:?usage: deploy.sh user@host [arm64|amd64]}"
ARCH="${2:-arm64}"
REMOTE_DIR=/opt/session-proxy

cd "$(dirname "$0")/.."

echo "==> testing"
go test ./...

echo "==> building linux/${ARCH}"
GOOS=linux GOARCH="${ARCH}" go build -trimpath -ldflags "-s -w" -o "/tmp/session-proxy-${ARCH}" .

echo "==> uploading to ${TARGET}"
# Staged in the home directory first: the service user cannot write to /opt, and the
# running binary cannot be overwritten in place while it is executing.
scp "/tmp/session-proxy-${ARCH}" "${TARGET}:/tmp/session-proxy.new"

echo "==> installing"
ssh "${TARGET}" "sudo install -o sessionproxy -g sessionproxy -m 0755 /tmp/session-proxy.new ${REMOTE_DIR}/session-proxy \
  && rm -f /tmp/session-proxy.new \
  && sudo systemctl restart session-proxy \
  && sleep 1 \
  && systemctl is-active session-proxy"

echo "==> health"
ssh "${TARGET}" "curl -fsS http://127.0.0.1:8080/health"
echo
