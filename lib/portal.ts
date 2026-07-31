import { ID, Query } from "appwrite";
import {
  getAppwriteAccount,
  getAppwriteDatabases,
  getAppwriteFunctions,
  isAppwriteConfigured,
} from "@/lib/appwrite";

export { isAppwriteConfigured };

export type UserRole = "employee" | "admin" | "manager" | "guard";
export type UserStatus = "pending" | "approved" | "rejected";

export type PortalUser = {
  id: string;
  name: string;
  email: string;
  password: string;
  role: UserRole;
  status: UserStatus;
  department?: string;
  approvalNote?: string | null;
};

export type RegisterEmployeeInput = {
  name: string;
  email: string;
  password: string;
  role?: UserRole;
  department?: string;
};

export type CreateManagedAccountInput = {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  department: string;
};

export type AuthResult =
  | { ok: true; user: Omit<PortalUser, "password"> }
  | { ok: false; error: string };

export type RegisterEmployeeResult =
  | { ok: true; user: Omit<PortalUser, "password"> }
  | { ok: false; error: string };

export type CreateManagedAccountResult =
  | { ok: true; user: Omit<PortalUser, "password"> }
  | { ok: false; error: string };

export type SubmitRequestResult =
  | { ok: true }
  | { ok: false; error: string };

export type DeviceRequestStatus = "pending" | "approved" | "rejected";
export type GuardDecisionStatus = "pending" | "released" | "held";
export type LaptopReturnStatus = "pending" | "returned";

export type DeviceRequest = {
  id: string;
  employeeId: string;
  employeeEmail: string;
  employeeName: string;
  department: string;
  deviceType: string;
  deviceName: string;
  model: string;
  assetTag: string;
  inclusions: string;
  purpose: string;
  dateNeeded: string;
  status: DeviceRequestStatus;
  adminDecisionNote: string | null;
  managerDecision: "pending" | "approved" | "rejected";
  managerDecisionNote: string | null;
  managerApprovedAt: string | null;
  guardDecision: GuardDecisionStatus;
  guardDecisionNote: string | null;
  guardCheckedAt: string | null;
  returnStatus: LaptopReturnStatus;
  returnCheckedAt: string | null;
  returnNote: string | null;
  createdAt: string;
};

export type PortalSnapshot = {
  user: Omit<PortalUser, "password"> | null;
  requests: DeviceRequest[];
};

const USERS_KEY = "wps_users";
const REQUESTS_KEY = "wps_requests";
const SESSION_KEY = "wps_session";
const listeners = new Set<() => void>();
const serverSnapshot: PortalSnapshot = { user: null, requests: [] };

const APPWRITE_DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID;
const APPWRITE_PROFILES_COLLECTION_ID = process.env.NEXT_PUBLIC_APPWRITE_PROFILES_COLLECTION_ID;
const APPWRITE_REQUESTS_COLLECTION_ID = process.env.NEXT_PUBLIC_APPWRITE_REQUESTS_COLLECTION_ID;
const APPWRITE_EMAIL_FUNCTION_ID = process.env.NEXT_PUBLIC_APPWRITE_EMAIL_FUNCTION_ID?.trim() ?? "";

let cachedSignature = "";
let cachedSnapshot: PortalSnapshot = serverSnapshot;

const seededUsers: PortalUser[] = [
  {
    id: "emp-001",
    name: "Hanjin Valenzuela",
    email: "employee@warehouse.local",
    password: "employee123",
    role: "employee",
    status: "approved",
    department: "Operations",
  },
  {
    id: "adm-001",
    name: "Marco Dela Cruz",
    email: "admin@warehouse.local",
    password: "admin123",
    role: "admin",
    status: "approved",
    department: "Administration",
  },
  {
    id: "mgr-001",
    name: "Juan Santos",
    email: "manager@warehouse.local",
    password: "manager123",
    role: "manager",
    status: "approved",
    department: "Management",
  },
  {
    id: "grd-001",
    name: "Paolo Reyes",
    email: "guard@warehouse.local",
    password: "guard123",
    role: "guard",
    status: "approved",
    department: "Security",
  },
];

function isAppwriteDataConfigured() {
  return Boolean(
    isAppwriteConfigured() &&
      APPWRITE_DATABASE_ID &&
      APPWRITE_PROFILES_COLLECTION_ID &&
      APPWRITE_REQUESTS_COLLECTION_ID,
  );
}

const EMAIL_SERVICE_URL = process.env.NEXT_PUBLIC_EMAIL_SERVICE_URL?.trim() ?? "";
const ADMIN_ACCOUNT_SERVICE_URL = process.env.NEXT_PUBLIC_ADMIN_ACCOUNT_SERVICE_URL?.trim() ?? "";

type ExternalEmailPayload = {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  replyTo?: string | string[];
  allowExternalRecipients?: boolean;
};

function getAppwriteConfig() {
  if (!APPWRITE_DATABASE_ID || !APPWRITE_PROFILES_COLLECTION_ID || !APPWRITE_REQUESTS_COLLECTION_ID) {
    throw new Error("Appwrite database/collection IDs are not configured.");
  }

  return {
    databaseId: APPWRITE_DATABASE_ID,
    profilesCollectionId: APPWRITE_PROFILES_COLLECTION_ID,
    requestsCollectionId: APPWRITE_REQUESTS_COLLECTION_ID,
  };
}

function isAppwriteEmailConfigured() {
  return Boolean(isAppwriteConfigured() && APPWRITE_EMAIL_FUNCTION_ID);
}

async function sendEmailViaAppwrite(payload: ExternalEmailPayload) {
  if (!isAppwriteEmailConfigured()) {
    console.error("Appwrite email function not configured.");
    return { ok: false, error: "Appwrite email function is not configured." } as const;
  }

  try {
    console.log("Triggering Appwrite email function", {
      functionId: APPWRITE_EMAIL_FUNCTION_ID,
      payload,
    });

    // This app is deployed as a static export, so Next.js Route Handlers such
    // as /api/email are not available at runtime. Execute the Appwrite
    // function directly instead.
    const result = await getAppwriteFunctions().createExecution(
      APPWRITE_EMAIL_FUNCTION_ID,
      JSON.stringify(payload),
      false,
    );

    console.log("Appwrite email function response", {
      executionId: result.$id,
      status: result.status,
      responseStatusCode: result.responseStatusCode,
    });

    if (result.status !== "completed" || result.responseStatusCode >= 400) {
      return {
        ok: false,
        error: result.responseBody || "Appwrite email function failed.",
      } as const;
    }

    return { ok: true, result } as const;
  } catch (error) {
    console.error("Appwrite email function failed:", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Appwrite email function error.",
    } as const;
  }
}

