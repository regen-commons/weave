import { createServer } from "node:http";
import { createVercelBridge } from "./src/certified-vercel.ts";

const server = createServer({ headersTimeout: 10_000, requestTimeout: 15_000 }, createVercelBridge(process.env));
server.listen(Number(process.env.PORT ?? "3000"));
