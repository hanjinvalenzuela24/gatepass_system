"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { LoadingModal } from "@/app/components/loading-modal";
import {
  bootstrapMockData,
  getPortalServerSnapshot,
  getPortalSnapshot,
  getCurrentUser,
  logout,
  subscribePortalState,
  updateManagerDecision,
  type DeviceRequest,
} from "@/lib/portal";

type ManagerTab = "pending" | "approved" | "rejected";

function adminStatusClass(status: DeviceRequest["status"]) {
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

export default function ManagerPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ManagerTab>("pending");
  const [selectedRequest, setSelectedRequest] = useState<DeviceRequest | null>(null);
  const [rejectRequestId, setRejectRequestId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectError, setRejectError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [actionMessageType, setActionMessageType] = useState<"success" | "error" | "">("");
  const [isLoading, setIsLoading] = useState(false);
  const snapshot = useSyncExternalStore(
    subscribePortalState,
    getPortalSnapshot,
    getPortalServerSnapshot,
  );
  const sessionUser = snapshot.user;

  const adminApprovedRequests = useMemo(
    () => snapshot.requests.filter((request) => request.status === "approved"),
    [snapshot.requests],
  );

  const pendingManagerRequests = useMemo(
    () => adminApprovedRequests.filter((request) => request.managerDecision === "pending"),
    [adminApprovedRequests],
  );

  const approvedManagerRequests = useMemo(
    () => adminApprovedRequests.filter((request) => request.managerDecision === "approved"),
    [adminApprovedRequests],
  );

  const rejectedManagerRequests = useMemo(
    () => adminApprovedRequests.filter((request) => request.managerDecision === "rejected"),
    [adminApprovedRequests],
  );

  const activeManagerRequests = useMemo(() => {
    if (activeTab === "approved") return approvedManagerRequests;
    if (activeTab === "rejected") return rejectedManagerRequests;
    return pendingManagerRequests;
  }, [activeTab, approvedManagerRequests, pendingManagerRequests, rejectedManagerRequests]);

  useEffect(() => {
    bootstrapMockData();
    const current = getCurrentUser();
    if (!current) {
      router.replace("/login");
      return;
    }

    if (current.role !== "manager") {
      if (current.role === "employee") {
        router.replace("/employee");
        return;
      }

      if (current.role === "admin") {
        router.replace("/admin");
        return;
      }

      router.replace("/guard");
      return;
    }
  }, [router]);

  async function handleAction(requestId: string, nextDecision: "approved" | "rejected") {
    const targetRequest = adminApprovedRequests.find((request) => request.id === requestId);
    if (!targetRequest || targetRequest.managerDecision !== "pending") {
      return;
    }

    setActionMessage("");
    setActionMessageType("");

    if (nextDecision === "rejected") {
      setRejectRequestId(requestId);
      setRejectReason("");
      setRejectError("");
      return;
    }

    setIsLoading(true);
    try {
      const result = await updateManagerDecision(requestId, nextDecision, undefined, targetRequest.employeeEmail);
      if (result.ok) {
        setActionMessage(`Request ${requestId} approved by manager. Email sent to the requestor.`);
        setActionMessageType("success");
        return;
      }

      setActionMessage(result.error);
      setActionMessageType("error");
    } finally {
      setIsLoading(false);
    }
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
    setIsLoading(true);

    try {
      const rejectedRequest = adminApprovedRequests.find((request) => request.id === rejectRequestId);
      const result = await updateManagerDecision(rejectRequestId, "rejected", reason, rejectedRequest?.employeeEmail);
      if (result.ok) {
        setActionMessage(`Request ${rejectRequestId} rejected by manager. Email sent to the requestor.`);
        setActionMessageType("success");
      } else {
        setActionMessage(result.error);
        setActionMessageType("error");
      }
    } finally {
      setIsLoading(false);
    }

    closeRejectModal();
  }

  function onLogout() {
    logout();
    router.replace("/login");
  }

  const loadingMessage = isLoading ? "Processing manager approval..." : undefined;

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-10">
      <LoadingModal open={isLoading} message="Processing manager approval..." />
      <header className="card fade-in-up mb-5 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#6f7e93]">
            Manager Dashboard
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

      <section className="card fade-in-up p-4 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[#253448]">Manager Dashboard</h2>
            <p className="text-sm text-[#5d6b80]">
              Review devices approved by admin and decide whether they can be released.
            </p>
          </div>
          <p className="text-xs font-mono uppercase tracking-[0.08em] text-[#7a879a]">
            Live Local Updates
          </p>
        </div>

        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { title: "Ready for Review", value: pendingManagerRequests.length, label: "Waiting on manager", color: "bg-[#fff4e8] text-[#9d6b16]" },
            { title: "Approved by Manager", value: approvedManagerRequests.length, label: "Ready for pickup", color: "bg-[#ebf8ef] text-[#2f7a45]" },
            { title: "Rejected by Manager", value: rejectedManagerRequests.length, label: "Declined items", color: "bg-[#ffecec] text-[#984040]" },
            { title: "Admin Approved", value: adminApprovedRequests.length, label: "Total approved", color: "bg-[#f2f4ff] text-[#3b4d7d]" },
          ].map((card) => (
            <div key={card.title} className="rounded-3xl border border-[#e0d6c6] bg-white p-5 shadow-[0_14px_30px_rgba(45,50,71,0.08)]">
              <p className="text-xs font-medium uppercase tracking-[0.23em] text-[#7a879a]">{card.title}</p>
              <p className="mt-4 text-4xl font-semibold text-[#253448]">{card.value}</p>
              <p className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${card.color}`}>{card.label}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="card fade-in-up p-4 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[#253448]">Admin-Approved Requests</h2>
            <p className="text-sm text-[#5d6b80]">
              Review pending items or switch to the reviewed tab to revisit approved and rejected decisions.
            </p>
          </div>
          <p className="text-xs font-mono uppercase tracking-[0.08em] text-[#7a879a]">
            Live Local Updates
          </p>
        </div>

        <div className="mb-5 inline-flex rounded-2xl border border-[#d7c7ae] bg-[#f6efe2] p-1">
          <button
            type="button"
            onClick={() => setActiveTab("pending")}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
              activeTab === "pending" ? "bg-[#253448] text-white" : "text-[#42556d] hover:bg-[#ece2d2]"
            }`}
          >
            Pending ({pendingManagerRequests.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("approved")}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
              activeTab === "approved" ? "bg-[#253448] text-white" : "text-[#42556d] hover:bg-[#ece2d2]"
            }`}
          >
            Approved ({approvedManagerRequests.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("rejected")}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
              activeTab === "rejected" ? "bg-[#253448] text-white" : "text-[#42556d] hover:bg-[#ece2d2]"
            }`}
          >
            Rejected ({rejectedManagerRequests.length})
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

        {adminApprovedRequests.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[#dbcdb8] bg-[#fffdf8] p-3 text-sm text-[#627188]">
            No requests approved by admin yet.
          </p>
        ) : activeTab === "pending" ? (
          pendingManagerRequests.length === 0 ? (
            <p className="rounded-lg border border-dashed border-[#dbcdb8] bg-[#fffdf8] p-3 text-sm text-[#627188]">
              No pending manager requests.
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
                    <th className="px-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingManagerRequests.map((request) => (
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
                        <p className="text-xs text-[#6f7e93]">Asset: {request.assetTag} | Inclusions: {request.inclusions}</p>
                      </td>
                      <td className="max-w-xs border-y border-[#e6d9c5] px-3 py-3 text-xs sm:text-sm">
                        <p>{request.purpose}</p>
                      </td>
                      <td className="border-y border-[#e6d9c5] px-3 py-3">{request.dateNeeded.replace("T", " ")}</td>
                      <td className="rounded-r-xl border-y border-r border-[#e6d9c5] px-3 py-3">
                        <div className="flex gap-2" onClick={(event) => event.stopPropagation()}>
                          <button
                            onClick={() => handleAction(request.id, "approved")}
                            className="btn-action btn-action-success"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleAction(request.id, "rejected")}
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
          )
        ) : activeManagerRequests.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[#dbcdb8] bg-[#fffdf8] p-3 text-sm text-[#627188]">
            No {activeTab} manager requests yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-y-3 text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-[0.08em] text-[#7a879a]">
                  <th className="px-3">Employee</th>
                  <th className="px-3">Device</th>
                  <th className="px-3">Manager Decision</th>
                  <th className="px-3">Date and Time Needed</th>
                </tr>
              </thead>
              <tbody>
                {activeManagerRequests.map((request) => (
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
                      <p className="text-xs text-[#6f7e93]">Asset: {request.assetTag}</p>
                    </td>
                    <td className="border-y border-[#e6d9c5] px-3 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${managerStatusClass(request.managerDecision)}`}
                      >
                        {request.managerDecision}
                      </span>
                    </td>
                    <td className="rounded-r-xl border-y border-r border-[#e6d9c5] px-3 py-3">{request.dateNeeded.replace("T", " ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

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
                <span className="font-semibold text-[#2e3f55]">Admin Status:</span>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${adminStatusClass(selectedRequest.status)}`}>
                  {selectedRequest.status}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm text-[#4b5f78]">
                <span className="font-semibold text-[#2e3f55]">Manager Status:</span>
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
              <p className="mt-3 rounded-md bg-[#fff0e5] px-3 py-2 text-sm text-[#7a5a2f]">
                Admin note: {selectedRequest.adminDecisionNote}
              </p>
            ) : null}

            {selectedRequest.managerDecisionNote ? (
              <p className="mt-2 rounded-md bg-[#ffecec] px-3 py-2 text-sm text-[#933f3f]">
                Manager rejection note: {selectedRequest.managerDecisionNote}
              </p>
            ) : null}
          </section>
        </div>
      ) : null}
    </main>
  );
}
