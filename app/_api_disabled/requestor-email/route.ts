import { NextResponse } from "next/server";

const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;
const databaseId = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID;
const profilesCollectionId = process.env.NEXT_PUBLIC_APPWRITE_PROFILES_COLLECTION_ID;

function parseBearerToken(value: string | null) {
  if (!value) {
    return "";
  }

  const trimmed = value.trim();
  if (trimmed.toLowerCase().startsWith("bearer ")) {
    return trimmed.slice(7).trim();
  }

  return trimmed;
}

function makeJsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function getRequiredConfig() {
  const missing: string[] = [];

  if (!endpoint) missing.push("NEXT_PUBLIC_APPWRITE_ENDPOINT");
  if (!projectId) missing.push("NEXT_PUBLIC_APPWRITE_PROJECT_ID");
  if (!apiKey) missing.push("APPWRITE_API_KEY");
  if (!databaseId) missing.push("NEXT_PUBLIC_APPWRITE_DATABASE_ID");
  if (!profilesCollectionId) missing.push("NEXT_PUBLIC_APPWRITE_PROFILES_COLLECTION_ID");

  if (missing.length > 0) {
    throw new Error(`Appwrite admin configuration is incomplete. Missing: ${missing.join(", ")}.`);
  }

  return {
    endpoint: endpoint as string,
    projectId: projectId as string,
    apiKey: apiKey as string,
    databaseId: databaseId as string,
    profilesCollectionId: profilesCollectionId as string,
    apiUrlBase: (endpoint as string).replace(/\/v1\/?$/, ""),
  };
}

async function verifyManagerOrAdmin(jwt: string, config: ReturnType<typeof getRequiredConfig>) {
  const response = await fetch(`${config.apiUrlBase}/v1/account`, {
    headers: {
      "X-Appwrite-Project": config.projectId,
      "X-Appwrite-JWT": jwt,
    },
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as { message?: string } | null;
    if (response.status === 401) {
      throw new Error(errorBody?.message ?? "Invalid or expired session.");
    }

    throw new Error(errorBody?.message ?? `Unable to verify session (${response.status}).`);
  }

  const user = (await response.json()) as { labels?: string[] };
  const labels = user.labels ?? [];
  if (!labels.includes("admin") && !labels.includes("manager")) {
    throw new Error("Only admin or manager users can resolve requestor email.");
  }
}

export async function POST(request: Request) {
  let body: { employeeId?: string; employeeName?: string; jwt?: string };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return makeJsonError("Invalid request body.", 400);
  }

  const employeeId = body.employeeId?.trim() ?? "";
  const employeeName = body.employeeName?.trim() ?? "";
  const jwt = parseBearerToken(body.jwt ?? request.headers.get("authorization"));

  if (!employeeId) return makeJsonError("employeeId is required.", 400);
  if (!jwt) return makeJsonError("Missing session token.", 401);

  let config: ReturnType<typeof getRequiredConfig>;
  try {
    config = getRequiredConfig();
  } catch (error) {
    return makeJsonError(error instanceof Error ? error.message : "Missing Appwrite configuration.", 500);
  }

  try {
    await verifyManagerOrAdmin(jwt, config);

    const params = new URLSearchParams();
    params.append("queries[]", `equal(\"userId\",\"${employeeId}\")`);
    params.append("queries[]", "limit(1)");

    const profileResponse = await fetch(
      `${config.apiUrlBase}/v1/databases/${config.databaseId}/collections/${config.profilesCollectionId}/documents?${params.toString()}`,
      {
        headers: {
          "X-Appwrite-Project": config.projectId,
          "X-Appwrite-Key": config.apiKey,
        },
      },
    );

    if (!profileResponse.ok) {
      const errorBody = (await profileResponse.json().catch(() => null)) as { message?: string } | null;
      return makeJsonError(errorBody?.message ?? "Unable to fetch requestor profile.", profileResponse.status);
    }

    const data = (await profileResponse.json()) as { documents?: Array<{ email?: string }> };
    const email = String(data.documents?.[0]?.email ?? "").trim();

    if (!email) {
      if (employeeName) {
        const nameParams = new URLSearchParams();
        nameParams.append("queries[]", `equal(\"name\",\"${employeeName}\")`);
        nameParams.append("queries[]", "limit(1)");

        const nameProfileResponse = await fetch(
          `${config.apiUrlBase}/v1/databases/${config.databaseId}/collections/${config.profilesCollectionId}/documents?${nameParams.toString()}`,
          {
            headers: {
              "X-Appwrite-Project": config.projectId,
              "X-Appwrite-Key": config.apiKey,
            },
          },
        );

        if (nameProfileResponse.ok) {
          const nameData = (await nameProfileResponse.json()) as { documents?: Array<{ email?: string; userId?: string }> };
          const nameProfile = nameData.documents?.[0];
          const nameEmail = String(nameProfile?.email ?? "").trim();

          if (nameEmail) {
            return NextResponse.json({ email: nameEmail }, { status: 200 });
          }

          const nameUserId = String(nameProfile?.userId ?? "").trim();
          if (nameUserId) {
            const userResponse = await fetch(`${config.apiUrlBase}/v1/users/${nameUserId}`, {
              headers: {
                "X-Appwrite-Project": config.projectId,
                "X-Appwrite-Key": config.apiKey,
              },
            });

            if (userResponse.ok) {
              const userData = (await userResponse.json()) as { email?: string };
              const userEmail = String(userData.email ?? "").trim();
              if (userEmail) {
                return NextResponse.json({ email: userEmail }, { status: 200 });
              }
            }
          }
        }
      }

      const userResponse = await fetch(`${config.apiUrlBase}/v1/users/${employeeId}`, {
        headers: {
          "X-Appwrite-Project": config.projectId,
          "X-Appwrite-Key": config.apiKey,
        },
      });

      if (!userResponse.ok) {
        const errorBody = (await userResponse.json().catch(() => null)) as { message?: string } | null;
        return makeJsonError(errorBody?.message ?? "Requestor email not found.", userResponse.status);
      }

      const userData = (await userResponse.json()) as { email?: string };
      const userEmail = String(userData.email ?? "").trim();

      if (!userEmail) {
        return makeJsonError("Requestor email not found.", 404);
      }

      return NextResponse.json({ email: userEmail }, { status: 200 });
    }

    return NextResponse.json({ email }, { status: 200 });
  } catch (error) {
    return makeJsonError(error instanceof Error ? error.message : "Unable to resolve requestor email.", 403);
  }
}
