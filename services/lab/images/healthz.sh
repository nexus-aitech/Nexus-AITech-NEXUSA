#!/usr/bin/env sh
curl -fsS http://127.0.0.1:8888/api/status >/dev/null || exit 1
