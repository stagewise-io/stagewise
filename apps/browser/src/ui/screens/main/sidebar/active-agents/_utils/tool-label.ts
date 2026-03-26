const TOOL_LABELS: Record<string, string> = {
  'tool-multiEdit': 'Editing files',
  'tool-write': 'Writing file',
  'tool-read': 'Reading file',
  'tool-grepSearch': 'Searching code',
  'tool-glob': 'Finding files',
  'tool-copy': 'Copying file',
  'tool-delete': 'Deleting file',
  'tool-executeSandboxJs': 'Running script',
  'tool-readConsoleLogs': 'Reading console',
  'tool-getLintingDiagnostics': 'Checking lint',
  'tool-updateWorkspaceMd': 'Updating workspace',
  'tool-searchInLibraryDocs': 'Searching docs',
  'tool-listLibraryDocs': 'Looking up docs',
  'tool-askUserQuestions': 'Asking questions',
};

export function getToolActivityLabel(toolPartType: string): string {
  return TOOL_LABELS[toolPartType] ?? 'Working';
}
