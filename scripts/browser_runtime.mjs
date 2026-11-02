import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(new URL('../Frontend/package.json', import.meta.url));
const runtime = process.env.PLAYWRIGHT_MODULE || pathToFileURL(require.resolve('playwright')).href;
const loaded = await import(runtime);
export const chromium = loaded.chromium || loaded.default.chromium;
export const launchOptions = {
  executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(),
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
};
