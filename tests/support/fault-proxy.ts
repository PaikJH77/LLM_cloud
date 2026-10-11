import { createServer } from "node:http";
export async function faultProxy(target: string) {
  let fault: "none" | "before" | "after" = "none";
  const server = createServer(async (req, res) => {
    const mode = fault;
    if (req.method === "POST") fault = "none";
    if (mode === "before" && req.method === "POST") {
      req.socket.destroy();
      return;
    }
    try {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(Buffer.from(c));
      const response = await fetch(target + (req.url ?? "/"), {
        method: req.method,
        headers: {
          authorization: req.headers.authorization ?? "",
          "content-type": "application/json",
        },
        body: req.method === "POST" ? Buffer.concat(chunks) : undefined,
      });
      const body = await response.text();
      if (mode === "after" && req.method === "POST") {
        req.socket.destroy();
        return;
      }
      res.writeHead(response.status, { "content-type": "application/json" });
      res.end(body);
    } catch {
      res.writeHead(502);
      res.end("{}");
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("proxy bind");
  return {
    url: "http://127.0.0.1:" + address.port,
    setFault: (mode: typeof fault) => (fault = mode),
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((e) => (e ? reject(e) : resolve())),
      ),
  };
}
