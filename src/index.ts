import * as core from '@actions/core';
import * as ftp from 'basic-ftp';
import * as path from 'path';
import { readdirSync } from 'fs';

interface File {
  folder: string;
  filename: string;
  fullPath: string;
  dirLevel: number;
}

async function* getFiles(dir: string, absRoot: string, dirLevel = 0): AsyncGenerator<File> {
  const dirents = readdirSync(dir, { withFileTypes: true });
  for (const dirent of dirents) {
    const res = path.resolve(dir, dirent.name);
    if (dirent.isDirectory()) {
      yield* getFiles(res, absRoot, dirLevel + 1);
    } else {
      yield {
        folder: path.relative(absRoot, dir),
        filename: dirent.name,
        fullPath: res,
        dirLevel
      };
    }
  }
}

async function retryRequest<T>(callback: () => Promise<T>, isFinalAttempt = false): Promise<T> {
  try {
    return await callback();
  } catch (e: any) {
    if (e.code >= 400 && e.code <= 499 && e.code !== 426) {
      core.info(`4xx error detected (code ${e.code}). Retrying...`);
      await new Promise(res => setTimeout(res, 5000));
      if (isFinalAttempt) {
        return await callback();
      }
      return await retryRequest(callback, true);
    }
    throw e;
  }
}

async function run(): Promise<void> {
  try {
    const server = core.getInput('server', { required: true }).trim();
    const username = core.getInput('username', { required: true }).trim();
    const password = core.getInput('password', { required: true }).trim();
    const portInput = core.getInput('port').trim();
    const secureInput = core.getInput('secure').trim().toLowerCase();
    const localDirInput = core.getInput('local_dir').trim() || './';
    let serverDirInput = core.getInput('server_dir').trim() || './';

    const port = portInput ? Number(portInput) : 21;
    const secure = secureInput === 'false' ? false : true;

    if (!serverDirInput.endsWith('/')) {
      serverDirInput += '/';
    }

    core.info(`Connecting to FTP server: ${server}:${port} (secure=${secure})`);
    core.info(`Uploading local dir: "${localDirInput}" to server dir: "${serverDirInput}"`);

    const client = new ftp.Client(30000);
    if (core.isDebug()) {
      client.ftp.verbose = true;
    }

    await client.access({
      host: server,
      user: username,
      password,
      port,
      secure
    });

    core.info('Connected to FTP server.');

    const absLocalDir = path.resolve(localDirInput);
    core.debug(`Resolved local directory: ${absLocalDir}`);

    for await (const file of getFiles(absLocalDir, absLocalDir)) {
      const remoteDir = path.posix.join(serverDirInput, file.folder).replace(/\\/g, '/');
      core.info(`Uploading ${file.folder}/${file.filename} to ${remoteDir} ...`);
      core.debug(`File info: ${JSON.stringify(file)}`);

      try {
        await client.ensureDir(remoteDir);
        await retryRequest(() => client.uploadFrom(file.fullPath, file.filename));
      } catch (uploadError) {
        core.error(`Failed uploading file ${file.filename} to ${remoteDir}: ${uploadError}`);
        throw uploadError;
      }
    }

    core.info('Upload completed successfully.');
    client.close();
  } catch (error: any) {
    core.setFailed(`Action failed: ${error.message || error}`);
  }
}

run();
