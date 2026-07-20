import * as http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const SNAPSHOT_TIMEOUT_MS = 3_000;

const HTTP_REQUEST_TIMEOUT_MS = 500;

/**
 * Check if a specific port has content available (HTTP server responding).
 * Tries IPv4 (127.0.0.1) first, then falls back to IPv6 (::1) since some
 * dev servers (e.g. Vite) only listen on the IPv6 loopback.
 */
export async function checkPortHasContent(port: number): Promise<boolean> {
  const tryHost = (hostname: string): Promise<boolean> =>
    new Promise((resolve) => {
      const req = http.request(
        {
          hostname,
          port,
          path: '/',
          method: 'HEAD',
          timeout: HTTP_REQUEST_TIMEOUT_MS,
        },
        () => resolve(true),
      );
      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
      req.end();
    });

  if (await tryHost('127.0.0.1')) return true;
  return tryHost('::1');
}

/**
 * Check if a process (by PID) is using a specific port
 * Platform-specific implementation
 */
export async function checkProcessOwnsPort(
  pid: number,
  port: number,
): Promise<boolean> {
  const ports = await getProcessListeningPorts(pid);
  return ports.includes(port);
}

export type ProcessListeningEndpoint = {
  host: string;
  port: number;
};

export type ProcessSnapshotEntry = {
  pid: number;
  parentPid: number;
  state: string;
  command: string;
};

export type ProcessTreeSnapshot = {
  command: string | null;
  endpoints: ProcessListeningEndpoint[];
};

export function normalizeListeningHost(host: string): string {
  const normalized = host.replace(/^\[|\]$/g, '');
  return normalized === '*' ||
    normalized === '0.0.0.0' ||
    normalized === '::' ||
    normalized === '::0' ||
    normalized === '127.0.0.1' ||
    normalized === '::1'
    ? 'localhost'
    : normalized;
}

function parseEndpoint(value: string): ProcessListeningEndpoint | null {
  const localAddress = value.split('->')[0]?.replace(/\s+\(LISTEN\)$/, '');
  if (!localAddress) return null;

  const bracketed = /^\[([^\]]+)\]:(\d+)$/.exec(localAddress);
  const separator = localAddress.lastIndexOf(':');
  const host = bracketed?.[1] ?? localAddress.slice(0, separator);
  const port = Number.parseInt(
    bracketed?.[2] ?? localAddress.slice(separator + 1),
    10,
  );
  if (!host || separator < 0 || Number.isNaN(port)) return null;
  return { host: normalizeListeningHost(host), port };
}

function addEndpoint(
  endpointsByPid: Map<number, ProcessListeningEndpoint[]>,
  pid: number,
  endpoint: ProcessListeningEndpoint,
): void {
  const endpoints = endpointsByPid.get(pid) ?? [];
  if (
    !endpoints.some(
      (entry) => entry.host === endpoint.host && entry.port === endpoint.port,
    )
  ) {
    endpoints.push(endpoint);
    endpointsByPid.set(pid, endpoints);
  }
}

export function parseLsofListeningSnapshot(
  output: string,
): Map<number, ProcessListeningEndpoint[]> {
  const endpointsByPid = new Map<number, ProcessListeningEndpoint[]>();
  let pid: number | null = null;

  for (const line of output.split(/\r?\n/)) {
    if (line.startsWith('p')) {
      const parsedPid = Number.parseInt(line.slice(1), 10);
      pid = Number.isNaN(parsedPid) ? null : parsedPid;
    } else if (pid !== null && line.startsWith('n')) {
      const endpoint = parseEndpoint(line.slice(1));
      if (endpoint) addEndpoint(endpointsByPid, pid, endpoint);
    }
  }

  return endpointsByPid;
}

export function parseUnixProcessSnapshot(
  output: string,
): ProcessSnapshotEntry[] {
  return output
    .split(/\r?\n/)
    .map((line): ProcessSnapshotEntry | null => {
      const match = /^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.+?)\s*$/.exec(line);
      if (!match) return null;
      return {
        pid: Number.parseInt(match[1]!, 10),
        parentPid: Number.parseInt(match[2]!, 10),
        state: match[3]!,
        command: match[4]!,
      };
    })
    .filter((entry): entry is ProcessSnapshotEntry => entry !== null);
}

function parseJsonRows<T>(output: string): T[] {
  const trimmed = output.replace(/^\uFEFF/, '').trim();
  if (!trimmed) return [];
  const parsed: T | T[] | null = JSON.parse(trimmed);
  if (parsed === null) return [];
  return Array.isArray(parsed) ? parsed : [parsed];
}

export function parseWindowsProcessSnapshot(
  output: string,
): ProcessSnapshotEntry[] {
  type WindowsProcess = {
    ProcessId: number;
    ParentProcessId: number;
    Name: string | null;
    CommandLine: string | null;
  };
  return parseJsonRows<WindowsProcess>(output).map((entry) => ({
    pid: entry.ProcessId,
    parentPid: entry.ParentProcessId,
    state: '',
    command: entry.CommandLine?.trim() || entry.Name || '',
  }));
}

