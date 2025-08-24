import type { ClassValue } from 'class-variance-authority/types';
import { twMerge } from 'tailwind-merge';
import { clsx } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
