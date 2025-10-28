import * as http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const HTTP_REQUEST_TIMEOUT_MS = 500;

/**
 * Check if a specific port has content available (HTTP server responding)
 */
export async function checkPortHasContent(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const options = {
      hostname: '127.0.0.1',
      port: port,
      path: '/',
      method: 'HEAD',
      timeout: HTTP_REQUEST_TIMEOUT_MS,
    };

    const req = http.request(options, () => {
      // Any response means the port has content
      resolve(true);
    });

    req.on('error', () => {
      // Error means no content or connection failed
      resolve(false);
    });

    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });

    req.end();
  });
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

interface PortInfo {
  protocol: 'TCP' | 'UDP';
  localAddress: string;
  localPort: number;
  state: string | null;
  listening: boolean;
}

/**
 * Get all child processes of a given PID
 * Platform-specific implementation
 */
async function getChildProcesses(pid: number): Promise<number[]> {
  try {
    const platform = process.platform;

    if (platform === 'win32') {
      // Windows: Use WMIC to get child processes
      try {
        const { stdout } = await execFileAsync(
          'wmic',
          ['process', 'where', `ParentProcessId=${pid}`, 'get', 'ProcessId'],
          { windowsHide: true },
        );

        const pids: number[] = [];
        const lines = stdout.split(/\r?\n/);

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed && trimmed !== 'ProcessId') {
            const childPid = Number.parseInt(trimmed, 10);
            if (!Number.isNaN(childPid) && childPid > 0) {
              pids.push(childPid);
            }
          }
        }

        return pids;
      } catch {
        // Fallback to PowerShell if WMIC fails
        try {
          const psCommand = `Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq ${pid} } | Select-Object -Property ProcessId`;

          const { stdout } = await execFileAsync(
            'powershell',
            ['-NoProfile', '-Command', psCommand],
            { windowsHide: true },
          );

          const pids: number[] = [];
          const lines = stdout.split(/\r?\n/);

          for (const line of lines) {
            const match = line.match(/\d+/);
            if (match) {
              const childPid = Number.parseInt(match[0], 10);
              if (!Number.isNaN(childPid) && childPid > 0) {
                pids.push(childPid);
              }
            }
          }

          return pids;
        } catch {
          return [];
        }
      }
    } else if (platform === 'darwin') {
      // macOS: Use BSD-style ps command
      const { stdout } = await execFileAsync('ps', ['-o', 'pid,ppid', '-A'], {
        maxBuffer: 10_000_000,
      });

      const pids: number[] = [];
      const lines = stdout.split('\n');

      // Skip header line
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;

        const trimmedLine = line.trim();
        if (!trimmedLine) continue;

        const parts = trimmedLine.split(/\s+/);
        if (parts.length >= 2) {
          const childPidStr = parts[0];
          const parentPidStr = parts[1];
          if (!childPidStr || !parentPidStr) continue;

          const parentPid = Number.parseInt(parentPidStr, 10);
          const childPid = Number.parseInt(childPidStr, 10);

          if (parentPid === pid && !Number.isNaN(childPid) && childPid > 0) {
            pids.push(childPid);
          }
        }
      }

      return pids;
    } else {
      // Linux: Use GNU-style ps command
      try {
        const { stdout } = await execFileAsync(
          'ps',
          ['-o', 'pid', '--ppid', String(pid), '--no-headers'],
          { maxBuffer: 10_000_000 },
        );

        const pids: number[] = [];
        const lines = stdout.split('\n');

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed) {
            const childPid = Number.parseInt(trimmed, 10);
            if (!Number.isNaN(childPid) && childPid > 0) {
              pids.push(childPid);
            }
          }
        }

        return pids;
      } catch {
        // Fallback to more universal format if GNU-style fails
        const { stdout } = await execFileAsync('ps', ['-o', 'pid,ppid', '-A'], {
          maxBuffer: 10_000_000,
        });

        const pids: number[] = [];
        const lines = stdout.split('\n');

        // Skip header line
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i];
          if (!line) continue;

          const trimmedLine = line.trim();
          if (!trimmedLine) continue;

          const parts = trimmedLine.split(/\s+/);
          if (parts.length >= 2) {
            const childPidStr = parts[0];
            const parentPidStr = parts[1];
            if (!childPidStr || !parentPidStr) continue;

            const parentPid = Number.parseInt(parentPidStr, 10);
            const childPid = Number.parseInt(childPidStr, 10);

            if (parentPid === pid && !Number.isNaN(childPid) && childPid > 0) {
              pids.push(childPid);
            }
          }
        }

        return pids;
      }
    }
  } catch {
    return [];
  }
}