async function readProcessSnapshot(): Promise<ProcessSnapshotEntry[]> {
  try {
    if (process.platform === 'win32') {
      const command =
        'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress';
      const { stdout } = await execFileAsync(
        'powershell',
        ['-NoProfile', '-Command', command],
        {
          windowsHide: true,
          maxBuffer: 10_000_000,
          timeout: SNAPSHOT_TIMEOUT_MS,
        },
      );
      return parseWindowsProcessSnapshot(stdout);
    }

    const { stdout } = await execFileAsync(
      'ps',
      ['-ww', '-axo', 'pid=,ppid=,stat=,command='],
      { maxBuffer: 10_000_000, timeout: SNAPSHOT_TIMEOUT_MS },
    );
    return parseUnixProcessSnapshot(stdout);
  } catch {
    return [];
  }
}

function parseWindowsNetstatSnapshot(
  output: string,
): Map<number, ProcessListeningEndpoint[]> {
  const endpointsByPid = new Map<number, ProcessListeningEndpoint[]>();
  for (const line of output.split(/\r?\n/)) {
    const [protocol, localAddress, , state, pidValue] = line
      .trim()
      .split(/\s+/);
    if (protocol !== 'TCP' || state !== 'LISTENING' || !localAddress) continue;
    const pid = Number.parseInt(pidValue ?? '', 10);
    const endpoint = parseEndpoint(localAddress);
    if (!Number.isNaN(pid) && endpoint)
      addEndpoint(endpointsByPid, pid, endpoint);
  }
  return endpointsByPid;
}

export function parseWindowsListeningSnapshot(
  output: string,
  pids?: ReadonlySet<number>,
): Map<number, ProcessListeningEndpoint[]> {
  type WindowsConnection = {
    LocalAddress: string;
    LocalPort: number;
    OwningProcess: number;
  };
  const endpointsByPid = new Map<number, ProcessListeningEndpoint[]>();
  for (const entry of parseJsonRows<WindowsConnection>(output)) {
    if (pids && !pids.has(entry.OwningProcess)) continue;
    addEndpoint(endpointsByPid, entry.OwningProcess, {
      host: normalizeListeningHost(entry.LocalAddress),
      port: entry.LocalPort,
    });
  }
  return endpointsByPid;
}

async function readListeningSnapshot(
  pids?: ReadonlySet<number>,
): Promise<Map<number, ProcessListeningEndpoint[]>> {
  if (pids?.size === 0) return new Map();

  if (process.platform === 'win32') {
    try {
      const command =
        'Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Select-Object LocalAddress,LocalPort,OwningProcess | ConvertTo-Json -Compress';
      const { stdout } = await execFileAsync(
        'powershell',
        ['-NoProfile', '-Command', command],
        {
          windowsHide: true,
          maxBuffer: 10_000_000,
          timeout: SNAPSHOT_TIMEOUT_MS,
        },
      );
      return parseWindowsListeningSnapshot(stdout, pids);
    } catch {
      try {
        const { stdout } = await execFileAsync('netstat', ['-ano'], {
          timeout: SNAPSHOT_TIMEOUT_MS,
        });
        const snapshot = parseWindowsNetstatSnapshot(stdout);
        if (!pids) return snapshot;
        return new Map([...snapshot].filter(([pid]) => pids.has(pid)));
      } catch {
        return new Map();
      }
    }
  }

  try {
    const { stdout } = await execFileAsync(
      'lsof',
      ['-nP', '-iTCP', '-sTCP:LISTEN', '-Fpn'],
      {
        maxBuffer: 10_000_000,
        timeout: SNAPSHOT_TIMEOUT_MS,
      },
    );
    const snapshot = parseLsofListeningSnapshot(stdout);
    if (!pids) return snapshot;
    return new Map([...snapshot].filter(([pid]) => pids.has(pid)));
  } catch {
    return new Map();
  }
}

export function buildProcessTreeSnapshots(
  rootPids: number[],
  processes: ProcessSnapshotEntry[],
  endpointsByPid: ReadonlyMap<number, ProcessListeningEndpoint[]>,
): Map<number, ProcessTreeSnapshot> {
  const childrenByParentPid = groupProcessesByParent(processes);
  const snapshots = new Map<number, ProcessTreeSnapshot>();

  for (const rootPid of rootPids) {
    const processPids = collectProcessTreePids(rootPid, childrenByParentPid);
    const endpoints = new Map<string, ProcessListeningEndpoint>();
    for (const pid of processPids) {
      for (const endpoint of endpointsByPid.get(pid) ?? []) {
        endpoints.set(`${endpoint.host}:${endpoint.port}`, endpoint);
      }
    }
    const command = (childrenByParentPid.get(rootPid) ?? [])
      .filter((child) => !child.state.includes('Z'))
      .sort((a, b) => b.pid - a.pid)[0]?.command;
    snapshots.set(rootPid, {
      command: command || null,
      endpoints: [...endpoints.values()].sort(
        (a, b) => a.port - b.port || a.host.localeCompare(b.host),
      ),
    });
  }
  return snapshots;
}

