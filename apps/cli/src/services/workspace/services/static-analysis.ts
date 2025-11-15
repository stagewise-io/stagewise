import type { Logger } from '@/services/logger';
import {
  discoverDependencies,
  type DependencyMap,
} from '@/utils/dependency-parser';
import { countLinesOfCode } from '@/utils/count-lines-of-code';

const AnalyzedFileEndings = [
  'ts',
  'tsx',
  'js',
  'jsx',
  'html',
  'css',
  'scss',
  'sass',
  'less',
  'styl',
  'php',
  'py',
];

/**
 * The purpose of this class is to perform a basic static analysis of the workspace
 * and provide other services with information about this workspace.
 *
 * The analysis isn't cached and happens synchronously on initialization, but can also be re-triggered throug the interface.
 */
export class StaticAnalysisService {
  private logger: Logger;
  private workspacePath: string;
  private _nodeDependencies: DependencyMap = {};
  private _linesOfCodeCounts: Record<string, number> = {}; // key is the file ending, value is the number of lines of code

  private analysisRunning = false;

  private constructor(logger: Logger, workspacePath: string) {
    this.logger = logger;
    this.workspacePath = workspacePath;
  }

  static async create(logger: Logger, workspacePath: string) {
    const service = new StaticAnalysisService(logger, workspacePath);
    await service.analyze();
    return service;
  }

  async analyze() {
    // Don't trigger another analysis if we already have the data.
    this.logger.debug('[StaticAnalysisService] Starting analysis...');
    if (this.analysisRunning) {
      this.logger.debug('[StaticAnalysisService] Analysis already running');
      return;
    }
    this.analysisRunning = true;
    this._nodeDependencies = await discoverDependencies(
      this.workspacePath,
      this.logger,
    );
    for (const fileEnding of AnalyzedFileEndings) {
      this._linesOfCodeCounts[fileEnding] = await countLinesOfCode(
        this.workspacePath,
        fileEnding,
      );
    }

    this.analysisRunning = false;

    this.logger.debug('[StaticAnalysisService] Analysis complete');
    this.logger.debug(
      `[StaticAnalysisService] Counted node dependencies: ${Object.keys(this._nodeDependencies).length}`,
    );
    this.logger.debug(
      `[StaticAnalysisService] Lines of code counts: ${JSON.stringify(this._linesOfCodeCounts, null, 2)}`,
    );
  }

  async teardown() {
    this.analysisRunning = false;
    this._nodeDependencies = {};
  }

  get nodeDependencies(): DependencyMap {
    return this._nodeDependencies;
  }

  get linesOfCodeCounts(): Record<string, number> {
    return this._linesOfCodeCounts;
  }
}
