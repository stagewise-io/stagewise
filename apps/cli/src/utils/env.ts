export const getEnvMode = (): 'dev' | 'prod' => {
  // When running with tsx (pnpm dev), the process will have tsx in the execArgv
  // or NODE_ENV will not be 'production'
  return process.env.NODE_ENV !== 'production' ? 'dev' : 'prod';
};