function getEmailServiceUrl() {
  return EMAIL_SERVICE_URL.replace(/\/+/g, "/").replace(/\/$/, "");
}

function getAdminAccountServiceUrl() {
  return ADMIN_ACCOUNT_SERVICE_URL.replace(/\/+/g, "/").replace(/\/$/, "");
}

function getWebsiteUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "");
  if (configuredUrl) {
    return configuredUrl;
  }

  // Email requests originate in the browser, so this works for static hosting
  // without baking a localhost URL into the production bundle.
  return typeof window !== "undefined" ? window.location.origin : "";
}

async function sendEmailViaExternalService(payload: ExternalEmailPayload) {
  if (isAppwriteEmailConfigured()) {
    return await sendEmailViaAppwrite(payload);
  }

  const url = getEmailServiceUrl();
  if (!url) {
    console.warn(
      "Static mode: email delivery is disabled because NEXT_PUBLIC_EMAIL_SERVICE_URL is not configured.",
      payload,
    );
    return { ok: true } as const;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as { error?: string } | null;
    return {
      ok: false,
      error: errorBody?.error ?? `External email service failed (${response.status}).`,
    } as const;
  }

  return { ok: true } as const;
}

function getRoleFromLabels(labels: string[] | undefined): UserRole {
  if (labels?.includes("admin")) {
    return "admin";
  }

  if (labels?.includes("manager")) {
    return "manager";
  }

  if (labels?.includes("guard")) {
    return "guard";
  }

  return "employee";
}

function normalizeRequest(request: DeviceRequest): DeviceRequest {
  return {
    ...request,
    deviceType: request.deviceType ?? "Laptop",
    adminDecisionNote: request.adminDecisionNote ?? null,
    managerDecision: request.managerDecision ?? "pending",
    managerDecisionNote: request.managerDecisionNote ?? null,
    managerApprovedAt: request.managerApprovedAt ?? null,
    guardDecision: request.guardDecision ?? "pending",
    guardDecisionNote: request.guardDecisionNote ?? null,
    guardCheckedAt: request.guardCheckedAt ?? null,
    returnStatus: request.returnStatus ?? "pending",
    returnCheckedAt: request.returnCheckedAt ?? null,
    returnNote: request.returnNote ?? null,
  };
}

function mapAppwriteDocToRequest(document: Record<string, unknown>): DeviceRequest {
  const id = String(document.$id ?? document.id ?? generateRequestId());
  const createdAt = String(document.createdAt ?? document.$createdAt ?? new Date().toISOString());

  return normalizeRequest({
    id,
    employeeId: String(document.employeeId ?? ""),
    employeeEmail: String(document.employeeEmail ?? ""),
    employeeName: String(document.employeeName ?? ""),
    department: String(document.department ?? ""),
    deviceType: String(document.deviceType ?? "Laptop"),
    deviceName: String(document.deviceName ?? ""),
    model: String(document.model ?? ""),
    assetTag: String(document.assetTag ?? ""),
    inclusions: String(document.inclusions ?? document.serialNumber ?? ""),
    purpose: String(document.purpose ?? ""),
    dateNeeded: String(document.dateNeeded ?? ""),
    status: (document.status as DeviceRequestStatus) ?? "pending",
    adminDecisionNote: (document.adminDecisionNote as string | null) ?? null,
    managerDecision: ((document.managerDecision as string) ?? "pending") as "pending" | "approved" | "rejected",
    managerDecisionNote: (document.managerDecisionNote as string | null) ?? null,
    managerApprovedAt: (document.managerApprovedAt as string | null) ?? null,
    guardDecision: (document.guardDecision as GuardDecisionStatus) ?? "pending",
    guardDecisionNote: (document.guardDecisionNote as string | null) ?? null,
    guardCheckedAt: (document.guardCheckedAt as string | null) ?? null,
    returnStatus: (document.returnStatus as LaptopReturnStatus) ?? "pending",
    returnCheckedAt: (document.returnCheckedAt as string | null) ?? null,
    returnNote: (document.returnNote as string | null) ?? null,
    createdAt,
  });
}

function mapProfileDocumentToUser(document: Record<string, unknown>): PortalUser {
  const rawRole = String(document.role ?? "employee").toLowerCase();
  const role: UserRole = rawRole === "admin" || rawRole === "manager" || rawRole === "guard" ? rawRole : "employee";

  return {
    id: String(document.userId ?? document.$id ?? document.id ?? ""),
    name: String(document.name ?? ""),
    email: String(document.email ?? ""),
    password: "",
    role,
    status: (String(document.status ?? "approved") as UserStatus) || "approved",
    department: String(document.department ?? "") || undefined,
    approvalNote:
      (document.approvalNote as string | null) ??
      (document.comment as string | null) ??
      null,
  };
}

export async function listAppwriteUsers(): Promise<PortalUser[]> {
  if (!isAppwriteDataConfigured()) {
    return listUsers();
  }

  const databases = getAppwriteDatabases();
  const { databaseId, profilesCollectionId } = getAppwriteConfig();
  const result = await databases.listDocuments(databaseId, profilesCollectionId, [Query.limit(5000)]);
  return result.documents.map((document) => mapProfileDocumentToUser(document as Record<string, unknown>));
}

function formatDateTimeForEmail(value: string) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value.replace("T", " ");
  }

  const datePart = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 || 12;
  return `${datePart} ${hour12}:${minutes} ${ampm}`;
}

