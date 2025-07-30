import * as core from '@actions/core';
import * as ftp from 'basic-ftp';
import * as path from 'path';
import { readdirSync, statSync } from 'fs';

interface File {
  folder: string;
  filename: string;
  fullPath: string;
}

function getAllFiles(dir: string, root: string): File[] {
  const files: File[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.resolve(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getAllFiles(fullPath, root));
    } else {
      files.push({
        folder: path.relative(root, dir),
        filename: entry.name,
        fullPath
      });
    }
  }

  return files;
}

async function retry<T>(fn: () => Promise<T>, finalTry = false): Promise<T> {
  try {
    return await fn();
  } catch (e: any) {
    if (e.code >= 400 && e.code <= 499 && e.code !== 426 && !finalTry) {
      core.info(`Retrying after 4xx error: ${e.code}`);
      await new Promise(r => setTimeout(r, 5000));
      return retry(fn, true);
    }
    throw e;
  }
}

async function run(): Promise<void> {
  try {
    const server = core.getInput('server', { required: true }).trim();
    const username = core.getInput('username', { required: true }).trim();
    const password = core.getInput('password', { required: true }).trim();
    const port = parseInt(core.getInput('port').trim() || '21');
    const secure = core.getInput('secure').trim().toLowerCase() !== 'false';
    const localDir = path.resolve(core.getInput('local_dir').trim() || './');
    let serverDir = core.getInput('server_dir').trim() || './';
    if (!serverDir.endsWith('/')) serverDir += '/';

    core.info(`Connecting to FTP: ${server}:${port} (secure=${secure})`);
    const client = new ftp.Client(30000);
    if (core.isDebug()) client.ftp.verbose = true;

    await client.access({ host: server, user: username, password, port, secure });
    core.info('Connected.');

    const files = getAllFiles(localDir, localDir);

    for (const file of files) {
      const remotePath = path.posix.join(serverDir, file.folder).replace(/\\/g, '/');
      const remoteFilePath = path.posix.join(remotePath, file.filename);
      const localSize = statSync(file.fullPath).size;

      let remoteSize = -1;
      try {
        await client.ensureDir(remotePath);
        remoteSize = await client.size(remoteFilePath);
      } catch {
        core.debug(`Remote file ${remoteFilePath} not found or can't get size.`);
      }

      if (remoteSize === localSize) {
        core.info(`Skipping ${file.folder}/${file.filename} (size unchanged: ${localSize})`);
        continue;
      }

      core.info(`Uploading ${file.folder}/${file.filename} (local: ${localSize}, remote: ${remoteSize})`);
      try {
        await retry(() => client.uploadFrom(file.fullPath, file.filename));
      } catch (err) {
        core.error(`Upload failed for ${file.filename}: ${err}`);
        throw err;
      }
    }

    client.close();
    core.info('Upload complete.');
  } catch (err: any) {
    core.setFailed(`Action failed: ${err.message || err}`);
  }
}

run();