function groupProcessesByParent(
  processes: ProcessSnapshotEntry[],
): Map<number, ProcessSnapshotEntry[]> {
  const childrenByParentPid = new Map<number, ProcessSnapshotEntry[]>();
  for (const processEntry of processes) {
    const children = childrenByParentPid.get(processEntry.parentPid) ?? [];
    children.push(processEntry);
    childrenByParentPid.set(processEntry.parentPid, children);
  }
  return childrenByParentPid;
}

function collectProcessTreePids(
  rootPid: number,
  childrenByParentPid: ReadonlyMap<number, ProcessSnapshotEntry[]>,
): number[] {
  const processPids = [rootPid];
  const visited = new Set(processPids);
  for (let index = 0; index < processPids.length; index++) {
    for (const child of childrenByParentPid.get(processPids[index]!) ?? []) {
      if (visited.has(child.pid)) continue;
      visited.add(child.pid);
      processPids.push(child.pid);
    }
  }
  return processPids;
}

export async function getProcessTreeSnapshots(
  rootPids: number[],
): Promise<Map<number, ProcessTreeSnapshot>> {
  const uniqueRootPids = [...new Set(rootPids)];
  if (uniqueRootPids.length === 0) return new Map();

  const processes = await readProcessSnapshot();
  const childrenByParentPid = groupProcessesByParent(processes);
  const relevantPids = new Set(uniqueRootPids);
  for (const rootPid of uniqueRootPids) {
    for (const pid of collectProcessTreePids(rootPid, childrenByParentPid))
      relevantPids.add(pid);
  }
  const endpointsByPid = await readListeningSnapshot(relevantPids);
  return buildProcessTreeSnapshots(uniqueRootPids, processes, endpointsByPid);
}

export async function getProcessListeningEndpoints(
  pid: number,
  includeChildren = true,
): Promise<ProcessListeningEndpoint[]> {
  if (includeChildren) {
    return (await getProcessTreeSnapshots([pid])).get(pid)?.endpoints ?? [];
  }
  return (await readListeningSnapshot(new Set([pid]))).get(pid) ?? [];
}

export async function getProcessListeningPorts(
  pid: number,
  includeChildren = true,
): Promise<number[]> {
  const endpoints = await getProcessListeningEndpoints(pid, includeChildren);
  return [...new Set(endpoints.map((endpoint) => endpoint.port))];
}

/**
 * Get all system-wide listening TCP ports (no PID filter).
 * Returns a sorted array of unique port numbers.
 */
export async function getAllListeningPorts(): Promise<number[]> {
  const snapshot = await readListeningSnapshot();
  return [
    ...new Set(
      [...snapshot.values()].flatMap((endpoints) =>
        endpoints.map((e) => e.port),
      ),
    ),
  ].sort((a, b) => a - b);
}

/**
 * Get all processes using a specific port
 * Returns array of PIDs
 */
export async function getProcessesUsingPort(port: number): Promise<number[]> {
  try {
    const platform = process.platform;
    const pids: number[] = [];

    if (platform === 'darwin' || platform === 'linux') {
      // Unix-based systems: use lsof
      const { stdout } = await execFileAsync('lsof', [
        '-n',
        '-P',
        '-i',
        `:${port}`,
        '-t',
      ]);

      if (stdout.trim()) {
        const pidStrings = stdout.trim().split('\n');
        for (const pidStr of pidStrings) {
          const pid = Number.parseInt(pidStr, 10);
          if (!Number.isNaN(pid)) {
            pids.push(pid);
          }
        }
      }
    } else if (platform === 'win32') {
      // Windows: use PowerShell
      try {
        const psCommand = `
          Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -Property OwningProcess;
          Get-NetUDPEndpoint -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -Property OwningProcess
        `.trim();

        const { stdout } = await execFileAsync(
          'powershell',
          ['-NoProfile', '-Command', psCommand],
          { windowsHide: true },
        );

        const lines = stdout.split(/\r?\n/);
        const pidSet = new Set<number>();

        for (const line of lines) {
          const match = line.match(/\d+/);
          if (match) {
            const pid = Number.parseInt(match[0], 10);
            if (!Number.isNaN(pid) && pid > 0) {
              pidSet.add(pid);
            }
          }
        }

        pids.push(...Array.from(pidSet));
      } catch {
        // Fallback to netstat
        const { stdout } = await execFileAsync('netstat', ['-ano']);
        const lines = stdout.split(/\r?\n/);
        const pidSet = new Set<number>();

        for (const line of lines) {
          if (line.includes(`:${port} `)) {
            const parts = line.trim().split(/\s+/);
            const pidStr = parts[parts.length - 1];
            const pid = Number.parseInt(pidStr || '', 10);
            if (!Number.isNaN(pid) && pid > 0) {
              pidSet.add(pid);
            }
          }
        }

        pids.push(...Array.from(pidSet));
      }
    }

    return pids;
  } catch {
    return [];
  }
}