function generateRequestId() {
  const webCrypto =
    typeof globalThis !== "undefined" ? (globalThis.crypto as Crypto | undefined) : undefined;

  if (webCrypto?.randomUUID) {
    return webCrypto.randomUUID();
  }

  if (webCrypto?.getRandomValues) {
    const bytes = new Uint8Array(16);
    webCrypto.getRandomValues(bytes);
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  return `req-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function generateUserId() {
  const webCrypto =
    typeof globalThis !== "undefined" ? (globalThis.crypto as Crypto | undefined) : undefined;

  if (webCrypto?.randomUUID) {
    return `emp-${webCrypto.randomUUID()}`;
  }

  if (webCrypto?.getRandomValues) {
    const bytes = new Uint8Array(8);
    webCrypto.getRandomValues(bytes);
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `emp-${hex}`;
  }

  return `emp-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function safeGet<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeSet<T>(key: string, value: T) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(key, JSON.stringify(value));
}

function setRequests(requests: DeviceRequest[]) {
  safeSet(
    REQUESTS_KEY,
    requests.map((request) => normalizeRequest(request)),
  );
}

function normalizeUser(user: PortalUser): PortalUser {
  return {
    ...user,
    status: user.status ?? "approved",
    approvalNote: user.approvalNote ?? null,
  };
}

function setUsers(users: PortalUser[]) {
  safeSet(USERS_KEY, users.map((user) => normalizeUser(user)));
}

function listUsers(): PortalUser[] {
  return safeGet<PortalUser[]>(USERS_KEY, seededUsers).map((user) => normalizeUser(user));
}

function withLocalUsers(mutator: (users: PortalUser[]) => PortalUser[]) {
  const currentUsers = listUsers();
  const nextUsers = mutator(currentUsers).map((user) => normalizeUser(user));
  setUsers(nextUsers);
  notify();
}

export function listAllUsers() {
  return listUsers();
}

export function listPendingUsers() {
  return listUsers().filter((user) => user.status === "pending");
}

export async function updateAccountApproval(
  userId: string,
  status: Exclude<UserStatus, "pending">,
  note?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  withLocalUsers((users) =>
    users.map((user) => {
      if (user.id !== userId) {
        return user;
      }

      return {
        ...user,
        status,
        approvalNote: status === "rejected" ? note?.trim() ?? null : null,
      };
    }),
  );

  if (!isAppwriteDataConfigured()) {
    return { ok: true };
  }

  try {
    const account = getAppwriteAccount();
    const databases = getAppwriteDatabases();
    const { databaseId, profilesCollectionId } = getAppwriteConfig();
    const profileResult = await databases.listDocuments(databaseId, profilesCollectionId, [
      Query.equal("userId", userId),
      Query.limit(1),
    ]);
    const profile = profileResult.documents[0] as Record<string, unknown> | undefined;
    if (!profile) {
      return { ok: true };
    }

    const updatePayload: Record<string, unknown> = {
      status,
    };
    if (status === "rejected") {
      const noteText = note?.trim() ?? null;
      updatePayload.approvalNote = noteText;
      updatePayload.comment = noteText;
    }

    try {
      await databases.updateDocument(databaseId, profilesCollectionId, String(profile.$id ?? profile.id), updatePayload);
    } catch (error) {
      const message = extractErrorMessage(error, "Unable to update user approval status.");
      if (!message.includes("Unknown attribute")) {
        throw error;
      }
      // Ignore unknown profile fields if Appwrite schema does not support them.
    }

    return { ok: true };
  } catch {
    return { ok: true };
  }
}

function withLocalRequests(mutator: (requests: DeviceRequest[]) => DeviceRequest[]) {
  const current = safeGet<DeviceRequest[]>(REQUESTS_KEY, []).map((request) => normalizeRequest(request));
  const next = mutator(current).map((request) => normalizeRequest(request));
  setRequests(next);
  notify();
}

function notify() {
  listeners.forEach((listener) => listener());
}

function extractErrorMessage(error: unknown, fallback: string) {
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }

  return fallback;
}

async function resolveRequestorEmail(request: DeviceRequest) {
  if (request.employeeEmail.trim()) {
    return request.employeeEmail.trim();
  }

  if (!isAppwriteDataConfigured()) {
    return "";
  }

  try {
    const databases = getAppwriteDatabases();
    const { databaseId, profilesCollectionId } = getAppwriteConfig();
    const profileQueries = [
      request.employeeId ? [Query.equal("userId", request.employeeId), Query.limit(1)] : null,
      request.employeeName ? [Query.equal("name", request.employeeName), Query.limit(1)] : null,
    ].filter((queries): queries is NonNullable<typeof queries> => Boolean(queries));

    for (const queries of profileQueries) {
      const profileResult = await databases.listDocuments(databaseId, profilesCollectionId, queries);
      const profile = profileResult.documents[0] as { email?: string } | undefined;
      const emailFromProfile = String(profile?.email ?? "").trim();
      if (emailFromProfile) {
        return emailFromProfile;
      }
    }
  } catch {
    // ignore lookup failures
  }

  return "";
}

function getConfiguredEmailList(kind: "admin" | "manager") {
  const publicKey = kind === "admin" ? "NEXT_PUBLIC_ADMIN_EMAILS" : "NEXT_PUBLIC_MANAGER_EMAILS";
  const fallbackKey = kind === "admin" ? "ADMIN_EMAILS" : "MANAGER_EMAILS";
  const defaultRecipients = kind === "admin"
    ? ["set.it@seiwakaiun.com.ph"]
    : ["valenzuelamarkhanjin@gmail.com"];

  const emails = [process.env[publicKey], process.env[fallbackKey], ...defaultRecipients]
    .flatMap((value) => (value ?? "").split(","))
    .map((value) => value.trim())
    .filter(Boolean);

  console.log(`Email recipient lookup (${kind})`, {
    publicKey,
    fallbackKey,
    emails,
  });

  return emails;
}

async function sendAdminNotification(request: {
  employeeName: string;
  employeeEmail: string;
  department: string;
  deviceType: string;
  deviceName: string;
  purpose: string;
  dateNeeded: string;
}) {
  const adminList = getConfiguredEmailList("admin");

  if (!adminList.length) {
    return { ok: false, error: "No admin email configured." } as const;
  }

  const replyTo = request.employeeEmail.trim().toLowerCase().endsWith(`@seiwakaiun.com.ph`)
    ? request.employeeEmail.trim()
    : undefined;

  const websiteUrl = getWebsiteUrl();
  const formattedDateNeeded = formatDateTimeForEmail(request.dateNeeded);
const emailResult = await sendEmailViaExternalService({
    to: adminList,
    subject: `New device request from ${request.employeeName}`,
    text: `Employee: ${request.employeeName} (${request.employeeEmail})\nDepartment: ${request.department}\nDevice: ${request.deviceType} ${request.deviceName}\nPurpose: ${request.purpose}\nDate needed: ${formattedDateNeeded}\n\nReview this request: ${websiteUrl}/admin`,
    html: `<html><body style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
        <h2 style="color: #253448; border-bottom: 3px solid #d8732c; padding-bottom: 10px;">NEW DEVICE REQUEST</h2>
  
        <p>A new device request has been submitted and awaits admin approval.</p>
  
        <h3 style="color: #253448; margin-top: 20px;">EMPLOYEE INFORMATION</h3>
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td style="padding: 8px; font-weight: bold; width: 35%;">Name:</td><td style="padding: 8px;">${request.employeeName}</td></tr>
          <tr style="background: #f9f9f9;"><td style="padding: 8px; font-weight: bold;">Email:</td><td style="padding: 8px;">${request.employeeEmail}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold;">Department:</td><td style="padding: 8px;">${request.department}</td></tr>
        </table>
  
        <h3 style="color: #253448; margin-top: 20px;">DEVICE INFORMATION</h3>
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td style="padding: 8px; font-weight: bold; width: 35%;">Type:</td><td style="padding: 8px;">${request.deviceType}</td></tr>
          <tr style="background: #f9f9f9;"><td style="padding: 8px; font-weight: bold;">Device:</td><td style="padding: 8px;">${request.deviceName}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold;">Purpose:</td><td style="padding: 8px;">${request.purpose}</td></tr>
          <tr style="background: #f9f9f9;"><td style="padding: 8px; font-weight: bold;">Date Needed:</td><td style="padding: 8px;">${formattedDateNeeded}</td></tr>
        </table>
  
        <div style="text-align: center; margin: 30px 0;">
          <a href="${websiteUrl}/admin" style="background: #d8732c; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Go to Admin Dashboard</a>
        </div>

        <p style="color: #666; font-size: 12px; margin-top: 30px; padding-top: 15px; border-top: 1px solid #ddd;">
          This is an automated message. Please do not reply.
        </p>
      </body></html>`,
    ...(replyTo ? { replyTo } : {}),
  });

  if (!emailResult.ok) {
    return { ok: false, error: emailResult.error } as const;
  }

  return { ok: true } as const;
}

