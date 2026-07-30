"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { isAppwriteConfigured } from "@/lib/appwrite";
import {
  bootstrapMockData,
  createManagedAccount,
  getPortalServerSnapshot,
  getPortalSnapshot,
  getCurrentUser,
  listAllUsers,
  listAppwriteUsers,
  logout,
  subscribePortalState,
  updateAccountApproval,
  updateRequestStatus,
  type DeviceRequest,
  type PortalUser,
  type UserRole,
} from "@/lib/portal";

type AdminTab = "dashboard" | "requests" | "accounts";
type RequestStatusTab = "pending" | "approved" | "rejected";

const roleOptions: Array<{ label: string; value: UserRole; helper: string }> = [
  { label: "Employee", value: "employee", helper: "No label needed; this is the default." },
  { label: "Admin", value: "admin", helper: "Saved as the admin label." },
  { label: "Manager", value: "manager", helper: "Saved as the manager label." },
  { label: "Guard", value: "guard", helper: "Saved as the guard label." },
];

function statusClass(status: DeviceRequest["status"]) {
  if (status === "approved") return "bg-[#ebf8ef] text-[#2f7a45]";
  if (status === "rejected") return "bg-[#ffe9e9] text-[#984040]";
  return "bg-[#fff2dd] text-[#9d6b16]";
}

function managerStatusClass(status: DeviceRequest["managerDecision"]) {
  if (status === "approved") return "bg-[#e8f8ee] text-[#2f7a45]";
  if (status === "rejected") return "bg-[#ffe9e9] text-[#9d3e3e]";
  return "bg-[#fff2dd] text-[#9d6b16]";
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value.replace("T", " ");
  }
  return date.toLocaleString();
}

