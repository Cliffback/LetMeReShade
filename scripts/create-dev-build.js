#!/usr/bin/env node

import { execSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// Colors for output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[0;31m',
  green: '\x1b[0;32m',
  yellow: '\x1b[1;33m',
  blue: '\x1b[0;34m',
};

const log = {
  info: (msg) => console.log(`${colors.blue}${msg}${colors.reset}`),
  success: (msg) => console.log(`${colors.green}${msg}${colors.reset}`),
  warning: (msg) => console.log(`${colors.yellow}${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}${msg}${colors.reset}`),
};

console.log(`${colors.yellow}=== DEV RELEASE MODE ===${colors.reset}`);
console.log(
  `${colors.yellow}No changes will be committed or published${colors.reset}\n`,
);

// Change to root directory
process.chdir(rootDir);

// Get current version from package.json
const packageJsonPath = join(rootDir, 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
const currentVersion = packageJson.version;

log.info('=== LetMeReShade Dev Release Builder ===');
log.warning(`Current version: ${currentVersion}\n`);

// Create dev version with counter
let devCounter = 1;
let version = `${currentVersion}-dev.${devCounter}`;

// Run linting/formatting if configured
log.info('Checking for linters and formatters...');

// Check for lint script
if (packageJson.scripts?.lint) {
  log.info('Running lint...');
  try {
    execSync('pnpm run lint', { stdio: 'inherit' });
  } catch (_error) {
    log.error('Linting failed');
    process.exit(1);
  }
} else {
  log.warning('No lint script found, skipping');
}

// Check for prettier/format
if (
  packageJson.devDependencies?.prettier ||
  packageJson.dependencies?.prettier ||
  existsSync('.prettierrc') ||
  existsSync('.prettierrc.json') ||
  existsSync('.prettierrc.js')
) {
  if (packageJson.scripts?.format) {
    log.info('Running prettier...');
    try {
      execSync('pnpm run format', { stdio: 'inherit' });
    } catch (_error) {
      log.error('Formatting failed');
      process.exit(1);
    }
  } else {
    log.warning('Prettier configured but no format script found, skipping');
  }
}

// Check for test script (but skip if it's just the default "no test specified")
const testScript = packageJson.scripts?.test;
if (testScript && !testScript.includes('no test specified')) {
  log.info('Running tests...');
  try {
    execSync('pnpm run test', { stdio: 'inherit' });
  } catch (_error) {
    log.error('Tests failed');
    process.exit(1);
  }
} else {
  log.warning('No tests configured, skipping');
}

// Install dependencies
log.info('Installing dependencies...');
try {
  execSync('pnpm install', { stdio: 'inherit' });
} catch (_error) {
  log.error('Failed to install dependencies');
  process.exit(1);
}

// Build the plugin
log.info('Building plugin...');
try {
  execSync('pnpm run build', { stdio: 'inherit' });
} catch (_error) {
  log.error('Build failed');
  process.exit(1);
}

// Check if dist directory exists
if (!existsSync('dist')) {
  log.error('Error: dist directory not found. Build may have failed.');
  process.exit(1);
}

// Create builds directory if it doesn't exist
const buildsDir = 'builds';
if (!existsSync(buildsDir)) {
  mkdirSync(buildsDir);
}

// Create release directory
const releaseDir = 'LetMeReShade';
let zipName = join(buildsDir, `LetMeReShade_v${version}.zip`);

// Check if zip already exists and bump dev counter if needed
while (existsSync(zipName)) {
  log.warning(`Zip file ${zipName} already exists, bumping dev counter...`);
  devCounter++;
  version = `${currentVersion}-dev.${devCounter}`;
  zipName = join(buildsDir, `LetMeReShade_v${version}.zip`);
  log.warning(`Trying version: ${version}`);
}

if (devCounter > 1) {
  log.warning(`Final version: ${version}`);
  log.warning(`Final zip name: ${zipName}`);
}

// Temporarily update package.json version for the zip
log.warning(
  `Temporarily updating package.json to version ${version} for zip...`,
);
const originalPackageJson = readFileSync(packageJsonPath, 'utf8');
const updatedPackageJson = { ...packageJson, version };
writeFileSync(
  packageJsonPath,
  `${JSON.stringify(updatedPackageJson, null, 2)}\n`,
);

log.info('Creating release package...');

// Create temporary directory structure
if (existsSync(releaseDir)) {
  rmSync(releaseDir, { recursive: true, force: true });
}
if (existsSync(zipName)) {
  rmSync(zipName, { force: true });
}
mkdirSync(releaseDir);

// Copy necessary files
try {
  cpSync('dist', join(releaseDir, 'dist'), { recursive: true });
  cpSync('defaults', join(releaseDir, 'defaults'), { recursive: true });
  cpSync('main.py', join(releaseDir, 'main.py'));
  cpSync('package.json', join(releaseDir, 'package.json'));
  cpSync('plugin.json', join(releaseDir, 'plugin.json'));
  cpSync('LICENSE', join(releaseDir, 'LICENSE'));
  cpSync('README.md', join(releaseDir, 'README.md'));
} catch (error) {
  log.error(`Failed to copy files: ${error.message}`);
  // Restore package.json before exiting
  writeFileSync(packageJsonPath, originalPackageJson);
  process.exit(1);
}

// Restore package.json
log.warning('Restoring original package.json...');
writeFileSync(packageJsonPath, originalPackageJson);

// Create zip file
log.info(`Creating zip file: ${zipName}`);
try {
  execSync(`zip -r "${zipName}" "${releaseDir}"`, { stdio: 'inherit' });
} catch (_error) {
  log.error('Failed to create zip file');
  process.exit(1);
}

// Cleanup
rmSync(releaseDir, { recursive: true, force: true });

log.success(`✓ Dev release package created: ${zipName}`);

console.log();
log.success('=== Dev Build Complete ===');
log.warning('No changes were published');
console.log(`Release file: ${colors.blue}${zipName}${colors.reset}`);
console.log(`Version: ${colors.blue}${version}${colors.reset}`);