async function sendManagerApprovalQueueNotification(request: {
  id: string;
  employeeName: string;
  employeeEmail: string;
  requestorEmail?: string;
  department: string;
  deviceType: string;
  deviceName: string;
  purpose: string;
  dateNeeded: string;
  adminNote: string | null;
  adminEmail?: string;
}) {
  const managerList = getConfiguredEmailList("manager");

  if (!managerList.length) {
    return { ok: false, error: "No manager email configured." } as const;
  }

  const employeeEmailDisplay =
    request.requestorEmail?.trim() || request.employeeEmail?.trim() || "Not available";
  const websiteUrl = getWebsiteUrl();
  const formattedDateNeeded = formatDateTimeForEmail(request.dateNeeded);
  const htmlBody = `
<html><body style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
  <h2 style="color: #253448; border-bottom: 3px solid #d8732c; padding-bottom: 10px;">DEVICE REQUEST - MANAGER REVIEW NEEDED</h2>
  
  <p>Hello,</p>
  <p>A device request has been <b>approved by Admin</b> and is waiting for <b>your manager approval</b>.</p>
  
  <h3 style="color: #253448; margin-top: 20px;">REQUEST DETAILS</h3>
  <table style="width: 100%; border-collapse: collapse;">
    <tr><td style="padding: 8px; font-weight: bold; width: 35%;">Request ID:</td><td style="padding: 8px;">${request.id}</td></tr>
    <tr style="background: #f9f9f9;"><td style="padding: 8px; font-weight: bold;">Employee:</td><td style="padding: 8px;">${request.employeeName}</td></tr>
    <tr><td style="padding: 8px; font-weight: bold;">Email:</td><td style="padding: 8px;">${employeeEmailDisplay}</td></tr>
    <tr style="background: #f9f9f9;"><td style="padding: 8px; font-weight: bold;">Department:</td><td style="padding: 8px;">${request.department}</td></tr>
  </table>
  
  <h3 style="color: #253448; margin-top: 20px;">DEVICE INFORMATION</h3>
  <table style="width: 100%; border-collapse: collapse;">
    <tr><td style="padding: 8px; font-weight: bold; width: 35%;">Type:</td><td style="padding: 8px;">${request.deviceType}</td></tr>
    <tr style="background: #f9f9f9;"><td style="padding: 8px; font-weight: bold;">Device:</td><td style="padding: 8px;">${request.deviceName}</td></tr>
    <tr><td style="padding: 8px; font-weight: bold;">Purpose:</td><td style="padding: 8px;">${request.purpose}</td></tr>
    <tr style="background: #f9f9f9;"><td style="padding: 8px; font-weight: bold;">Date Needed:</td><td style="padding: 8px;">${formattedDateNeeded}</td></tr>
  </table>
  
  ${request.adminNote ? `<p style="background: #fffacd; border-left: 4px solid #d8732c; padding: 12px; margin: 20px 0;"><b>Admin Note:</b> ${request.adminNote}</p>` : ""}
  
  <div style="text-align: center; margin: 30px 0;">
    <a href="${websiteUrl}/manager" style="background: #d8732c; color: white; padding: 10px 25px; text-decoration: none; border-radius: 4px; font-weight: bold;">Go to Manager Dashboard</a>
  </div>
  
  <p style="color: #666; font-size: 12px; margin-top: 30px; padding-top: 15px; border-top: 1px solid #ddd;">
    This is an automated message. Please do not reply.
  </p>
</body></html>
  `.trim();

  const emailPayload = {
    to: managerList,
    subject: `Device Request ${request.id}: Manager Approval Needed`,
    text: `A request has been approved by admin and needs manager review.\n\nRequest ID: ${request.id}\nEmployee: ${request.employeeName} (${employeeEmailDisplay})\nDepartment: ${request.department}\nDevice: ${request.deviceType} ${request.deviceName}\nPurpose: ${request.purpose}\nDate needed: ${formattedDateNeeded}\nAdmin note: ${request.adminNote ?? "(none)"}\n\nVisit ${websiteUrl}/manager to review this request.`,
    html: htmlBody,
    ...(request.adminEmail ? { replyTo: request.adminEmail } : {}),
  };

  console.log("Sending manager email with HTML:", {
    to: emailPayload.to,
    subject: emailPayload.subject,
    hasHtml: Boolean(emailPayload.html),
    htmlLength: emailPayload.html?.length,
  });

  const emailResult = await sendEmailViaExternalService(emailPayload);

  if (!emailResult.ok) {
    return { ok: false, error: emailResult.error } as const;
  }

  return { ok: true } as const;
}

