import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { adminEmails } from "./auth";
import { supabaseProjectUrl, supabasePublicKey } from "./supabase-env";

const loginRedirect = (request: NextRequest): NextResponse => {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(url);
};

const jsonError = (message: string, status: number): NextResponse =>
  NextResponse.json({ error: message }, { status });

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });
  const url = supabaseProjectUrl();
  const key = supabasePublicKey();

  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const isAdminPath =
    request.nextUrl.pathname.startsWith("/admin") ||
    request.nextUrl.pathname.startsWith("/api/admin");

  if (!isAdminPath || process.env.ADMIN_UI_ENABLED !== "true") return response;

  const isAdminApi = request.nextUrl.pathname.startsWith("/api/admin");
  const email = typeof data?.claims?.email === "string" ? data.claims.email.toLowerCase() : "";
  const allowedEmails = adminEmails();

  if (!data?.claims) {
    return isAdminApi ? jsonError("Authentication required", 401) : loginRedirect(request);
  }

  if (allowedEmails.length > 0 && !allowedEmails.includes(email)) {
    return isAdminApi ? jsonError("Admin access required", 403) : NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}
