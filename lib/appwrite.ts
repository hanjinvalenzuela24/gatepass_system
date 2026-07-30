import { Account, Client, Databases, Functions } from "appwrite";

const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;

let client: Client | null = null;

function getClient() {
  if (!endpoint || !projectId) {
    throw new Error("Appwrite endpoint/project is not configured.");
  }

  if (!client) {
    client = new Client().setEndpoint(endpoint).setProject(projectId);

    if (process.env.APPWRITE_API_KEY) {
      const apiKey = process.env.APPWRITE_API_KEY;
      if (apiKey.split(".").length === 3) {
        client.setJWT(apiKey);
      } else {
        (client as any).headers = {
          ...((client as any).headers || {}),
          "X-Appwrite-Key": apiKey,
        };
      }
    }
  }

  return client;
}

export function isAppwriteConfigured() {
  return Boolean(endpoint && projectId);
}

export function getAppwriteAccount() {
  return new Account(getClient());
}

export function getAppwriteDatabases() {
  return new Databases(getClient());
}

export function getAppwriteFunctions() {
  return new Functions(getClient());
}
