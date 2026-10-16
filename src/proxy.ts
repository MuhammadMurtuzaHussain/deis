import { NextResponse, type NextRequest } from "next/server";

// Everywhere but the hosted demo: the desktop app, and `pnpm dev` or `pnpm start` from
// source. That server holds the user's keys and fetches what it's told, so a web page in
// their browser (DNS rebinding, a cross-site POST) or another machine on the network
// mustn't reach it. Only a loopback Host on this server's port, and the app's own
// origin, get through. Serving Deis to other people needs DEIS_HOSTED=1.

const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\]):(\d+)$/;

function loopback(host: string): boolean {
  const m = LOOPBACK.exec(host.toLowerCase());
  const port = process.env.PORT;
  return !!m && (!port || m[2] === port);
}

export function proxy(req: NextRequest) {
  if (process.env.DEIS_HOSTED === "1") return NextResponse.next();
  if (!loopback(req.headers.get("host") ?? "")) return new NextResponse("Not allowed", { status: 403 });
  const origin = req.headers.get("origin");
  if (origin && origin !== "deis://app" && !(origin.startsWith("http://") && loopback(origin.slice("http://".length)))) {
    return new NextResponse("Not allowed", { status: 403 });
  }
  return NextResponse.next();
}

export const config = { matcher: "/:path*" };
