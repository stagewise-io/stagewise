export type DependencyName = string;
export type DependencyVersion = string;

export interface Dependencies {
  [key: DependencyName]: DependencyVersion;
}
