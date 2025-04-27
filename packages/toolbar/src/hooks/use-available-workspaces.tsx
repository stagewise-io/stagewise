import { createContext, useContext } from "preact/compat";

interface Workspace {
  id: string;
  name: string;
}

interface WorkspacesContextType {
  workspaces: Workspace[];
  isLoading: boolean;
  error: Error | null;
}

const WorkspacesContext = createContext<WorkspacesContextType>({
  workspaces: [],
  isLoading: false,
  error: null,
});

export function AvailableWorkspacesProvider({ children }: { children: any }) {
  return (
    <WorkspacesContext.Provider
      value={{ workspaces: [], isLoading: false, error: null }}
    >
      {children}
    </WorkspacesContext.Provider>
  );
}

export function useAvailableWorkspaces() {
  return useContext(WorkspacesContext);
}
