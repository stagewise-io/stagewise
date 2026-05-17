export type ShellType = 'bash' | 'zsh' | 'sh' | 'powershell';

export interface DetectedShell {
  type: ShellType;
  path: string;
}