async function syncFromAppwrite() {
  if (typeof window === "undefined" || !isAppwriteDataConfigured()) {
    return;
  }

  const account = getAppwriteAccount();
  const databases = getAppwriteDatabases();
  const { databaseId, profilesCollectionId, requestsCollectionId } = getAppwriteConfig();

  let accountUser: { $id: string; name?: string; email?: string; labels?: string[] };

  try {
    accountUser = await account.get();
  } catch {
    safeSet(SESSION_KEY, null);
    notify();
    return;
  }

  let profile: Record<string, unknown> | undefined;

  try {
    const profileResult = await databases.listDocuments(databaseId, profilesCollectionId, [
      Query.equal("userId", accountUser.$id),
      Query.limit(1),
    ]);
    profile = profileResult.documents[0] as Record<string, unknown> | undefined;
  } catch {
    // Keep auth session usable even when profile collection permissions are restricted.
    profile = undefined;
  }

  if (!profile && accountUser.email) {
    try {
      const profileResult = await databases.listDocuments(databaseId, profilesCollectionId, [
        Query.equal("email", accountUser.email),
        Query.limit(1),
      ]);
      profile = profileResult.documents[0] as Record<string, unknown> | undefined;
    } catch {
      // Ignore fallback failure.
    }
  }

  const accountPrefs = (accountUser as { prefs?: Record<string, unknown> }).prefs ?? {};
  const sessionUser: Omit<PortalUser, "password"> = {
    id: accountUser.$id,
    name: String(profile?.name ?? accountUser.name ?? "Unknown User"),
    email: String(profile?.email ?? accountUser.email ?? ""),
    role: getRoleFromLabels(accountUser.labels),
    status: (String(profile?.status ?? accountPrefs.status ?? "approved") as UserStatus) || "approved",
    department: String(profile?.department ?? accountPrefs.department ?? "") || undefined,
  };

  try {
    const requestResult = await databases.listDocuments(databaseId, requestsCollectionId, [Query.limit(5000)]);
    const requests = requestResult.documents
      .map((document) => mapAppwriteDocToRequest(document as unknown as Record<string, unknown>))
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
    setRequests(requests);
  } catch (error) {
    console.error("Unable to load Appwrite requests during sync:", error);
    // Requests list can fail for permission reasons without blocking login.
  }

  safeSet(SESSION_KEY, sessionUser);
  notify();
}

export function bootstrapMockData() {
  if (isAppwriteDataConfigured()) {
    const requests = safeGet<DeviceRequest[]>(REQUESTS_KEY, []);
    if (!requests.length) {
      setRequests([]);
    }
    void syncFromAppwrite();
    return;
  }

  const users = safeGet<PortalUser[]>(USERS_KEY, []);
  if (!users.length) {
    safeSet(USERS_KEY, seededUsers);
  } else {
    const mergedUsers = [...users];

    for (const seededUser of seededUsers) {
      const exists = mergedUsers.some(
        (user) => user.email.toLowerCase() === seededUser.email.toLowerCase(),
      );
      if (!exists) {
        mergedUsers.push(seededUser);
      }
    }

    safeSet(USERS_KEY, mergedUsers);
  }

  const requests = safeGet<DeviceRequest[]>(REQUESTS_KEY, []);
  if (!requests.length) {
    setRequests([]);
  }
}

export async function login(email: string, password: string): Promise<AuthResult> {
  if (isAppwriteDataConfigured()) {
    try {
      const account = getAppwriteAccount();
      await account.createEmailPasswordSession(email, password);
      await syncFromAppwrite();
      const currentUser = getCurrentUser();
      if (!currentUser) {
        await logout();
        return { ok: false, error: "Unable to establish session." };
      }
      if (currentUser.status !== "approved") {
        await logout();
        return {
          ok: false,
          error:
            currentUser.status === "pending"
              ? "Account registration is pending admin approval."
              : `Your account registration has been rejected.${currentUser.approvalNote ? ` Reason: ${currentUser.approvalNote}` : " Contact your administrator."}`,
        };
      }
      return { ok: true, user: currentUser };
    } catch {
      // Appwrite auth failed; fall back to local seeded users for static/local use.
    }
  }

  const users = listUsers();
  const user = users.find(
    (u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password,
  );
  if (!user) {
    return { ok: false, error: "Invalid credentials. Please check your email and password." };
  }

  if (user.status === "pending") {
    return { ok: false, error: "Account registration is pending admin approval." };
  }

  if (user.status === "rejected") {
    return {
      ok: false,
      error: `Your account registration has been rejected.${user.approvalNote ? ` Reason: ${user.approvalNote}` : " Contact your administrator."}`,
    };
  }

  const sessionUser: Omit<PortalUser, "password"> = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    ...(user.department ? { department: user.department } : {}),
  };
  safeSet(SESSION_KEY, sessionUser);
  notify();
  return { ok: true, user: sessionUser };
}

export async function createManagedAccount(
  input: CreateManagedAccountInput,
): Promise<CreateManagedAccountResult> {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const password = input.password;
  const role = input.role;
  const department = input.department.trim();

  if (!name) {
    return { ok: false, error: "Full name is required." };
  }

  if (!email) {
    return { ok: false, error: "Email is required." };
  }

  if (password.length < 6) {
    return { ok: false, error: "Password must be at least 6 characters." };
  }

  if (!department) {
    return { ok: false, error: "Department is required." };
  }

  const adminServiceUrl = getAdminAccountServiceUrl();
  if (isAppwriteDataConfigured() && adminServiceUrl) {
    try {
      const account = getAppwriteAccount();
      try {
        await account.get();
      } catch {
        logout();
        return {
          ok: false,
          error: "Your Appwrite session is invalid or expired. Please sign in again.",
        };
      }

      let jwtValue: string;

      try {
        const jwt = await account.createJWT();
        jwtValue = jwt.jwt;
      } catch {
        logout();
        return {
          ok: false,
          error: "Your Appwrite session is invalid or expired. Please sign in again.",
        };
      }

      const response = await fetch(adminServiceUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jwt: jwtValue,
          name,
          email,
          password,
          role,
          department,
        }),
      });

      if (!response.ok) {
        const errorBody = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        return {
          ok: false,
          error: errorBody?.error ?? "Unable to create account.",
        };
      }

      const created = (await response.json()) as Omit<PortalUser, "password">;

      return {
        ok: true,
        user: created,
      };
    } catch (error) {
      return {
        ok: false,
        error: extractErrorMessage(error, "Unable to create account."),
      };
    }
  }

  const users = safeGet<PortalUser[]>(USERS_KEY, seededUsers);
  const existingUser = users.some((user) => user.email.toLowerCase() === email);
  if (existingUser) {
    return { ok: false, error: "Email is already registered." };
  }

  const newUser: PortalUser = {
    id: generateUserId(),
    name,
    email,
    password,
    role,
    status: "approved",
    department,
  };

  users.push(newUser);
  setUsers(users);

  return {
    ok: true,
    user: {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      status: newUser.status,
      department: newUser.department,
    },
  };
}

