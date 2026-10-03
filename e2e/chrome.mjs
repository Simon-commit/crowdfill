// Finds (or downloads once) Chrome for Testing, which can still load unpacked extensions.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Browser, computeExecutablePath, detectBrowserPlatform, install, resolveBuildId } from '@puppeteer/browsers';

export async function chromePath(root) {
  const cacheDir = join(root, '.cache', 'chrome');
  const platform = detectBrowserPlatform();
  const buildId = await resolveBuildId(Browser.CHROME, platform, 'stable');
  const executablePath = computeExecutablePath({ browser: Browser.CHROME, buildId, cacheDir });
  if (!existsSync(executablePath)) {
    console.log(`Downloading Chrome for Testing ${buildId}`);
    await install({ browser: Browser.CHROME, buildId, cacheDir });
  }
  return executablePath;
}
