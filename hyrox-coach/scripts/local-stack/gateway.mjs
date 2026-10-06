// Minimal stand-in for Supabase's API gateway (Kong) used by the Docker-free
// local stack: routes /auth/v1/* to Supabase Auth and /rest/v1/* to PostgREST.
import http from "node:http";

const PORT = Number(process.env.GATEWAY_PORT ?? 54321);
const routes = [
  { prefix: "/auth/v1", target: { host: "127.0.0.1", port: Number(process.env.AUTH_PORT ?? 9999) } },
  { prefix: "/rest/v1", target: { host: "127.0.0.1", port: Number(process.env.REST_PORT ?? 3001) } },
];

const server = http.createServer((req, res) => {
  const route = routes.find((r) => req.url === r.prefix || req.url.startsWith(`${r.prefix}/`) || req.url.startsWith(`${r.prefix}?`));
  if (!route) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ message: "no route" }));
    return;
  }
  const path = req.url.slice(route.prefix.length) || "/";
  const upstream = http.request(
    {
      ...route.target,
      method: req.method,
      path: path.startsWith("/") ? path : `/${path}`,
      headers: { ...req.headers, host: `${route.target.host}:${route.target.port}` },
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    },
  );
  upstream.on("error", (err) => {
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ message: `upstream error: ${err.message}` }));
  });
  req.pipe(upstream);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`local supabase gateway listening on http://127.0.0.1:${PORT}`);
});