export async function registerEmployee(input: RegisterEmployeeInput): Promise<RegisterEmployeeResult> {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const password = input.password;
  const role = input.role ?? "employee";
  const department = input.department?.trim() || "Unassigned";

  if (!name) {
    return { ok: false, error: "Full name is required." };
  }

  if (!email) {
    return { ok: false, error: "Email is required." };
  }

  if (password.length < 6) {
    return { ok: false, error: "Password must be at least 6 characters." };
  }

  if (isAppwriteDataConfigured()) {
    try {
      const account = getAppwriteAccount();
      const userId = ID.unique();
      await account.create(userId, email, password, name);

      try {
        await account.createEmailPasswordSession(email, password);
        await account.updatePrefs({ status: "pending", department });
        await account.deleteSession("current");
      } catch {
        // If prefs cannot be updated or the session cannot be kept, continue with profile persistence only.
      }

      const databases = getAppwriteDatabases();
      const { databaseId, profilesCollectionId } = getAppwriteConfig();
      const profilePayload: Record<string, unknown> = {
        userId,
        name,
        email,
        role,
        status: "pending",
        department,
        approvalNote: null,
        comment: null,
      };

      try {
        await databases.createDocument(databaseId, profilesCollectionId, ID.unique(), profilePayload);
      } catch (error) {
        const message = extractErrorMessage(error, "Unable to save user profile.");
        if (message.includes("Unknown attribute")) {
          const fallbackPayload: Record<string, unknown> = {
            userId,
            name,
            email,
            role,
            approvalNote: null,
            comment: null,
          };
          if (!message.includes('Unknown attribute: "status"')) {
            fallbackPayload.status = "pending";
          }
          if (!message.includes('Unknown attribute: "department"')) {
            fallbackPayload.department = department;
          }
          await databases.createDocument(databaseId, profilesCollectionId, ID.unique(), fallbackPayload);
        } else {
          throw error;
        }
      }

      return {
        ok: true,
        user: {
          id: userId,
          name,
          email,
          role,
          status: "pending",
          department,
        },
      };
    } catch (error) {
      return {
        ok: false,
        error: extractErrorMessage(error, "Unable to register account."),
      };
    }
  }

  const users = listUsers();
  const existingUser = users.some((user) => user.email.toLowerCase() === email);
  if (existingUser) {
    return { ok: false, error: "Email is already registered." };
  }

  const newUser: PortalUser = {
    id: generateUserId(),
    name,
    email,
    password,
    role,
    status: "pending",
    department,
  };

  withLocalUsers((usersList) => [...usersList, newUser]);

  return {
    ok: true,
    user: {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      status: newUser.status,
      department: newUser.department,
    },
  };
}

export function getCurrentUser(): Omit<PortalUser, "password"> | null {
  return safeGet<Omit<PortalUser, "password"> | null>(SESSION_KEY, null);
}

export function logout() {
  if (typeof window === "undefined") return;

  if (isAppwriteDataConfigured()) {
    const account = getAppwriteAccount();
    void account.deleteSession("current").catch(() => undefined);
  }

  window.localStorage.removeItem(SESSION_KEY);
  notify();
}

export function listRequests(): DeviceRequest[] {
  const all = safeGet<DeviceRequest[]>(REQUESTS_KEY, []);
  return all
    .map((request) => normalizeRequest(request))
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
}

export function listRequestsForEmployee(employeeId: string): DeviceRequest[] {
  return listRequests().filter((r) => r.employeeId === employeeId);
}

export async function submitRequest(
  payload: Omit<
    DeviceRequest,
    | "id"
    | "employeeEmail"
    | "status"
    | "adminDecisionNote"
    | "managerDecision"
    | "managerDecisionNote"
    | "managerApprovedAt"
    | "guardDecision"
    | "guardDecisionNote"
    | "guardCheckedAt"
    | "returnStatus"
    | "returnCheckedAt"
    | "returnNote"
    | "createdAt"
  >,
): Promise<SubmitRequestResult> {
  const createdAt = new Date().toISOString();
  const request: DeviceRequest = {
    ...payload,
    id: generateRequestId(),
    status: "pending",
    employeeEmail: (() => {
      try {
        const current = getCurrentUser();
        return current?.email ?? "";
      } catch {
        return "";
      }
    })(),
    adminDecisionNote: null,
    managerDecision: "pending",
    managerDecisionNote: null,
    managerApprovedAt: null,
    guardDecision: "pending",
    guardDecisionNote: null,
    guardCheckedAt: null,
    returnStatus: "pending",
    returnCheckedAt: null,
    returnNote: null,
    createdAt,
  };

  if (!isAppwriteDataConfigured()) {
    withLocalRequests((requests) => [request, ...requests]);
    try {
      const emailResult = await sendAdminNotification(request);
      if (!emailResult.ok) {
        console.error("submitRequest email error (local mode):", emailResult.error);
      }
    } catch (error) {
      console.error("submitRequest email error (local mode):", extractErrorMessage(error, "Unable to send admin email."));
    }
    return { ok: true };
  }

  const databases = getAppwriteDatabases();
  const { databaseId, requestsCollectionId } = getAppwriteConfig();
  const requestDocumentPayload = {
    employeeId: request.employeeId,
    employeeEmail: request.employeeEmail,
    employeeName: request.employeeName,
    department: request.department,
    deviceType: request.deviceType,
    deviceName: request.deviceName,
    model: request.model,
    assetTag: request.assetTag,
    serialNumber: request.inclusions,
    inclusions: request.inclusions,
    purpose: request.purpose,
    dateNeeded: request.dateNeeded,
    status: request.status,
    adminDecisionNote: request.adminDecisionNote,
    managerDecision: request.managerDecision,
    managerDecisionNote: request.managerDecisionNote,
    managerApprovedAt: request.managerApprovedAt,
    guardDecision: request.guardDecision,
    guardDecisionNote: request.guardDecisionNote,
    guardCheckedAt: request.guardCheckedAt,
    returnStatus: request.returnStatus,
    returnCheckedAt: request.returnCheckedAt,
    returnNote: request.returnNote,
    createdAt: request.createdAt,
  };

  const createRequestDocument = async () => {
    try {
      await databases.createDocument(databaseId, requestsCollectionId, request.id, requestDocumentPayload);
    } catch (error) {
      const message = extractErrorMessage(error, "Unable to save request to Appwrite.");
      if (message.includes('Unknown attribute: "inclusions"')) {
        const { inclusions: _inclusions, ...legacyPayload } = requestDocumentPayload;
        await databases.createDocument(databaseId, requestsCollectionId, request.id, legacyPayload);
        return;
      }

      if (message.includes('Unknown attribute: "employeeEmail"')) {
        const { employeeEmail: _employeeEmail, ...legacyPayload } = requestDocumentPayload;
        await databases.createDocument(databaseId, requestsCollectionId, request.id, legacyPayload);
        return;
      }

      throw error;
    }
  };

  return createRequestDocument()
    .then(async () => {
      // notify admins after successful save using the local request (has employeeEmail)
      try {
        const emailResult = await sendAdminNotification(request);
        if (!emailResult.ok) {
          console.error("submitRequest email error:", emailResult.error);
        }
      } catch {
        /* ignore */
      }
      await syncFromAppwrite();
      return { ok: true } as SubmitRequestResult;
    })
    .catch((error) => {
      const message = extractErrorMessage(error, "Unable to save request to Appwrite.");
      console.error("submitRequest Appwrite error:", message, error);
      return { ok: false, error: message } as SubmitRequestResult;
    });
}

