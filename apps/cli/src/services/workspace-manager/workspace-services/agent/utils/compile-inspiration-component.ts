import type { InspirationComponent } from '@stagewise/agent-tools';
import * as esbuild from 'esbuild';
import type { Logger } from '../../../../logger';

export async function compileInspirationComponent(
  component: Omit<InspirationComponent, 'compiledCode'>,
  logger: Logger,
) {
  try {
    const compiled = await esbuild.transform(component.reactCode, {
      loader: 'tsx',
      format: 'esm',
      target: 'es2020',
    });
    return {
      ...component,
      compiledCode: compiled.code,
    };
  } catch (error) {
    logger.error('Failed to compile inspiration component', error);
    throw error;
  }
}