export default function AdminPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<AdminTab>("dashboard");
  const [activeRequestTab, setActiveRequestTab] = useState<RequestStatusTab>("pending");
  const [selectedRequest, setSelectedRequest] = useState<DeviceRequest | null>(null);
  const [rejectRequestId, setRejectRequestId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectError, setRejectError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [actionMessageType, setActionMessageType] = useState<"success" | "error" | "">("");
  const [accountName, setAccountName] = useState("");
  const [accountEmail, setAccountEmail] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [confirmAccountPassword, setConfirmAccountPassword] = useState("");
  const [accountRole, setAccountRole] = useState<UserRole>("employee");
  const [accountDepartment, setAccountDepartment] = useState("");
  const [accountError, setAccountError] = useState("");
  const [accountSuccess, setAccountSuccess] = useState("");
  const [pendingApprovalNote, setPendingApprovalNote] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [accountActionMessage, setAccountActionMessage] = useState("");
  const [accountActionType, setAccountActionType] = useState<"success" | "error" | "">("");
  const [accounts, setAccounts] = useState<PortalUser[]>(() => listAllUsers());
  const snapshot = useSyncExternalStore(
    subscribePortalState,
    getPortalSnapshot,
    getPortalServerSnapshot,
  );

  const loadAccounts = useCallback(async () => {
    if (!isAppwriteConfigured()) {
      setAccounts(listAllUsers());
      return;
    }

    try {
      const appwriteAccounts = await listAppwriteUsers();
      setAccounts(appwriteAccounts.length > 0 ? appwriteAccounts : listAllUsers());
    } catch {
      setAccounts(listAllUsers());
    }
  }, []);
  const sessionUser = snapshot.user;
  const requests = useMemo(() => snapshot.requests, [snapshot.requests]);
  const pendingAccounts = useMemo(() => accounts.filter((account) => account.status === "pending"), [accounts]);
  const approvedAccounts = useMemo(() => accounts.filter((account) => account.status === "approved"), [accounts]);
  const rejectedAccounts = useMemo(() => accounts.filter((account) => account.status === "rejected"), [accounts]);
  const pendingRequests = useMemo(() => requests.filter((request) => request.status === "pending"), [requests]);
  const approvedRequests = useMemo(() => requests.filter((request) => request.status === "approved"), [requests]);
  const rejectedRequests = useMemo(() => requests.filter((request) => request.status === "rejected"), [requests]);
  const activeRequests = useMemo(() => {
    if (activeRequestTab === "approved") return approvedRequests;
    if (activeRequestTab === "rejected") return rejectedRequests;
    return pendingRequests;
  }, [activeRequestTab, approvedRequests, pendingRequests, rejectedRequests]);

  useEffect(() => {
    bootstrapMockData();
    void loadAccounts();

    const current = getCurrentUser();
    if (!current) {
      router.replace("/login");
      return;
    }

    if (current.role !== "admin") {
      if (current.role === "employee") {
        router.replace("/employee");
        return;
      }

      if (current.role === "manager") {
        router.replace("/manager");
        return;
      }

      router.replace("/guard");
      return;
    }
  }, [loadAccounts, router]);

  useEffect(() => {
    const unsubscribe = subscribePortalState(() => {
      void loadAccounts();
    });
    return unsubscribe;
  }, [loadAccounts]);

  async function handleAction(requestId: string, nextStatus: "approved" | "rejected") {
    const targetRequest = requests.find((request) => request.id === requestId);
    if (!targetRequest || targetRequest.status !== "pending") {
      return;
    }

    setActionMessage("");
    setActionMessageType("");

    if (nextStatus === "rejected") {
      setRejectRequestId(requestId);
      setRejectReason("");
      setRejectError("");
      return;
    }

    const result = await updateRequestStatus(requestId, nextStatus);
    if (result.ok) {
      setActionMessage(`Request ${requestId} approved. Email sent to the requestor.`);
      setActionMessageType("success");
      return;
    }

    setActionMessage(result.error);
    setActionMessageType("error");
  }

  function closeRejectModal() {
    setRejectRequestId(null);
    setRejectReason("");
    setRejectError("");
  }

  async function confirmReject() {
    if (!rejectRequestId) return;

    const reason = rejectReason.trim();
    if (!reason) {
      setRejectError("Rejection reason is required.");
      return;
    }

    setActionMessage("");
    setActionMessageType("");

    const result = await updateRequestStatus(rejectRequestId, "rejected", reason);
    if (result.ok) {
      setActionMessage(`Request ${rejectRequestId} rejected. Email sent to the requestor.`);
      setActionMessageType("success");
    } else {
      setActionMessage(result.error);
      setActionMessageType("error");
    }

    closeRejectModal();
  }

  async function onCreateAccountSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAccountError("");
    setAccountSuccess("");

    if (accountPassword !== confirmAccountPassword) {
      setAccountError("Passwords do not match.");
      return;
    }

    const result = await createManagedAccount({
      name: accountName,
      email: accountEmail,
      password: accountPassword,
      role: accountRole,
      department: accountDepartment,
    });

    if (!result.ok) {
      setAccountError(result.error);
      return;
    }

    setAccountSuccess(`Created ${result.user.name} as ${result.user.role} for ${result.user.department}.`);
    setAccountName("");
    setAccountEmail("");
    setAccountPassword("");
    setConfirmAccountPassword("");
    setAccountRole("employee");
    setAccountDepartment("");
    void loadAccounts();
  }

  async function handleAccountApproval(userId: string, status: "approved" | "rejected") {
    setAccountActionMessage("");
    setAccountActionType("");

    if (status === "rejected") {
      setSelectedAccountId(userId);
      setPendingApprovalNote("");
      return;
    }

    const result = await updateAccountApproval(userId, status);
    if (result.ok) {
      setAccountActionMessage(`User account approved.`);
      setAccountActionType("success");
      void loadAccounts();
      return;
    }

    setAccountActionMessage(result.error);
    setAccountActionType("error");
  }

  async function confirmAccountReject() {
    if (!selectedAccountId) return;

    const note = pendingApprovalNote.trim();
    if (!note) {
      setAccountActionMessage("Rejection note is required.");
      setAccountActionType("error");
      return;
    }

    const result = await updateAccountApproval(selectedAccountId, "rejected", note);
    if (result.ok) {
      setAccountActionMessage(`User account rejected.`);
      setAccountActionType("success");
      setAccounts(listAllUsers());
    } else {
      setAccountActionMessage(result.error);
      setAccountActionType("error");
    }

    setSelectedAccountId(null);
    setPendingApprovalNote("");
  }

  function closeAccountRejectModal() {
    setSelectedAccountId(null);
    setPendingApprovalNote("");
    setAccountActionMessage("");
    setAccountActionType("");
  }

  function onLogout() {
    logout();
    router.replace("/login");
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-10">
      <header className="card fade-in-up mb-5 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#6f7e93]">
            Admin Dashboard
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-[#253448]">
            Device Gatepass Approval Board
          </h1>
          <p className="text-sm text-[#5c6a7f]">
            Signed in as {sessionUser?.name || "..."}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/" className="btn-ghost">
            Home
          </Link>
          <button onClick={onLogout} className="btn-primary">
            Logout
          </button>
        </div>
      </header>

      <div className="mb-5 inline-flex rounded-2xl border border-[#d7c7ae] bg-[#f6efe2] p-1">
        <button
          type="button"
          onClick={() => setActiveTab("dashboard")}
          className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
            activeTab === "dashboard" ? "bg-[#253448] text-white" : "text-[#42556d] hover:bg-[#ece2d2]"
          }`}
        >
          Dashboard
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("requests")}
          className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
            activeTab === "requests" ? "bg-[#253448] text-white" : "text-[#42556d] hover:bg-[#ece2d2]"
          }`}
        >
          Requests
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("accounts")}
          className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
            activeTab === "accounts" ? "bg-[#253448] text-white" : "text-[#42556d] hover:bg-[#ece2d2]"
          }`}
        >
          Accounts
        </button>
      </div>

      {activeTab === "dashboard" ? (
      <section className="card fade-in-up p-4 sm:p-6">
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { title: "Pending Requests", value: pendingRequests.length, label: "Need admin review", color: "bg-[#fff4e8] text-[#9d6b16]" },
            { title: "Approved Requests", value: approvedRequests.length, label: "Completed approvals", color: "bg-[#ebf8ef] text-[#2f7a45]" },
            { title: "Rejected Requests", value: rejectedRequests.length, label: "Declined by admin", color: "bg-[#ffecec] text-[#984040]" },
            { title: "Pending Registrations", value: pendingAccounts.length, label: "Awaiting admin approval", color: "bg-[#f2f4ff] text-[#3b4d7d]" },
          ].map((card) => (
            <div key={card.title} className="rounded-3xl border border-[#e0d6c6] bg-white p-5 shadow-[0_14px_30px_rgba(45,50,71,0.08)]">
              <p className="text-xs font-medium uppercase tracking-[0.23em] text-[#7a879a]">{card.title}</p>
              <p className="mt-4 text-4xl font-semibold text-[#253448]">{card.value}</p>
              <p className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${card.color}`}>{card.label}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-3xl border border-[#e0d6c6] bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-[#253448]">Recent Pending Requests</h2>
                <p className="text-sm text-[#5d6b80]">Top pending requests waiting for admin decision.</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab("requests")}
                className="text-sm font-semibold text-[#253448] underline"
              >
                View all
              </button>
            </div>
            {pendingRequests.length === 0 ? (
              <p className="rounded-2xl bg-[#f8f9fb] p-4 text-sm text-[#627188]">No pending requests at the moment.</p>
            ) : (
              <div className="space-y-3">
                {pendingRequests.slice(0, 3).map((request) => (
                  <div key={request.id} className="rounded-3xl border border-[#f1ece4] bg-[#fffdf8] p-4">
                    <p className="font-semibold text-[#253448]">{request.employeeName} — {request.deviceName}</p>
                    <p className="text-sm text-[#5d6b80]">{request.department} • {request.dateNeeded.replace("T", " ")}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-[#e0d6c6] bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-[#253448]">Pending Registrations</h2>
                <p className="text-sm text-[#5d6b80]">New accounts waiting for admin approval.</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab("accounts")}
                className="text-sm font-semibold text-[#253448] underline"
              >
                Review now
              </button>
            </div>
            {pendingAccounts.length === 0 ? (
              <p className="rounded-2xl bg-[#f8f9fb] p-4 text-sm text-[#627188]">No registration requests waiting for approval.</p>
            ) : (
              <div className="space-y-3">
                {pendingAccounts.slice(0, 3).map((account) => (
                  <div key={account.id} className="rounded-3xl border border-[#f1ece4] bg-[#f7f9ff] p-4">
                    <p className="font-semibold text-[#253448]">{account.name}</p>
                    <p className="text-sm text-[#5d6b80]">{account.email} • {account.role}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
      ) : activeTab === "requests" ? (
      <section className="card fade-in-up p-4 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[#253448]">Submitted Requests</h2>
            <p className="text-sm text-[#5d6b80]">
              Approve or reject each take-home laptop request. Click any row to view full details.
            </p>
          </div>
          <p className="text-xs font-mono uppercase tracking-[0.08em] text-[#7a879a]">
            Live Local Updates
          </p>
        </div>

        <div className="mb-4 inline-flex rounded-2xl border border-[#d7c7ae] bg-[#f6efe2] p-1">
          <button
            type="button"
            onClick={() => setActiveRequestTab("pending")}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
              activeRequestTab === "pending" ? "bg-[#253448] text-white" : "text-[#42556d] hover:bg-[#ece2d2]"
            }`}
          >
            Pending ({pendingRequests.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveRequestTab("approved")}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
              activeRequestTab === "approved" ? "bg-[#253448] text-white" : "text-[#42556d] hover:bg-[#ece2d2]"
            }`}
          >
            Approved ({approvedRequests.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveRequestTab("rejected")}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
              activeRequestTab === "rejected" ? "bg-[#253448] text-white" : "text-[#42556d] hover:bg-[#ece2d2]"
            }`}
          >
            Rejected ({rejectedRequests.length})
          </button>
        </div>

        {actionMessage ? (
          <p
            className={`mb-4 rounded-md px-3 py-2 text-sm ${
              actionMessageType === "success"
                ? "bg-[#ebf8ef] text-[#2f7a45]"
                : "bg-[#ffecec] text-[#933f3f]"
            }`}
          >
            {actionMessage}
          </p>
        ) : null}

        {activeRequests.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[#dbcdb8] bg-[#fffdf8] p-3 text-sm text-[#627188]">
            No {activeRequestTab} requests found.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-y-3 text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-[0.08em] text-[#7a879a]">
                  <th className="px-3">Employee</th>
                  <th className="px-3">Device</th>
                  <th className="px-3">Purpose</th>
                  <th className="px-3">Date and Time Needed</th>
                  <th className="px-3">Status</th>
                  <th className="px-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {activeRequests.map((request) => (
                  <tr
                    key={request.id}
                    className="cursor-pointer rounded-xl bg-[#fffdf7] text-[#37485f] transition hover:shadow-[0_8px_20px_rgba(62,53,31,0.08)]"
                    onClick={() => setSelectedRequest(request)}
                  >
                    <td className="rounded-l-xl border-y border-l border-[#e6d9c5] px-3 py-3">
                      <p className="font-semibold">{request.employeeName}</p>
                      <p className="text-xs text-[#6f7e93]">{request.department}</p>
                    </td>
                    <td className="border-y border-[#e6d9c5] px-3 py-3">
                      <p className="font-semibold">
                        {request.deviceName} ({request.model})
                      </p>
                      <p className="text-xs text-[#6f7e93]">Type: {request.deviceType} | Asset: {request.assetTag} | Inclusions: {request.inclusions}</p>
                    </td>
                    <td className="max-w-xs border-y border-[#e6d9c5] px-3 py-3 text-xs sm:text-sm">
                      <p>{request.purpose}</p>
                      {request.status === "rejected" && request.adminDecisionNote ? (
                        <p className="mt-1 rounded-md bg-[#ffecec] px-2 py-1 text-xs text-[#933f3f]">
                          Admin note: {request.adminDecisionNote}
                        </p>
                      ) : null}
                    </td>
                    <td className="border-y border-[#e6d9c5] px-3 py-3">{request.dateNeeded.replace("T", " ")}</td>
                    <td className="border-y border-[#e6d9c5] px-3 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${statusClass(request.status)}`}
                      >
                        {request.status}
                      </span>
                    </td>
                    <td className="rounded-r-xl border-y border-r border-[#e6d9c5] px-3 py-3">
                      <div className="flex gap-2" onClick={(event) => event.stopPropagation()}>
                        {(() => {
                          const isPending = request.status === "pending";
                          return (
                            <>
                        <button
                          disabled={!isPending}
                          onClick={() => handleAction(request.id, "approved")}
                          className="btn-action btn-action-success"
                        >
                          Approve
                        </button>
                        <button
                          disabled={!isPending}
                          onClick={() => handleAction(request.id, "rejected")}
                          className="btn-action btn-action-danger"
                        >
                          Reject
                        </button>
                            </>
                          );
                        })()}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      ) : (
      <section className="card fade-in-up p-4 sm:p-6">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[#253448]">Create Account & Manage Registrations</h2>
            <p className="text-sm text-[#5d6b80]">
              Create new accounts or approve/reject pending registrations from this panel.
            </p>
          </div>
          <p className="text-xs font-mono uppercase tracking-[0.08em] text-[#7a879a]">
            Admin Only
          </p>
        </div>

        <div className="mb-6 rounded-3xl border border-[#e0d6c6] bg-[#f8f9fb] p-5">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-[#253448]">Pending Registration Approvals</h3>
              <p className="text-sm text-[#5d6b80]">Review users who registered and are waiting for approval.</p>
            </div>
            <span className="rounded-full bg-[#eef2ff] px-3 py-1 text-xs font-semibold text-[#3b4d7d]">
              {pendingAccounts.length} pending
            </span>
          </div>
          {pendingAccounts.length === 0 ? (
            <p className="rounded-2xl bg-white p-4 text-sm text-[#627188]">No pending registration requests.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-y-3 text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-[0.08em] text-[#7a879a]">
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Email</th>
                    <th className="px-3 py-2">Role</th>
                    <th className="px-3 py-2">Department</th>
                    <th className="px-3 py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingAccounts.map((account) => (
                    <tr key={account.id} className="rounded-xl bg-[#fff] text-[#37485f] shadow-sm">
                      <td className="border-y border-[#e6d9c5] px-3 py-3">{account.name}</td>
                      <td className="border-y border-[#e6d9c5] px-3 py-3">{account.email}</td>
                      <td className="border-y border-[#e6d9c5] px-3 py-3 capitalize">{account.role}</td>
                      <td className="border-y border-[#e6d9c5] px-3 py-3">{account.department || "—"}</td>
                      <td className="border-y border-[#e6d9c5] px-3 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => handleAccountApproval(account.id, "approved")}
                            className="btn-action btn-action-success"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAccountApproval(account.id, "rejected")}
                            className="btn-action btn-action-danger"
                          >
                            Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {accountActionMessage ? (
          <p
            className={`mb-4 rounded-md px-3 py-2 text-sm ${
              accountActionType === "success"
                ? "bg-[#ebf8ef] text-[#2f7a45]"
                : "bg-[#ffecec] text-[#933f3f]"
            }`}
          >
            {accountActionMessage}
          </p>
        ) : null}

        <form onSubmit={onCreateAccountSubmit} className="grid gap-5 sm:grid-cols-2">
          <label className="block text-sm text-[#2f4561]">
            Full Name
            <input
              type="text"
              required
              value={accountName}
              onChange={(event) => setAccountName(event.target.value)}
              className="mt-2 h-[54px] w-full rounded-2xl border border-[#d2c4ad] bg-[#fffdf7] px-4 text-sm text-[#42556d] outline-none transition focus:border-[#c9724d] focus:shadow-[0_0_0_3px_rgba(216,91,44,0.15)]"
              placeholder="Juan Dela Cruz"
            />
          </label>

          <label className="block text-sm text-[#2f4561]">
            Email
            <input
              type="email"
              required
              value={accountEmail}
              onChange={(event) => setAccountEmail(event.target.value)}
              className="mt-2 h-[54px] w-full rounded-2xl border border-[#d2c4ad] bg-[#fffdf7] px-4 text-sm text-[#42556d] outline-none transition focus:border-[#c9724d] focus:shadow-[0_0_0_3px_rgba(216,91,44,0.15)]"
              placeholder="name@warehouse.local"
            />
          </label>

          <label className="block text-sm text-[#2f4561]">
            Password
            <input
              type="password"
              required
              minLength={6}
              value={accountPassword}
              onChange={(event) => setAccountPassword(event.target.value)}
              className="mt-2 h-[54px] w-full rounded-2xl border border-[#d2c4ad] bg-[#fffdf7] px-4 text-sm text-[#42556d] outline-none transition focus:border-[#c9724d] focus:shadow-[0_0_0_3px_rgba(216,91,44,0.15)]"
              placeholder="At least 6 characters"
            />
          </label>

          <label className="block text-sm text-[#2f4561]">
            Confirm Password
            <input
              type="password"
              required
              minLength={6}
              value={confirmAccountPassword}
              onChange={(event) => setConfirmAccountPassword(event.target.value)}
              className="mt-2 h-[54px] w-full rounded-2xl border border-[#d2c4ad] bg-[#fffdf7] px-4 text-sm text-[#42556d] outline-none transition focus:border-[#c9724d] focus:shadow-[0_0_0_3px_rgba(216,91,44,0.15)]"
              placeholder="Re-enter password"
            />
          </label>

          <label className="block text-sm text-[#2f4561]">
            Role
            <select
              value={accountRole}
              onChange={(event) => setAccountRole(event.target.value as UserRole)}
              className="mt-2 h-[54px] w-full rounded-2xl border border-[#d2c4ad] bg-[#fffdf7] px-4 text-sm text-[#42556d] outline-none transition focus:border-[#c9724d] focus:shadow-[0_0_0_3px_rgba(216,91,44,0.15)]"
            >
              {roleOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-[#6f7e93]">
              {roleOptions.find((option) => option.value === accountRole)?.helper}
            </p>
          </label>

          <label className="block text-sm text-[#2f4561]">
            Department
            <select
              required
              value={accountDepartment}
              onChange={(event) => setAccountDepartment(event.target.value)}
              className="mt-2 h-[54px] w-full rounded-2xl border border-[#d2c4ad] bg-[#fffdf7] px-4 text-sm text-[#42556d] outline-none transition focus:border-[#c9724d] focus:shadow-[0_0_0_3px_rgba(216,91,44,0.15)]"
            >
              <option value="">Select department</option>
              <option value="Operation Job Site (OJS)">Operation Job Site (OJS)</option>
              <option value="Operation Office Site (OOS)">Operation Office Site (OOS)</option>
              <option value="HR/GA">HR/GA</option>
              <option value="MIS">MIS</option>
              <option value="Finance">Finance</option>
              <option value="Manager">Manager</option>
              <option value="General Manager">General Manager</option>
            </select>
          </label>

          <div className="sm:col-span-2">
            {accountError ? (
              <p className="rounded-md bg-[#ffecec] px-3 py-2 text-sm text-[#933f3f]">
                {accountError}
              </p>
            ) : null}
            {accountSuccess ? (
              <p className="rounded-md bg-[#ebf8ef] px-3 py-2 text-sm text-[#2f7a45]">
                {accountSuccess}
              </p>
            ) : null}
          </div>

          <div className="sm:col-span-2 flex justify-end">
            <button type="submit" className="btn-primary">
              Create Account
            </button>
          </div>
        </form>
      </section>
      )}

      {rejectRequestId ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4"
          onClick={closeRejectModal}
        >
          <section
            className="card w-full max-w-lg p-5 sm:p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.08em] text-[#6f7e93]">
                  Reject Request
                </p>
                <h3 className="mt-1 text-xl font-semibold text-[#253448]">
                  Rejection Reason
                </h3>
              </div>
              <button
                className="btn-action btn-action-neutral"
                onClick={closeRejectModal}
              >
                Close
              </button>
            </div>

            <label className="block text-sm text-[#2f4561]">
              Reason
              <textarea
                value={rejectReason}
                onChange={(event) => {
                  setRejectReason(event.target.value);
                  if (rejectError) setRejectError("");
                }}
                rows={4}
                className="mt-2 w-full rounded-xl border border-[#d6c8b3] bg-[#fffdf7] px-3 py-2 text-sm text-[#42556d] outline-none focus:border-[#c9724d] focus:shadow-[0_0_0_3px_rgba(216,91,44,0.15)]"
                placeholder="Explain why this request is being rejected"
              />
            </label>

            {rejectError ? (
              <p className="mt-3 rounded-md bg-[#ffecec] px-3 py-2 text-sm text-[#933f3f]">
                {rejectError}
              </p>
            ) : null}

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={closeRejectModal}
                className="btn-action btn-action-neutral"
              >
                Cancel
              </button>
              <button
                onClick={confirmReject}
                className="btn-action btn-action-danger"
              >
                Confirm Reject
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {selectedAccountId ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4"
          onClick={closeAccountRejectModal}
        >
          <section
            className="card w-full max-w-lg p-5 sm:p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.08em] text-[#6f7e93]">
                  Reject Registration
                </p>
                <h3 className="mt-1 text-xl font-semibold text-[#253448]">
                  Rejection Note
                </h3>
              </div>
              <button
                className="btn-action btn-action-neutral"
                onClick={closeAccountRejectModal}
              >
                Close
              </button>
            </div>

            <label className="block text-sm text-[#2f4561]">
              Note
              <textarea
                value={pendingApprovalNote}
                onChange={(event) => {
                  setPendingApprovalNote(event.target.value);
                }}
                rows={4}
                className="mt-2 w-full rounded-xl border border-[#d6c8b3] bg-[#fffdf7] px-3 py-2 text-sm text-[#42556d] outline-none focus:border-[#c9724d] focus:shadow-[0_0_0_3px_rgba(216,91,44,0.15)]"
                placeholder="Explain why this registration cannot be approved"
              />
            </label>

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={closeAccountRejectModal}
                className="btn-action btn-action-neutral"
              >
                Cancel
              </button>
              <button
                onClick={confirmAccountReject}
                className="btn-action btn-action-danger"
              >
                Confirm Reject
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {selectedRequest ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4"
          onClick={() => setSelectedRequest(null)}
        >
          <section
            className="card w-full max-w-3xl p-5 sm:p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.08em] text-[#6f7e93]">
                  Request Details
                </p>
                <h3 className="mt-1 text-xl font-semibold text-[#253448]">
                  {selectedRequest.deviceName} ({selectedRequest.model})
                </h3>
              </div>
              <button
                className="btn-action btn-action-neutral"
                onClick={() => setSelectedRequest(null)}
              >
                Close
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <p className="text-sm text-[#4b5f78]"><span className="font-semibold text-[#2e3f55]">Employee:</span> {selectedRequest.employeeName}</p>
              <p className="text-sm text-[#4b5f78]"><span className="font-semibold text-[#2e3f55]">Department:</span> {selectedRequest.department}</p>
              <p className="text-sm text-[#4b5f78]"><span className="font-semibold text-[#2e3f55]">Device Type:</span> {selectedRequest.deviceType}</p>
              <p className="text-sm text-[#4b5f78]"><span className="font-semibold text-[#2e3f55]">Asset Tag:</span> {selectedRequest.assetTag}</p>
              <p className="text-sm text-[#4b5f78]"><span className="font-semibold text-[#2e3f55]">Inclusions:</span> {selectedRequest.inclusions}</p>
              <p className="text-sm text-[#4b5f78]"><span className="font-semibold text-[#2e3f55]">Needed:</span> {formatDateTime(selectedRequest.dateNeeded)}</p>
              <p className="text-sm text-[#4b5f78]"><span className="font-semibold text-[#2e3f55]">Submitted:</span> {formatDateTime(selectedRequest.createdAt)}</p>
              <div className="flex flex-wrap items-center gap-2 text-sm text-[#4b5f78]">
                <span className="font-semibold text-[#2e3f55]">Status:</span>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${statusClass(selectedRequest.status)}`}>
                  {selectedRequest.status}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm text-[#4b5f78]">
                <span className="font-semibold text-[#2e3f55]">Manager Decision:</span>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${managerStatusClass(selectedRequest.managerDecision)}`}>
                  {selectedRequest.managerDecision}
                </span>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-[#e6d9c5] bg-[#fffdf7] p-3">
              <p className="text-sm font-semibold text-[#2e3f55]">Purpose</p>
              <p className="mt-1 text-sm text-[#56667c]">{selectedRequest.purpose}</p>
            </div>

            {selectedRequest.adminDecisionNote ? (
              <p className="mt-3 rounded-md bg-[#ffecec] px-3 py-2 text-sm text-[#933f3f]">
                Admin rejection note: {selectedRequest.adminDecisionNote}
              </p>
            ) : null}

            {selectedRequest.guardDecisionNote ? (
              <p className="mt-2 rounded-md bg-[#ffecec] px-3 py-2 text-sm text-[#933f3f]">
                Guard note: {selectedRequest.guardDecisionNote}
              </p>
            ) : null}
          </section>
        </div>
      ) : null}
    </main>
  );
}