export async function updateRequestStatus(
  requestId: string,
  status: Exclude<DeviceRequestStatus, "pending">,
  note?: string,
): Promise<{ ok: true; warning?: string } | { ok: false; error: string }> {
  withLocalRequests((requests) =>
    requests.map((request) => {
      if (request.id !== requestId) {
        return request;
      }

      return {
        ...request,
        status,
        adminDecisionNote: status === "rejected" ? note?.trim() ?? null : null,
      };
    }),
  );

  if (!isAppwriteDataConfigured()) {
    return { ok: true };
  }

  try {
    const databases = getAppwriteDatabases();
    const { databaseId, requestsCollectionId } = getAppwriteConfig();
    const requestBeforeUpdate = listRequests().find((r) => r.id === requestId);
    const currentAdmin = (() => {
      try {
        const u = getCurrentUser();
        return u?.email ?? undefined;
      } catch {
        return undefined;
      }
    })();

    const requestorEmail = requestBeforeUpdate
      ? requestBeforeUpdate.employeeEmail.trim() || await resolveRequestorEmail(requestBeforeUpdate)
      : "";

    await databases.updateDocument(databaseId, requestsCollectionId, requestId, {
      status,
      adminDecisionNote: status === "rejected" ? note?.trim() ?? null : null,
      managerDecision: requestBeforeUpdate?.managerDecision ?? "pending",
      managerDecisionNote: requestBeforeUpdate?.managerDecisionNote ?? null,
      managerApprovedAt: requestBeforeUpdate?.managerApprovedAt ?? null,
    });

    try {
      if (status === "approved" && requestBeforeUpdate) {
        const managerEmailResult = await sendManagerApprovalQueueNotification({
          id: requestBeforeUpdate.id,
          employeeName: requestBeforeUpdate.employeeName,
          employeeEmail: requestBeforeUpdate.employeeEmail,
          requestorEmail: requestorEmail,
          department: requestBeforeUpdate.department,
          deviceType: requestBeforeUpdate.deviceType,
          deviceName: requestBeforeUpdate.deviceName,
          purpose: requestBeforeUpdate.purpose,
          dateNeeded: requestBeforeUpdate.dateNeeded,
          adminNote: note?.trim() ?? null,
          adminEmail: currentAdmin,
        });

        if (!managerEmailResult.ok) {
          console.error("updateRequestStatus manager email error:", managerEmailResult.error);
        }
      }

      const request = listRequests().find((r) => r.id === requestId);
      const to = requestBeforeUpdate?.employeeEmail?.trim() || (request ? await resolveRequestorEmail(request) : "");

      if (!to) {
        const message = `Could not resolve requestor email for request ${requestId}.`;
        console.warn("updateRequestStatus email skipped:", message);
        await syncFromAppwrite();
        return { ok: true, warning: message };
      }

      const websiteUrl = getWebsiteUrl();
      const isApproved = status === "approved";
      const statusColor = isApproved ? "#2f7a45" : "#984040";
      const statusText = isApproved ? "Approved" : "Rejected";
      const actionMessage = isApproved 
        ? "Your request has been approved by the Admin and is now awaiting Manager review." 
        : "Your request has been rejected by the Admin.";

      const formattedDateNeeded = request ? formatDateTimeForEmail(request.dateNeeded) : "";
      const htmlBody = `
<html><body style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
  <h2 style="color: #253448; border-bottom: 3px solid #d8732c; padding-bottom: 10px;">DEVICE REQUEST STATUS</h2>
  
  <p>Hello ${request?.employeeName ?? ""},</p>
  
  <div style="text-align: center; margin: 20px 0;">
    <span style="background: ${statusColor}; color: white; padding: 10px 20px; border-radius: 4px; font-weight: bold; display: inline-block;">${statusText}</span>
  </div>
  
  <p><b>${actionMessage}</b></p>
  
  <h3 style="color: #253448; margin-top: 20px;">REQUEST DETAILS</h3>
  <table style="width: 100%; border-collapse: collapse;">
    <tr><td style="padding: 8px; font-weight: bold; width: 35%;">Request ID:</td><td style="padding: 8px;">${requestId}</td></tr>
    ${request ? `
    <tr style="background: #f9f9f9;"><td style="padding: 8px; font-weight: bold;">Device:</td><td style="padding: 8px;">${request.deviceName} (${request.model})</td></tr>
    <tr><td style="padding: 8px; font-weight: bold;">Type:</td><td style="padding: 8px;">${request.deviceType}</td></tr>
    <tr style="background: #f9f9f9;"><td style="padding: 8px; font-weight: bold;">Date Needed:</td><td style="padding: 8px;">${formattedDateNeeded}</td></tr>
    ` : ""}
  </table>
  
  ${note ? `<p style="background: #fffacd; border-left: 4px solid #d8732c; padding: 12px; margin: 20px 0;"><b>Admin Note:</b> ${note}</p>` : ""}
  
  <div style="text-align: center; margin: 30px 0;">
    <a href="${websiteUrl}/employee/requests" style="background: #d8732c; color: white; padding: 10px 25px; text-decoration: none; border-radius: 4px; font-weight: bold;">View All Your Requests</a>
  </div>
  
  <p style="color: #666; font-size: 12px; margin-top: 30px; padding-top: 15px; border-top: 1px solid #ddd;">
    This is an automated message. Please do not reply.
  </p>
</body></html>
      `.trim();

      const emailPayload = {
        to,
        subject: `Your device request (${requestId}) has been ${status}`,
        text: `Hello ${request?.employeeName ?? ""},\n\nYour device request has been ${status}.\n\n${note ? `Admin note: ${note}` : "(No note provided)"}\n\nVisit ${websiteUrl}/employee/requests to view all your requests.\n\nRegards,\nAdmin Team`,
        html: htmlBody,
        replyTo: currentAdmin,
        allowExternalRecipients: true,
      };

      console.log("Sending requestor email with HTML:", {
        to,
        subject: emailPayload.subject,
        hasHtml: Boolean(emailPayload.html),
        htmlLength: emailPayload.html?.length,
      });

      const emailResult = await sendEmailViaExternalService(emailPayload);
      if (!emailResult.ok) {
        console.error("updateRequestStatus email error:", emailResult.error);
        await syncFromAppwrite();
        return { ok: false, error: emailResult.error };
      }

      await syncFromAppwrite();
      return { ok: true };
    } catch (error) {
      const message = extractErrorMessage(error, "Unable to send approval email.");
      console.error("updateRequestStatus email error:", message, error);
      await syncFromAppwrite();
      return { ok: false, error: message };
    }
  } catch (error) {
    const message = extractErrorMessage(error, "Unable to update request status.");
    console.error("updateRequestStatus Appwrite error:", message, error);
    return { ok: false, error: message };
  }
}

