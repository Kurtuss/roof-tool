import { NextResponse } from "next/server";

export async function POST() {
  const res = NextResponse.redirect(new URL("/", process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"));
  res.cookies.set("auth_token", "", { httpOnly: true, maxAge: 0, path: "/" });
  return res;
}
