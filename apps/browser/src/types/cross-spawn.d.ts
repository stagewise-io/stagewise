declare module 'cross-spawn' {
  import type { spawn } from 'node:child_process';

  const crossSpawn: typeof spawn;
  export default crossSpawn;
}
