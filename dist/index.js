"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const ftp = __importStar(require("basic-ftp"));
const path = __importStar(require("path"));
const fs_1 = require("fs");
async function* getFiles(dir, absRoot, dirLevel = 0) {
    const dirents = (0, fs_1.readdirSync)(dir, { withFileTypes: true });
    for (const dirent of dirents) {
        const res = path.resolve(dir, dirent.name);
        if (dirent.isDirectory()) {
            yield* getFiles(res, absRoot, dirLevel + 1);
        }
        else {
            yield {
                folder: path.relative(absRoot, dir),
                filename: dirent.name,
                fullPath: res,
                dirLevel
            };
        }
    }
}
async function retryRequest(callback, isFinalAttempt = false) {
    try {
        return await callback();
    }
    catch (e) {
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
async function run() {
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
            }
            catch (uploadError) {
                core.error(`Failed uploading file ${file.filename} to ${remoteDir}: ${uploadError}`);
                throw uploadError;
            }
        }
        core.info('Upload completed successfully.');
        client.close();
    }
    catch (error) {
        core.setFailed(`Action failed: ${error.message || error}`);
    }
}
run();
