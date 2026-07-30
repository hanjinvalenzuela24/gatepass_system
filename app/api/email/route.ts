import { Client, Functions } from "appwrite";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT?.replace(/\/$/, "");
  const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
  const functionId = process.env.NEXT_PUBLIC_APPWRITE_EMAIL_FUNCTION_ID;
  const apiKey = process.env.APPWRITE_API_KEY?.trim();

  if (!endpoint || !projectId || !functionId || !apiKey) {
    return NextResponse.json(
      { ok: false, error: "Appwrite email endpoint is not configured on the server." },
      { status: 500 },
    );
  }

  try {
    const url = `${endpoint}/functions/${functionId}/executions`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Appwrite-Project": projectId,
        "X-Appwrite-Key": apiKey,
      },
      body: JSON.stringify({
        body: JSON.stringify(payload),
        async: false,
      }),
    });

    const result = await response.json().catch(() => null);
    if (!response.ok) {
      const errorMessage = result?.message || result?.error || "Unable to trigger Appwrite email function.";
      return NextResponse.json({ ok: false, error: errorMessage }, { status: 500 });
    }

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to trigger Appwrite email function.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