export async function updateManagerDecision(
  requestId: string,
  decision: "approved" | "rejected",
  note?: string,
  requestorEmail?: string,
): Promise<{ ok: true; warning?: string } | { ok: false; error: string }> {
  const managerApprovedAt = new Date().toISOString();

  withLocalRequests((requests) =>
    requests.map((request) => {
      if (request.id !== requestId) {
        return request;
      }

      return {
        ...request,
        managerDecision: decision,
        managerDecisionNote: decision === "rejected" ? note?.trim() ?? null : null,
        managerApprovedAt: decision === "approved" ? managerApprovedAt : request.managerApprovedAt,
      };
    }),
  );

  if (!isAppwriteDataConfigured()) {
    return { ok: true };
  }

  try {
    const databases = getAppwriteDatabases();
    const { databaseId, requestsCollectionId } = getAppwriteConfig();
    await databases.updateDocument(databaseId, requestsCollectionId, requestId, {
      managerDecision: decision,
      managerDecisionNote: decision === "rejected" ? note?.trim() ?? null : null,
      managerApprovedAt: decision === "approved" ? managerApprovedAt : null,
    });

    try {
      const request = listRequests().find((r) => r.id === requestId);
      const to = requestorEmail?.trim() || (request ? await resolveRequestorEmail(request) : "");

      if (!to) {
        const message = `Could not resolve requestor email for request ${requestId}.`;
        console.warn("updateManagerDecision email skipped:", message);
        await syncFromAppwrite();
        return { ok: true, warning: message };
      }

      const currentManager = (() => {
        try {
          const u = getCurrentUser();
          return u?.email ?? undefined;
        } catch {
          return undefined;
        }
      })();

      const emailResult = await sendEmailViaExternalService({
        to,
        subject: `Your device request (${requestId}) has been ${decision} by manager`,
        text: `Hello ${request?.employeeName ?? ""},\n\nYour device request has been ${decision} by the manager.\n\nManager note: ${note ?? "(none)"}\n\nRegards,\nManager Team`,
        replyTo: currentManager,
        allowExternalRecipients: true,
      });

      if (!emailResult.ok) {
        console.error("updateManagerDecision email error:", emailResult.error);
        await syncFromAppwrite();
        return { ok: false, error: emailResult.error };
      }

      await syncFromAppwrite();
      return { ok: true };
    } catch (error) {
      const message = extractErrorMessage(error, "Unable to send manager approval email.");
      console.error("updateManagerDecision email error:", message, error);
      await syncFromAppwrite();
      return { ok: false, error: message };
    }
  } catch (error) {
    const message = extractErrorMessage(error, "Unable to update manager decision.");
    console.error("updateManagerDecision Appwrite error:", message, error);
    return { ok: false, error: message };
  }
}

export function updateGuardDecision(
  requestId: string,
  decision: Exclude<GuardDecisionStatus, "pending">,
  note?: string,
) {
  const checkedAt = new Date().toISOString();

  withLocalRequests((requests) =>
    requests.map((request) => {
      if (request.id !== requestId) {
        return request;
      }

      return {
        ...request,
        guardDecision: decision,
        guardDecisionNote: decision === "held" ? note?.trim() ?? null : null,
        guardCheckedAt: checkedAt,
        returnStatus: decision === "held" ? "pending" : request.returnStatus,
        returnCheckedAt: decision === "held" ? null : request.returnCheckedAt,
        returnNote: decision === "held" ? null : request.returnNote,
      };
    }),
  );

  if (!isAppwriteDataConfigured()) {
    return;
  }

  const databases = getAppwriteDatabases();
  const { databaseId, requestsCollectionId } = getAppwriteConfig();
  void databases
    .updateDocument(databaseId, requestsCollectionId, requestId, {
      guardDecision: decision,
      guardDecisionNote: decision === "held" ? note?.trim() ?? null : null,
      guardCheckedAt: checkedAt,
      ...(decision === "held"
        ? {
            returnStatus: "pending",
            returnCheckedAt: null,
            returnNote: null,
          }
        : {}),
    })
    .then(() => syncFromAppwrite())
    .catch(() => undefined);
}

export function markLaptopAsReturned(requestId: string, note?: string) {
  const checkedAt = new Date().toISOString();

  withLocalRequests((requests) =>
    requests.map((request) => {
      if (request.id !== requestId) {
        return request;
      }

      const isLaptop = request.deviceType.toLowerCase() === "laptop";
      const isReleased = request.guardDecision === "released";
      const isAdminApproved = request.status === "approved";
      if (!isLaptop || !isReleased || !isAdminApproved) {
        return request;
      }

      return {
        ...request,
        returnStatus: "returned",
        returnCheckedAt: checkedAt,
        returnNote: note?.trim() ?? null,
      };
    }),
  );

  if (!isAppwriteDataConfigured()) {
    return;
  }

  const databases = getAppwriteDatabases();
  const { databaseId, requestsCollectionId } = getAppwriteConfig();
  void databases
    .updateDocument(databaseId, requestsCollectionId, requestId, {
      returnStatus: "returned",
      returnCheckedAt: checkedAt,
      returnNote: note?.trim() ?? null,
    })
    .then(() => syncFromAppwrite())
    .catch(() => undefined);
}

export function subscribePortalState(listener: () => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (!event.key) return;

    if ([USERS_KEY, REQUESTS_KEY, SESSION_KEY].includes(event.key)) {
      listener();
    }
  };

  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function getPortalSnapshot(): PortalSnapshot {
  if (typeof window === "undefined") {
    return serverSnapshot;
  }

  const rawUser = window.localStorage.getItem(SESSION_KEY) ?? "null";
  const rawRequests = window.localStorage.getItem(REQUESTS_KEY) ?? "[]";
  const signature = `${rawUser}|${rawRequests}`;

  if (signature === cachedSignature) {
    return cachedSnapshot;
  }

  let user: Omit<PortalUser, "password"> | null = null;
  let requests: DeviceRequest[] = [];

  try {
    user = JSON.parse(rawUser) as Omit<PortalUser, "password"> | null;
  } catch {
    user = null;
  }

  try {
    requests = (JSON.parse(rawRequests) as DeviceRequest[])
      .map((request) => normalizeRequest(request))
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  } catch {
    requests = [];
  }

  cachedSignature = signature;
  cachedSnapshot = { user, requests };
  return cachedSnapshot;
}

export function getPortalServerSnapshot(): PortalSnapshot {
  return serverSnapshot;
}
