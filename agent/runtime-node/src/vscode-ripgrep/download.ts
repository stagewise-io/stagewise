import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import https from 'node:https';
import util from 'node:util';
import url from 'node:url';
import type stream from 'node:stream';
import child_process from 'node:child_process';
import proxy_from_env from 'proxy-from-env';
import { HttpsProxyAgent } from 'https-proxy-agent';
import yauzl from 'yauzl'; // use yauzl ^2.9.2 because vscode already ships with it.
const tmpDir = path.join(os.tmpdir(), `vscode-ripgrep-cache-${'1.0.0'}`);

const fsUnlink = util.promisify(fs.unlink);
const fsExists = util.promisify(fs.exists);
const fsMkdir = util.promisify(fs.mkdir);

const isWindows = os.platform() === 'win32';

const REPO = 'microsoft/ripgrep-prebuilt';

/**
 * @param {string} _url
 */
function isGithubUrl(_url: string) {
  return url.parse(_url).hostname === 'api.github.com';
}

/**
 * @param {string} _url
 * @param {fs.PathLike} dest
 * @param {any} opts
 */
function download(
  _url: string,
  dest: fs.PathLike,
  _opts: Record<string, any>,
  onLog?: (message: string) => void,
) {
  const proxy = proxy_from_env.getProxyForUrl(url.parse(_url));
  let opts: Record<string, any>;
  if (proxy !== '') {
    opts = {
      ..._opts,
      agent: new HttpsProxyAgent(proxy),
      proxy,
    };
  } else {
    opts = _opts;
  }

  if (opts.headers?.authorization && !isGithubUrl(_url)) {
    delete opts.headers.authorization;
  }

  return new Promise((resolve, reject) => {
    onLog?.(`Download options: ${JSON.stringify(opts)}`);
    const outFile = fs.createWriteStream(dest);
    const mergedOpts = {
      ...url.parse(_url),
      ...opts,
    };
    https
      .get(mergedOpts, (response) => {
        onLog?.(`statusCode: ${response.statusCode}`);
        if (response.statusCode === 302) {
          response.resume();
          onLog?.(`Following redirect to: ${response.headers.location}`);
          return download(response.headers.location!, dest, opts, onLog).then(
            resolve,
            reject,
          );
        } else if (response.statusCode !== 200) {
          reject(new Error(`Download failed with ${response.statusCode}`));
          return;
        }

        response.pipe(outFile);
        outFile.on('finish', () => {
          resolve(undefined);
        });
      })
      .on('error', async (err) => {
        await fsUnlink(dest);
        reject(err);
      });
  });
}

/**
 * @param {string} _url
 * @param {any} opts
 */
