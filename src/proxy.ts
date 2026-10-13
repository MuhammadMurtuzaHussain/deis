import { NextResponse, type NextRequest } from "next/server";

// Desktop app only. The server listens on 127.0.0.1, but a web page in the user's
// browser could still reach it through DNS rebinding or a cross-site POST. Only the
// app's own host and origin get through.
export function proxy(req: NextRequest) {
  if (process.env.DEIS_DESKTOP !== "1") return NextResponse.next();
  const port = process.env.PORT ?? "";
  const host = req.headers.get("host") ?? "";
  if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return new NextResponse("Not allowed", { status: 403 });
  const origin = req.headers.get("origin");
  if (origin && origin !== "deis://app" && origin !== `http://127.0.0.1:${port}`) return new NextResponse("Not allowed", { status: 403 });
  return NextResponse.next();
}

export const config = { matcher: "/:path*" };
