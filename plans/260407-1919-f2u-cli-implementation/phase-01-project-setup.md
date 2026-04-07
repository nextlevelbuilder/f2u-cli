# Phase 1: Project Setup

## Overview
- **Priority**: P1 (blocker for all other phases)
- **Status**: Pending
- **Effort**: 1h

Initialize pnpm monorepo with TypeScript, configure both packages (worker + cli), set up shared tsconfig.

## Requirements

- pnpm workspace monorepo
- Shared TypeScript base config (ES2022, strict)
- Worker package: Cloudflare Workers types, Hono, wrangler
- CLI package: Commander.js, node-fetch (if needed), tsx for dev
- Root scripts: `dev`, `build`, `deploy`

## Implementation Steps

### 1. Root package.json

```json
{
  "name": "f2u-cli-monorepo",
  "private": true,
  "scripts": {
    "dev:worker": "pnpm --filter @f2u/worker dev",
    "dev:cli": "pnpm --filter f2u-cli dev",
    "build": "pnpm -r build",
    "deploy": "pnpm --filter @f2u/worker deploy"
  },
  "devDependencies": {
    "typescript": "^5.5.0"
  }
}
```

### 2. pnpm-workspace.yaml

```yaml
packages:
  - "packages/*"
```

### 3. tsconfig.base.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist"
  }
}
```

### 4. Worker package.json

```json
{
  "name": "@f2u/worker",
  "private": true,
  "scripts": {
    "dev": "wrangler dev",
    "build": "wrangler deploy --dry-run",
    "deploy": "wrangler deploy"
  },
  "dependencies": {
    "hono": "^4.0.0"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.0.0",
    "wrangler": "^3.0.0",
    "typescript": "^5.5.0"
  }
}
```

### 5. CLI package.json

```json
{
  "name": "f2u-cli",
  "version": "0.1.0",
  "description": "CLI tool for AI agents to upload temporary files to Cloudflare R2",
  "bin": {
    "f2u": "./dist/index.js"
  },
  "scripts": {
    "dev": "tsx src/index.ts",
    "build": "tsup src/index.ts --format esm --dts",
    "prepublishOnly": "pnpm build"
  },
  "dependencies": {
    "commander": "^12.0.0"
  },
  "devDependencies": {
    "tsup": "^8.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.5.0",
    "@types/node": "^20.0.0"
  }
}
```

### 6. Worker tsconfig.json

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "types": ["@cloudflare/workers-types"],
    "lib": ["ES2022"]
  },
  "include": ["src"]
}
```

### 7. CLI tsconfig.json

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "types": ["node"],
    "lib": ["ES2022"],
    "outDir": "dist"
  },
  "include": ["src"]
}
```

### 8. Create directory structure

```bash
mkdir -p packages/worker/src/{routes,cron,db}
mkdir -p packages/cli/src/commands
touch packages/worker/src/index.ts
touch packages/cli/src/index.ts
```

### 9. Install dependencies

```bash
pnpm install
```

## Todo

- [ ] Create root package.json, pnpm-workspace.yaml, tsconfig.base.json
- [ ] Create packages/worker/ with package.json + tsconfig.json
- [ ] Create packages/cli/ with package.json + tsconfig.json
- [ ] Create directory structure (routes, cron, db, commands)
- [ ] Create stub entry files (index.ts for both packages)
- [ ] Run `pnpm install` and verify no errors
- [ ] Verify `pnpm build` runs (even if empty output)

## Success Criteria

- `pnpm install` completes without errors
- `pnpm -r build` runs without TypeScript errors
- Both packages resolve each other's types correctly
- Directory structure matches project spec