function get(
  _url: string,
  _opts: Record<string, any>,
  onLog?: (message: string) => void,
) {
  onLog?.(`GET ${_url}`);

  const proxy = proxy_from_env.getProxyForUrl(url.parse(_url));
  let opts: Record<string, any>;
  if (proxy !== '') {
    opts = {
      ..._opts,
      agent: new HttpsProxyAgent(proxy),
    };
  } else {
    opts = _opts;
  }

  return new Promise((resolve, reject) => {
    let result = '';
    opts = {
      ...url.parse(_url),
      ...opts,
    };
    https
      .get(opts, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Request failed: ${response.statusCode}`));
        }

        response.on('data', (d) => {
          result += d.toString();
        });

        response.on('end', () => {
          resolve(result);
        });

        response.on('error', (e) => {
          reject(e);
        });
      })
      .on('error', (e) => reject(e));
  });
}

function getApiUrl(repo: string, tag: string) {
  return `https://api.github.com/repos/${repo}/releases/tags/${tag}`;
}

async function getAssetFromGithubApi(
  opts: DownloadRipgrepOptions,
  assetName: string,
  downloadFolder: string,
  onLog?: (message: string) => void,
) {
  const assetDownloadPath = path.join(downloadFolder, assetName);

  // We can just use the cached binary
  if (!opts.force && (await fsExists(assetDownloadPath))) {
    onLog?.(`Using cached download: ${assetDownloadPath}`);
    return assetDownloadPath;
  }

  const downloadOpts: Record<string, any> = {
    headers: {
      'user-agent': 'vscode-ripgrep',
    },
  };

  if (opts.token) downloadOpts.headers.authorization = `token ${opts.token}`;

  onLog?.(`Finding release for ${opts.version}`);
  const release = await get(getApiUrl(REPO, opts.version), downloadOpts, onLog);
  let jsonRelease: Record<string, any>;
  try {
    jsonRelease = JSON.parse(release as string);
  } catch (e) {
    throw new Error(`Malformed API response: ${(e as Error).stack}`);
  }

  if (!jsonRelease.assets) {
    throw new Error(`Bad API response: ${JSON.stringify(release)}`);
  }

  const asset = jsonRelease.assets.find(
    (a: Record<string, any>) => a.name === assetName,
  );
  if (!asset) {
    throw new Error(`Asset not found with name: ${assetName}`);
  }

  onLog?.(`Downloading from ${asset.url}`);
  onLog?.(`Downloading to ${assetDownloadPath}`);

  downloadOpts.headers.accept = 'application/octet-stream';
  await download(asset.url, assetDownloadPath, downloadOpts, onLog);
}

/**
 * @param {string} zipPath
 * @param {string} destinationDir
 */
function unzipWindows(
  zipPath: string,
  destinationDir: string,
  onLog?: (message: string) => void,
) {
  onLog?.(`Unzipping Windows zip to ${destinationDir}`);
  // code from https://stackoverflow.com/questions/63932027/how-to-unzip-to-a-folder-using-yauzl
  return new Promise((resolve, reject) => {
    try {
      // Create folder if not exists
      fs.promises.mkdir(path.dirname(destinationDir), { recursive: true });

      // Same as example we open the zip.
      yauzl.open(
        zipPath,
        { lazyEntries: true },
        (err: Error | null, zipFile: yauzl.ZipFile) => {
          if (err) {
            zipFile?.close();
            reject(err);
            return;
          }

          // This is the key. We start by reading the first entry.
          zipFile.readEntry();

          // Now for every entry, we will write a file or dir
          // to disk. Then call zipFile.readEntry() again to
          // trigger the next cycle.
          zipFile.on('entry', (entry: yauzl.Entry) => {
            try {
              // Directories
              if (/\/$/.test(entry.fileName)) {
                // Create the directory then read the next entry.
                fs.promises.mkdir(path.join(destinationDir, entry.fileName), {
                  recursive: true,
                });
                zipFile.readEntry();
              }
              // Files
              else {
                // Write the file to disk.
                zipFile.openReadStream(
                  entry,
                  (readErr: Error | null, readStream: stream.Readable) => {
                    if (readErr) {
                      zipFile.close();
                      reject(readErr);
                      return;
                    }

                    const file = fs.createWriteStream(
                      path.join(destinationDir, entry.fileName),
                    );
                    readStream.pipe(file);
                    file.on('finish', () => {
                      // Wait until the file is finished writing, then read the next entry.
                      // @ts-ignore: Typing for close() is wrong.
                      file.close(() => {
                        zipFile.readEntry();
                      });

                      file.on('error', (err) => {
                        zipFile.close();
                        reject(err);
                      });
                    });
                  },
                );
              }
            } catch (e) {
              zipFile.close();
              reject(e);
            }
          });
          zipFile.on('end', (_err: Error | null) => {
            resolve(undefined);
          });
          zipFile.on('error', (err: Error | null) => {
            zipFile.close();
            reject(err as Error);
          });
        },
      );
    } catch (e) {
      reject(e);
    }
  });
}

function untar(
  zipPath: string,
  destinationDir: string,
  onLog?: (message: string) => void,
) {
  return new Promise((resolve, reject) => {
    const unzipProc = child_process.spawn(
      'tar',
      ['xvf', zipPath, '-C', destinationDir],
      { stdio: 'inherit' },
    );
    unzipProc.on('error', (err) => {
      reject(err);
    });
    unzipProc.on('close', (code) => {
      onLog?.(`tar xvf exited with ${code}`);
      if (code !== 0) {
        reject(new Error(`tar xvf exited with ${code}`));
        return;
      }

      resolve(undefined);
    });
  });
}

async function unzipRipgrep(
  zipPath: string,
  destinationDir: string,
  onLog?: (message: string) => void,
) {
  if (isWindows) await unzipWindows(zipPath, destinationDir, onLog);
  else await untar(zipPath, destinationDir, onLog);

  const expectedName = path.join(destinationDir, 'rg');
  if (await fsExists(expectedName)) return expectedName;

  if (await fsExists(`${expectedName}.exe`)) return `${expectedName}.exe`;

  throw new Error(
    `Expecting rg or rg.exe unzipped into ${destinationDir}, didn't find one.`,
  );
}

export type DownloadRipgrepOptions = {
  version: string;
  target: string;
  destDir: string;
  force?: boolean;
  token?: string;
  onLog?: (message: string) => void;
};

export async function downloadRipgrep(opts: DownloadRipgrepOptions) {
  const extension = isWindows ? '.zip' : '.tar.gz';
  const assetName =
    ['ripgrep', opts.version, opts.target].join('-') + extension;

  if (!(await fsExists(tmpDir))) {
    await fsMkdir(tmpDir);
  }

  const assetDownloadPath = path.join(tmpDir, assetName);
  try {
    await getAssetFromGithubApi(opts, assetName, tmpDir, opts.onLog);
  } catch (e) {
    opts.onLog?.('Deleting invalid download cache');
    try {
      await fsUnlink(assetDownloadPath);
    } catch (_e) {
      opts.onLog?.('Failed to delete invalid download cache');
    }

    throw e as Error;
  }

  opts.onLog?.(`Unzipping to ${opts.destDir}`);
  try {
    const destinationPath = await unzipRipgrep(
      assetDownloadPath,
      opts.destDir,
      opts.onLog,
    );
    if (!isWindows) {
      await util.promisify(fs.chmod)(destinationPath, '755');
    }
  } catch (e) {
    opts.onLog?.('Deleting invalid download');

    try {
      await fsUnlink(assetDownloadPath);
    } catch (_e) {
      opts.onLog?.('Failed to delete invalid download');
    }

    throw e as Error;
  }
}
