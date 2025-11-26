declare module 'nitropack' {
  interface NitroRouteConfig {
    appMiddleware?: string | string[] | Record<string, boolean>
  }
}
export {}