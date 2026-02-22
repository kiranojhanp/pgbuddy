import net from "node:net";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import postgres from "postgres";

type ServerLike = {
  unref: () => void;
  on: (event: "error", handler: (error: Error) => void) => void;
  listen: (port: number, host: string, cb: () => void) => void;
  address: () => net.AddressInfo | string | null;
  close: (cb: (error?: Error | null) => void) => void;
};

export const getAvailablePort = async (
  createServer: () => ServerLike = net.createServer
): Promise<number> =>
  new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Unable to acquire port")));
        return;
      }
      const { port } = address;
      server.close((closeError) => {
        if (closeError) {
          reject(closeError);
          return;
        }
        resolve(port);
      });
    });
  });

export const startPglite = async () => {
  const db = await PGlite.create();
  const port = await getAvailablePort();
  const server = new PGLiteSocketServer({
    db,
    port,
    host: "127.0.0.1",
  });

  await server.start();

  const sql = postgres({
    host: "127.0.0.1",
    port,
    database: "template1",
    max: 1,
    onnotice: () => {},
  });

  const stop = async () => {
    await sql.end({ timeout: 5 });
    await server.stop();
    await db.close();
  };

  return { sql, stop };
};
