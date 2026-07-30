import { ID } from "appwrite";
import { NextResponse } from "next/server";

type UserRole = "employee" | "admin" | "manager" | "guard";

const allowedRoles = new Set<UserRole>(["employee", "admin", "manager", "guard"]);

const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;
const publicApiKey = process.env.NEXT_PUBLIC_APPWRITE_API_KEY;
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
  if (!apiKey) {
    if (publicApiKey) {
      missing.push("APPWRITE_API_KEY");
    } else {
      missing.push("APPWRITE_API_KEY");
    }
  }
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

async function verifyAdmin(jwt: string, config: ReturnType<typeof getRequiredConfig>) {
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

    throw new Error(errorBody?.message ?? `Unable to verify admin session (${response.status}).`);
  }

  const user = (await response.json()) as { labels?: string[]; $id?: string };
  if (!user.labels?.includes("admin")) {
    throw new Error("Only admin users can create accounts.");
  }

  return user;
}

async function cleanupUser(userId: string, config: ReturnType<typeof getRequiredConfig>) {
  await fetch(`${config.apiUrlBase}/v1/users/${userId}`, {
    method: "DELETE",
    headers: {
      "X-Appwrite-Project": config.projectId,
      "X-Appwrite-Key": config.apiKey,
    },
  }).catch(() => undefined);
}

export async function POST(request: Request) {
  let body: {
    jwt?: string;
    name?: string;
    email?: string;
    password?: string;
    role?: UserRole;
    department?: string;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return makeJsonError("Invalid request body.", 400);
  }

  const name = body.name?.trim() ?? "";
  const email = body.email?.trim().toLowerCase() ?? "";
  const password = body.password ?? "";
  const role = body.role;
  const department = body.department?.trim() ?? "";
  const jwt = parseBearerToken(body.jwt ?? request.headers.get("authorization"));

  if (!name) return makeJsonError("Full name is required.", 400);
  if (!email) return makeJsonError("Email is required.", 400);
  if (password.length < 6) return makeJsonError("Password must be at least 6 characters.", 400);
  if (!department) return makeJsonError("Department is required.", 400);
  if (!role || !allowedRoles.has(role)) {
    return makeJsonError("Role must be employee, admin, manager, or guard.", 400);
  }
  if (!jwt) return makeJsonError("Missing session token.", 401);

  let config: ReturnType<typeof getRequiredConfig>;
  try {
    config = getRequiredConfig();
  } catch (error) {
    return makeJsonError(error instanceof Error ? error.message : "Missing Appwrite configuration.", 500);
  }

  try {
    await verifyAdmin(jwt, config);

    const createdUserResponse = await fetch(`${config.apiUrlBase}/v1/users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Appwrite-Project": config.projectId,
        "X-Appwrite-Key": config.apiKey,
      },
      body: JSON.stringify({
        userId: ID.unique(),
        email,
        password,
        name,
      }),
    });

    if (!createdUserResponse.ok) {
      const errorBody = (await createdUserResponse.json().catch(() => null)) as { message?: string } | null;
      return makeJsonError(errorBody?.message ?? "Unable to create Appwrite user.", createdUserResponse.status);
    }

    const createdUser = (await createdUserResponse.json()) as { $id: string; name: string; email: string };
    const labels = role === "employee" ? [] : [role];

    const labelResponse = await fetch(`${config.apiUrlBase}/v1/users/${createdUser.$id}/labels`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Appwrite-Project": config.projectId,
        "X-Appwrite-Key": config.apiKey,
      },
      body: JSON.stringify({ labels }),
    });

    if (!labelResponse.ok) {
      await cleanupUser(createdUser.$id, config);
      const errorBody = (await labelResponse.json().catch(() => null)) as { message?: string } | null;
      return makeJsonError(errorBody?.message ?? "Unable to assign user label.", labelResponse.status);
    }

    try {
      const profilePayload: Record<string, unknown> = {
        userId: createdUser.$id,
        name,
        email,
        role,
        department,
        status: "approved",
      };

      let profileResponse = await fetch(
        `${config.apiUrlBase}/v1/databases/${config.databaseId}/collections/${config.profilesCollectionId}/documents`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Appwrite-Project": config.projectId,
            "X-Appwrite-Key": config.apiKey,
          },
          body: JSON.stringify({
            documentId: ID.unique(),
            data: profilePayload,
          }),
        },
      );

      if (!profileResponse.ok) {
        const errorBody = (await profileResponse.json().catch(() => null)) as { message?: string } | null;
        const message = errorBody?.message ?? "Unable to save user profile.";
        if (message.includes("Unknown attribute")) {
          const fallbackPayload: Record<string, unknown> = {
            userId: createdUser.$id,
            name,
            email,
            role,
          };
          if (!message.includes('Unknown attribute: "department"')) {
            fallbackPayload.department = department;
          }
          if (!message.includes('Unknown attribute: "status"')) {
            fallbackPayload.status = "approved";
          }

          profileResponse = await fetch(
            `${config.apiUrlBase}/v1/databases/${config.databaseId}/collections/${config.profilesCollectionId}/documents`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Appwrite-Project": config.projectId,
                "X-Appwrite-Key": config.apiKey,
              },
              body: JSON.stringify({
                documentId: ID.unique(),
                data: fallbackPayload,
              }),
            },
          );
        }
      }

      if (!profileResponse.ok) {
        const errorBody = (await profileResponse.json().catch(() => null)) as { message?: string } | null;
        throw new Error(errorBody?.message ?? "Unable to save user profile.");
      }
    } catch (error) {
      await cleanupUser(createdUser.$id, config);
      return makeJsonError(error instanceof Error ? error.message : "Unable to save user profile.", 500);
    }

    return NextResponse.json(
      {
        id: createdUser.$id,
        name: createdUser.name,
        email: createdUser.email,
        role,
        department,
      },
      { status: 201 },
    );
  } catch (error) {
    return makeJsonError(error instanceof Error ? error.message : "Unable to create account.", 403);
  }
}