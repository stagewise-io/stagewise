import * as vscode from 'vscode';

export class VScodeContext {
  private static instance: VScodeContext;
  private context: vscode.ExtensionContext | null = null;

  private constructor() {
    // Private constructor to enforce singleton pattern
  }

  public static getInstance(): VScodeContext {
    if (!VScodeContext.instance) {
      VScodeContext.instance = new VScodeContext();
    }
    return VScodeContext.instance;
  }

  public initialize(context: vscode.ExtensionContext) {
    this.context = context;
  }

  public getContext(): vscode.ExtensionContext | null {
    return this.context;
  }

  public isInitialized(): boolean {
    return this.context !== null;
  }

  public getExtensionMode(): vscode.ExtensionMode | undefined {
    return this.context?.extensionMode;
  }

  public isDevelopmentMode(): boolean {
    return this.context?.extensionMode === vscode.ExtensionMode.Development;
  }
}