/**
 * Recursively get all descendant processes (children, grandchildren, etc.)
 * @param pid - Parent process ID
 * @param visited - Set of already visited PIDs to avoid infinite loops
 */
async function getAllDescendantProcesses(
  pid: number,
  visited = new Set<number>(),
): Promise<number[]> {
  if (visited.has(pid)) {
    return [];
  }

  visited.add(pid);
  const children = await getChildProcesses(pid);
  const allDescendants = [...children];

  // Recursively get descendants of each child
  for (const childPid of children) {
    const descendants = await getAllDescendantProcesses(childPid, visited);
    allDescendants.push(...descendants);
  }

  return allDescendants;
}

/**
 * Get all ports that a specific process is listening on (including child processes)
 * Returns array of port numbers (only listening ports)
 * @param pid - Process ID to check
 * @param includeChildren - Whether to include child processes (default: true)
 */
export async function getProcessListeningPorts(
  pid: number,
  includeChildren = true,
): Promise<number[]> {
  try {
    // Get ports for the main process
    const portInfos = await getPortsByPid(pid);
    const mainPorts = portInfos
      .filter((p) => p.listening || p.state === 'LISTEN')
      .map((p) => p.localPort)
      .filter((port): port is number => port !== null && !Number.isNaN(port));

    const allPorts = new Set<number>(mainPorts);

    if (includeChildren) {
      // Get all child processes recursively
      const childPids = await getAllDescendantProcesses(pid);

      // Get ports for all child processes
      for (const childPid of childPids) {
        try {
          const childPortInfos = await getPortsByPid(childPid);
          const childPorts = childPortInfos
            .filter((p) => p.listening || p.state === 'LISTEN')
            .map((p) => p.localPort)
            .filter(
              (port): port is number => port !== null && !Number.isNaN(port),
            );

          for (const port of childPorts) {
            allPorts.add(port);
          }
        } catch {
          // Continue if we can't get ports for a specific child process
        }
      }
    }

    return Array.from(allPorts).sort((a, b) => a - b);
  } catch (_error) {
    return [];
  }
}

/**
 * Debug helper: Get detailed information about process and its ports
 */
export async function debugProcessPorts(pid: number): Promise<{
  mainProcess: { pid: number; ports: PortInfo[] };
  children: Array<{ pid: number; ports: PortInfo[] }>;
  allListeningPorts: number[];
}> {
  const mainPorts = await getPortsByPid(pid);
  const childPids = await getAllDescendantProcesses(pid);

  const children = [];
  for (const childPid of childPids) {
    try {
      const childPorts = await getPortsByPid(childPid);
      children.push({ pid: childPid, ports: childPorts });
    } catch {
      children.push({ pid: childPid, ports: [] });
    }
  }

  const allListeningPorts = await getProcessListeningPorts(pid);

  return {
    mainProcess: { pid, ports: mainPorts },
    children,
    allListeningPorts,
  };
}

/**
 * Get detailed port information for a process
 * Cross-platform implementation with proper error handling
 */
async function getPortsByPid(pid: number): Promise<PortInfo[]> {
  const platform = process.platform;

  if (platform === 'win32') {
    // Windows: Try PowerShell first (more reliable, doesn't need elevation for most cases)
    try {
      const psCommand = `
        Get-NetTCPConnection -ErrorAction SilentlyContinue | Where-Object { $_.OwningProcess -eq ${pid} } | Select-Object -Property LocalAddress,LocalPort,State;
        Get-NetUDPEndpoint -ErrorAction SilentlyContinue | Where-Object { $_.OwningProcess -eq ${pid} } | Select-Object -Property LocalAddress,LocalPort
      `.trim();

      const { stdout } = await execFileAsync(
        'powershell',
        ['-NoProfile', '-Command', psCommand],
        { windowsHide: true, maxBuffer: 10_000_000 },
      );

      return parsePowerShellOutput(stdout);
    } catch {
      // Fallback to netstat for older systems
      try {
        const { stdout } = await execFileAsync('netstat', ['-ano']);
        return parseNetstatWindows(stdout, pid);
      } catch {
        return [];
      }
    }
  } else {
    // Unix systems: use lsof
    try {
      // -n: no DNS resolution (faster)
      // -P: show port numbers, not service names
      // -i: network connections only
      // -a: AND condition
      // -p: specific process
      const { stdout } = await execFileAsync('lsof', [
        '-nP',
        '-i',
        '-a',
        '-p',
        String(pid),
      ]);

      return parseLsofOutput(stdout);
    } catch {
      // If lsof fails or doesn't exist, return empty
      return [];
    }
  }
}

/**
 * Parse PowerShell Get-NetTCPConnection/Get-NetUDPEndpoint output
 */
