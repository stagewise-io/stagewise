import { describe, it, expect } from 'vitest';
import {
  getLanguageId,
  CLANGD_EXTENSIONS,
  RUST_EXTENSIONS,
} from './language-map';

describe('getLanguageId — C/C++/Rust', () => {
  it('maps .rs to rust', () => {
    expect(getLanguageId('src/main.rs')).toBe('rust');
  });

  it('maps C sources/headers to c', () => {
    expect(getLanguageId('a/b.c')).toBe('c');
    expect(getLanguageId('a/b.h')).toBe('c');
  });

  it('maps C++ sources/headers to cpp', () => {
    expect(getLanguageId('a/b.cpp')).toBe('cpp');
    expect(getLanguageId('a/b.cc')).toBe('cpp');
    expect(getLanguageId('a/b.cxx')).toBe('cpp');
    expect(getLanguageId('a/b.hpp')).toBe('cpp');
    expect(getLanguageId('a/b.hh')).toBe('cpp');
    expect(getLanguageId('a/b.hxx')).toBe('cpp');
  });

  it('still handles existing TS mappings', () => {
    expect(getLanguageId('a/b.tsx')).toBe('typescriptreact');
  });
});

describe('extension lists', () => {
  it('CLANGD_EXTENSIONS contains the expected C/C++ extensions', () => {
    for (const ext of ['.c', '.cc', '.cpp', '.cxx', '.h', '.hpp']) {
      expect(CLANGD_EXTENSIONS).toContain(ext);
    }
  });

  it('RUST_EXTENSIONS contains .rs', () => {
    expect(RUST_EXTENSIONS).toEqual(['.rs']);
  });
});
