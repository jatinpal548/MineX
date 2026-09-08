// Metro config for CoalGuard Field inside the npm-workspaces monorepo.
// Follows the official Expo monorepo guide:
// https://docs.expo.dev/guides/monorepos/
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Watch the app AND the monorepo root (so edits in packages/* hot-reload).
config.watchFolders = [...(config.watchFolders ?? []), monorepoRoot];

// 2. Resolve modules from the app first, then fall back to the hoisted root.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// 3. Never crawl/watch a workspace app's Next.js build output. `apps/web/.next`
//    is created by `next dev` / `next build` and deleted on cleanup; a Metro
//    file-watch handle on a directory that disappears crashes startup with
//    `ENOENT: no such file or directory, watch .../.next/cache/swc/plugins/...`.
//    metro-file-map derives its ignore pattern from `resolver.blockList`, so a
//    match here is excluded from BOTH the initial crawl and the watcher.
//    Merged into one RegExp with Expo's default (the `__tests__` exclusion).
const nextBuildOutput = String.raw`[\\/]apps[\\/][^\\/]+[\\/]\.next([\\/].*)?$`;
const defaultBlockList =
  config.resolver.blockList instanceof RegExp ? config.resolver.blockList.source : null;
config.resolver.blockList = new RegExp(
  [defaultBlockList, nextBuildOutput].filter(Boolean).map((src) => `(${src})`).join('|'),
);

module.exports = config;
