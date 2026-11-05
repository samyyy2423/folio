// Types for foliolang: Folio from JavaScript.

/** A mistake in a Folio program: where it is, and what's wrong. */
export class FolioError extends Error {
  line: number;
  col: number;
  file?: string;
  reason: string;
  /** what `fail with` gave, if the program failed with a value of its own */
  value?: unknown;
}

export interface Options {
  /** the program's arguments, as `arguments` has them */
  args?: string[];
  /** answers for `ask`: a list, taken in turn, or a function given the question */
  input?: string[] | ((question: string) => string | null);
  /** files `use` finds, by name: { "shapes.folio": "to area with ..." }, or a function */
  files?: Record<string, string> | ((name: string) => string | undefined);
  /** the folder `use` finds files in, after `files` and before the standard library */
  folder?: string;
  /** whether `read` and `write` may touch files: true for the folder (or the current one), or a folder */
  disk?: boolean | string;
  /** the engine: "jit" (Folio compiled to JavaScript, the default), "wasm" or "vm" */
  engine?: "jit" | "wasm" | "vm";
  /** how many steps the program may take before it's stopped */
  maxSteps?: number;
  /** each line the program says, as it says it */
  print?: (line: string) => void;
  /** each line it says to the error output */
  printError?: (line: string) => void;
  /** the number it ends with, when it says `stop the program with` */
  exit?: (code: number) => void;
  /** a number from 0 to 1, for `random number from` */
  random?: () => number;
}

/** Runs a Folio program: what it said, a line each. A mistake is thrown as a FolioError. */
export function run(source: string, options?: Options): string[];

/** Runs a Folio program and gives back what its top level made, by name: its functions as JavaScript ones. */
export function load(source: string, options?: Options): Record<string, any>;

/** run() for a file, whose `use` finds the files beside it */
export function runFile(path: string, options?: Options): string[];

/** load() for a file, whose `use` finds the files beside it */
export function loadFile(path: string, options?: Options): Record<string, any>;

export interface Problem {
  line: number;
  col: number;
  kind: "error" | "fails" | "doesn't fit" | "unused" | string;
  message: string;
  file?: string;
}

/** the problems folio check finds, without running the program */
export function check(source: string, options?: Options): Problem[];

/** the code written the one way Folio writes it, as folio tidy does */
export function format(source: string): string;

export interface TestResult {
  name: string | null;
  said: string[];
  error?: FolioError;
}

/** each test_ function, in a run of its own */
export function test(source: string, options?: Options): TestResult[];

/** a standard library file's text, by its name ("json.folio"), or undefined */
export function library(name: string): string | undefined;

/** foliolang's version: Folio's release */
export const version: string;