function parsePowerShellOutput(text: string): PortInfo[] {
  const results: PortInfo[] = [];
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  let inTCP = true; // We start with TCP results

  for (const line of lines) {
    // Skip headers and separators
    if (line.includes('LocalAddress') || line.includes('---')) continue;

    // PowerShell output is whitespace-separated
    const parts = line.split(/\s+/);
    if (parts.length < 2) continue;

    // Detect if we're in UDP section (UDP doesn't have State column)
    if (parts.length === 2 || !parts[2]) {
      inTCP = false;
    }

    const [address, portStr, state] = parts;
    const port = Number.parseInt(portStr || '', 10);

    if (Number.isNaN(port)) continue;

    results.push({
      protocol: inTCP ? 'TCP' : 'UDP',
      localAddress: address || '0.0.0.0',
      localPort: port,
      state: state || (inTCP ? null : 'UNSPEC'),
      listening: state === 'Listen' || state === 'LISTEN',
    });
  }

  return dedupePortInfo(results);
}

/**
 * Parse netstat -ano output (Windows fallback)
 */
function parseNetstatWindows(text: string, pid: number): PortInfo[] {
  const results: PortInfo[] = [];
  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 4) continue;

    const [proto, localAddr, , stateOrPid, pidOrEmpty] = parts;

    // Check if this line belongs to our PID
    const linePid = Number.parseInt(pidOrEmpty || stateOrPid || '', 10);
    if (linePid !== pid) continue;

    // Parse protocol
    if (!proto || (!proto.startsWith('TCP') && !proto.startsWith('UDP')))
      continue;

    // Parse local address and port
    if (!localAddr) continue;
    const lastColon = localAddr.lastIndexOf(':');
    if (lastColon === -1) continue;

    const address = localAddr.substring(0, lastColon);
    const port = Number.parseInt(localAddr.substring(lastColon + 1), 10);

    if (Number.isNaN(port)) continue;

    // For TCP, stateOrPid is the state; for UDP, it's the PID
    const state = proto.startsWith('TCP') ? stateOrPid || null : 'UNSPEC';

    results.push({
      protocol: proto.startsWith('TCP') ? 'TCP' : 'UDP',
      localAddress: address,
      localPort: port,
      state,
      listening: state === 'LISTENING' || state === 'LISTEN',
    });
  }

  return dedupePortInfo(results);
}

/**
 * Parse lsof output (Unix/Linux/macOS)
 */
function parseLsofOutput(text: string): PortInfo[] {
  const results: PortInfo[] = [];
  const lines = text.split('\n');

  for (const line of lines) {
    // Skip header line
    if (line.startsWith('COMMAND')) continue;
    if (!line.trim()) continue;

    // Check if it's TCP or UDP
    const isTCP = line.includes(' TCP ');
    const isUDP = line.includes(' UDP ');

    if (!isTCP && !isUDP) continue;

    // Extract state for TCP connections (in parentheses)
    const stateMatch = line.match(
      /\((LISTEN|ESTABLISHED|CLOSE_WAIT|TIME_WAIT|CLOSED|FIN_WAIT.*|SYN_.*)\)/,
    );

    // Extract the network endpoint
    // Format can be like: TCP 127.0.0.1:3000 (LISTEN)
    //                 or: TCP *:3000 (LISTEN)
    //                 or: TCP 127.0.0.1:3000->127.0.0.1:54321 (ESTABLISHED)
    const protocol = isTCP ? 'TCP' : 'UDP';

    // Look for the local address:port pattern
    const addressPattern =
      protocol === 'TCP'
        ? /TCP\s+([^:\s]+|\*):(\d+)/
        : /UDP\s+([^:\s]+|\*):(\d+)/;

    const addressMatch = line.match(addressPattern);

    if (!addressMatch) continue;

    const [, host, portStr] = addressMatch;
    const port = Number.parseInt(portStr || '', 10);

    if (Number.isNaN(port)) continue;

    // Convert * to 0.0.0.0
    const address = host === '*' ? '0.0.0.0' : host;
    const state = stateMatch?.[1] || (protocol === 'UDP' ? 'UNSPEC' : null);

    results.push({
      protocol,
      localAddress: address || '0.0.0.0',
      localPort: port,
      state,
      listening: state === 'LISTEN',
    });
  }

  return dedupePortInfo(results);
}

/**
 * Remove duplicate port entries
 */
function dedupePortInfo(ports: PortInfo[]): PortInfo[] {
  const seen = new Set<string>();
  return ports.filter((p) => {
    const key = `${p.protocol}|${p.localAddress}|${p.localPort}|${p.state}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
