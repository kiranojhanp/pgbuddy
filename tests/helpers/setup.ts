import { startPglite } from "../helpers/pglite";

const globals = globalThis as typeof globalThis & {
  startPglite?: typeof startPglite;
};

globals.startPglite = startPglite;

export {};
