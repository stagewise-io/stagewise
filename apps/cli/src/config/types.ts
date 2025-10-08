export interface CliArgs {
  port: number;
  appPort?: number;
  dir: string;
  silent: boolean;
  verbose: boolean;
  token?: string;
  bridgeMode: boolean;
}

export interface ConfigFile {
  port?: number;
  appPort?: number;
  appHttps?: boolean;
  autoPlugins?: boolean;
  plugins?: Array<string | { name: string; path?: string; url?: string }>;
  eddyMode?: string;
}

export interface Config {
  port: number;
  appPort: number;
  appHttps: boolean;
  dir: string;
  silent: boolean;
  verbose: boolean;
  token?: string;
  bridgeMode: boolean;
  autoPlugins: boolean;
  plugins: Array<string | { name: string; path?: string; url?: string }>;
  eddyMode?: string;
}
