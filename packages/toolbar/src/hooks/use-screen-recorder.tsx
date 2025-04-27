import { createContext, useContext } from "preact/compat";

interface ScreenRecorderContextType {
  isRecording: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
}

const ScreenRecorderContext = createContext<ScreenRecorderContextType>({
  isRecording: false,
  startRecording: async () => {},
  stopRecording: async () => {},
});

export function ScreenRecorderProvider({ children }: { children: any }) {
  return (
    <ScreenRecorderContext.Provider
      value={{
        isRecording: false,
        startRecording: async () => {},
        stopRecording: async () => {},
      }}
    >
      {children}
    </ScreenRecorderContext.Provider>
  );
}

export function useScreenRecorder() {
  return useContext(ScreenRecorderContext);
}
