#!/usr/bin/env sh
set -e
cd api
npm ci
npm run build
npm run start:prod
