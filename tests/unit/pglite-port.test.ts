import type net from "net";
import { getAvailablePort } from "../helpers/pglite";

type FakeServer = {
  unref: () => void;
  on: (event: "error", handler: (error: Error) => void) => void;
  listen: (port: number, host: string, cb: () => void) => void;
  address: () => net.AddressInfo | string | null;
  close: (cb: (error?: Error | null) => void) => void;
};

const createServerFactory = (options: {
  address: net.AddressInfo | string | null;
  closeError?: Error | null;
  listenError?: Error | null;
}): (() => FakeServer) => {
  return () => {
    let errorHandler: ((error: Error) => void) | null = null;

    return {
      unref: () => {},
      on: (_event, handler) => {
        errorHandler = handler;
      },
      listen: (_port, _host, cb) => {
        if (options.listenError && errorHandler) {
          errorHandler(options.listenError);
          return;
        }
        cb();
      },
      address: () => options.address,
      close: (cb) => cb(options.closeError ?? null),
    };
  };
};

describe("getAvailablePort", () => {
  test("rejects when server emits error", async () => {
    const error = new Error("listen failed");
    const factory = createServerFactory({ address: null, listenError: error });

    await expect(getAvailablePort(factory)).rejects.toThrow("listen failed");
  });

  test("rejects when address is invalid", async () => {
    const factory = createServerFactory({ address: "pipe" });

    await expect(getAvailablePort(factory)).rejects.toThrow("Unable to acquire port");
  });

  test("rejects when close returns error", async () => {
    const error = new Error("close failed");
    const factory = createServerFactory({
      address: { port: 123 } as net.AddressInfo,
      closeError: error,
    });

    await expect(getAvailablePort(factory)).rejects.toThrow("close failed");
  });

  test("resolves with port when server closes cleanly", async () => {
    const factory = createServerFactory({ address: { port: 456 } as net.AddressInfo });

    await expect(getAvailablePort(factory)).resolves.toBe(456);
  });
});
