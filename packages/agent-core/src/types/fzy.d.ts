declare module 'fzy.js' {
  export const SCORE_MIN: number;
  export const SCORE_MAX: number;
  export function score(needle: string, haystack: string): number;
  export function positions(needle: string, haystack: string): number[];
  export function hasMatch(needle: string, haystack: string): boolean;
}
