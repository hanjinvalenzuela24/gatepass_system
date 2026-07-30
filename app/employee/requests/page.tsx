"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  bootstrapMockData,
  getPortalServerSnapshot,
  getPortalSnapshot,
  getCurrentUser,
  logout,
  subscribePortalState,
  type DeviceRequest,
} from "@/lib/portal";

function statusClass(status: DeviceRequest["status"]) {
  if (status === "approved") return "bg-[#ebf8ef] text-[#2f7a45]";
  if (status === "rejected") return "bg-[#ffe9e9] text-[#984040]";
  return "bg-[#fff2dd] text-[#9d6b16]";
}

function guardStatusClass(status: DeviceRequest["guardDecision"]) {
  if (status === "released") return "bg-[#ebf8ef] text-[#2f7a45]";
  if (status === "held") return "bg-[#ffe9e9] text-[#984040]";
  return "bg-[#fff2dd] text-[#9d6b16]";
}

function getRequestStatusBadge(request: DeviceRequest) {
  if (request.guardDecision === "held") {
    return {
      label: "guard held",
      className: guardStatusClass(request.guardDecision),
    };
  }

  return {
    label: request.status,
    className: statusClass(request.status),
  };
}

function returnStatusClass(status: DeviceRequest["returnStatus"]) {
  if (status === "returned") return "bg-[#ebf8ef] text-[#2f7a45]";
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

type EmployeeRequestTab = "pending" | "denied" | "approved";

export default function EmployeeAllRequestsPage() {
  const router = useRouter();
  const [selectedRequest, setSelectedRequest] = useState<DeviceRequest | null>(null);
  const [activeRequestTab, setActiveRequestTab] = useState<EmployeeRequestTab>("pending");
  const snapshot = useSyncExternalStore(
    subscribePortalState,
    getPortalSnapshot,
    getPortalServerSnapshot,
  );

  const sessionUser = snapshot.user;
  const requests = useMemo(() => {
    if (!sessionUser || sessionUser.role !== "employee") return [];
    return snapshot.requests.filter((r) => r.employeeId === sessionUser.id);
  }, [sessionUser, snapshot.requests]);

  const pendingRequests = useMemo(
    () => requests.filter((request) => request.status === "pending"),
    [requests],
  );

  const deniedRequests = useMemo(
    () => requests.filter(
      (request) => request.status === "rejected" || request.guardDecision === "held",
    ),
    [requests],
  );

  const approvedRequests = useMemo(
    () => requests.filter((request) => request.status === "approved" && request.guardDecision !== "held"),
    [requests],
  );

  const filteredRequests = useMemo(() => {
    if (activeRequestTab === "approved") return approvedRequests;
    if (activeRequestTab === "denied") return deniedRequests;
    return pendingRequests;
  }, [activeRequestTab, approvedRequests, deniedRequests, pendingRequests]);

  useEffect(() => {
    bootstrapMockData();
    const current = getCurrentUser();

    if (!current) {
      router.replace("/login");
      return;
    }

    if (current.role !== "employee") {
      if (current.role === "admin") {
        router.replace("/admin");
        return;
      }

      router.replace("/guard");
    }
  }, [router]);

  function onLogout() {
    logout();
    router.replace("/login");
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-10">
      <header className="card fade-in-up mb-5 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#6f7e93]">
            Employee Panel
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-[#253448]">All My Requests</h1>
          <p className="text-sm text-[#5c6a7f]">Signed in as {sessionUser?.name ?? "..."}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/employee" className="btn-ghost">
            Dashboard
          </Link>
          <Link href="/" className="btn-ghost">
            Home
          </Link>
          <button onClick={onLogout} className="btn-primary">
            Logout
          </button>
        </div>
      </header>

      <section className="card fade-in-up p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-[#253448]">Request History</h2>
        <p className="mt-1 text-sm text-[#5d6b80]">
          Full list of your submitted requests. Click any item to view detailed information.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveRequestTab("pending")}
            className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${
              activeRequestTab === "pending"
                ? "bg-[#253448] text-white"
                : "text-[#42556d] hover:bg-[#ece2d2]"
            }`}
          >
            Pending ({pendingRequests.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveRequestTab("denied")}
            className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${
              activeRequestTab === "denied"
                ? "bg-[#253448] text-white"
                : "text-[#42556d] hover:bg-[#ece2d2]"
            }`}
          >
            Request Denied ({deniedRequests.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveRequestTab("approved")}
            className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${
              activeRequestTab === "approved"
                ? "bg-[#253448] text-white"
                : "text-[#42556d] hover:bg-[#ece2d2]"
            }`}
          >
            Approved ({approvedRequests.length})
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {requests.length === 0 ? (
            <p className="rounded-lg border border-dashed border-[#dbcdb8] bg-[#fffdf8] p-3 text-sm text-[#627188]">
              No requests yet. Submit your first laptop gatepass request.
            </p>
          ) : filteredRequests.length === 0 ? (
            <p className="rounded-lg border border-dashed border-[#dbcdb8] bg-[#fffdf8] p-3 text-sm text-[#627188]">
              No {activeRequestTab} requests found.
            </p>
          ) : (
            filteredRequests.map((request) => (
              <article
                key={request.id}
                className="cursor-pointer rounded-xl border border-[#e6d9c5] bg-[#fffdf7] p-3 transition hover:shadow-[0_8px_20px_rgba(62,53,31,0.08)]"
                onClick={() => setSelectedRequest(request)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-[#2f3f55]">
                      {request.deviceName} ({request.model})
                    </p>
                    <p className="text-xs text-[#6f7e93]">
                      Type: {request.deviceType} | Asset: {request.assetTag} | Inclusions: {request.inclusions}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${getRequestStatusBadge(request).className}`}>
                      {getRequestStatusBadge(request).label}
                    </span>
                    {request.deviceType.toLowerCase() === "laptop" && request.guardDecision === "released" ? (
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${returnStatusClass(request.returnStatus)}`}
                      >
                        return: {request.returnStatus}
                      </span>
                    ) : null}
                  </div>
                </div>
                <p className="mt-2 text-sm text-[#56667c]">{request.purpose}</p>
                {request.status === "rejected" && request.adminDecisionNote ? (
                  <p className="mt-2 rounded-md bg-[#ffecec] px-2 py-1 text-xs text-[#933f3f]">
                    Admin rejection note: {request.adminDecisionNote}
                  </p>
                ) : null}
                {request.guardDecision === "held" && request.guardDecisionNote ? (
                  <p className="mt-2 rounded-md bg-[#ffecec] px-2 py-1 text-xs text-[#933f3f]">
                    Guard hold note: {request.guardDecisionNote}
                  </p>
                ) : null}
                <p className="mt-2 text-xs text-[#8190a3]">Needed: {request.dateNeeded.replace("T", " ")}</p>
              </article>
            ))
          )}
        </div>
      </section>

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
              <p className="text-sm text-[#4b5f78]"><span className="font-semibold text-[#2e3f55]">Returned Checked:</span> {formatDateTime(selectedRequest.returnCheckedAt)}</p>
              <div className="flex flex-wrap items-center gap-2 text-sm text-[#4b5f78]">
                <span className="font-semibold text-[#2e3f55]">Status:</span>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${getRequestStatusBadge(selectedRequest).className}`}>
                  {getRequestStatusBadge(selectedRequest).label}
                </span>
                {selectedRequest.deviceType.toLowerCase() === "laptop" && selectedRequest.guardDecision === "released" ? (
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${returnStatusClass(selectedRequest.returnStatus)}`}>
                    return: {selectedRequest.returnStatus}
                  </span>
                ) : null}
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

            {selectedRequest.returnNote ? (
              <p className="mt-2 rounded-md bg-[#eef3ff] px-3 py-2 text-sm text-[#3f4f7d]">
                Return note: {selectedRequest.returnNote}
              </p>
            ) : null}
          </section>
        </div>
      ) : null}
    </main>
  );
}
