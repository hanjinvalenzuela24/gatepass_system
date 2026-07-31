"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { LoadingModal } from "@/app/components/loading-modal";
import {
  bootstrapMockData,
  getCurrentUser,
  getPortalServerSnapshot,
  getPortalSnapshot,
  logout,
  markLaptopAsReturned,
  subscribePortalState,
  updateGuardDecision,
  type DeviceRequest,
} from "@/lib/portal";

function adminStatusClass(status: DeviceRequest["status"]) {
  if (status === "approved") return "bg-[#ebf8ef] text-[#2f7a45]";
  if (status === "rejected") return "bg-[#ffe9e9] text-[#984040]";
  return "bg-[#fff2dd] text-[#9d6b16]";
}

function guardStatusClass(status: DeviceRequest["guardDecision"]) {
  if (status === "released") return "bg-[#e8f8ee] text-[#2f7a45]";
  if (status === "held") return "bg-[#ffe9e9] text-[#9d3e3e]";
  return "bg-[#fff2dd] text-[#9d6b16]";
}

function returnStatusClass(status: DeviceRequest["returnStatus"]) {
  if (status === "returned") return "bg-[#e8f8ee] text-[#2f7a45]";
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

type GuardDeskView = "gate" | "return";
type GuardRequestTab = "pending" | "approved" | "rejected";

export default function GuardPage() {
  const router = useRouter();
  const [activeDesk, setActiveDesk] = useState<GuardDeskView>("gate");
  const [activeRequestTab, setActiveRequestTab] = useState<GuardRequestTab>("pending");
  const [selectedRequest, setSelectedRequest] = useState<DeviceRequest | null>(null);
  const [holdRequestId, setHoldRequestId] = useState<string | null>(null);
  const [holdReason, setHoldReason] = useState("");
  const [holdError, setHoldError] = useState("");
  const [returnRequestId, setReturnRequestId] = useState<string | null>(null);
  const [returnNote, setReturnNote] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const snapshot = useSyncExternalStore(
    subscribePortalState,
    getPortalSnapshot,
    getPortalServerSnapshot,
  );
  const sessionUser = snapshot.user;

  const approvedRequests = useMemo(
    () => snapshot.requests.filter((request) => request.status === "approved" && request.managerDecision === "approved"),
    [snapshot.requests],
  );

  const pendingAtGate = useMemo(
    () => approvedRequests.filter((request) => request.guardDecision === "pending"),
    [approvedRequests],
  );

  const approvedAtGate = useMemo(
    () => approvedRequests.filter((request) => request.guardDecision === "released"),
    [approvedRequests],
  );

  const rejectedAtGate = useMemo(
    () => approvedRequests.filter((request) => request.guardDecision === "held"),
    [approvedRequests],
  );

  const activeGateRequests = useMemo(() => {
    if (activeRequestTab === "approved") return approvedAtGate;
    if (activeRequestTab === "rejected") return rejectedAtGate;
    return pendingAtGate;
  }, [activeRequestTab, approvedAtGate, pendingAtGate, rejectedAtGate]);

  const processedAtGate = useMemo(
    () => approvedRequests.filter((request) => request.guardDecision !== "pending"),
    [approvedRequests],
  );

  const releasedLaptopRequests = useMemo(
    () =>
      approvedRequests.filter(
        (request) =>
          request.guardDecision === "released" && request.deviceType.toLowerCase() === "laptop",
      ),
    [approvedRequests],
  );

  const pendingLaptopReturns = useMemo(
    () => releasedLaptopRequests.filter((request) => request.returnStatus !== "returned"),
    [releasedLaptopRequests],
  );

  const completedLaptopReturns = useMemo(
    () => releasedLaptopRequests.filter((request) => request.returnStatus === "returned"),
    [releasedLaptopRequests],
  );

  useEffect(() => {
    bootstrapMockData();
    const current = getCurrentUser();
    if (!current) {
      router.replace("/login");
      return;
    }

    if (current.role !== "guard") {
      if (current.role === "admin") {
        router.replace("/admin");
        return;
      }

      if (current.role === "manager") {
        router.replace("/manager");
        return;
      }

      router.replace("/employee");
      return;
    }
  }, [router]);

  function onLogout() {
    logout();
    router.replace("/login");
  }

  function handleGateAction(requestId: string, nextDecision: "released" | "held") {
    const targetRequest = approvedRequests.find((request) => request.id === requestId);
    if (!targetRequest || targetRequest.guardDecision !== "pending") {
      return;
    }

    if (nextDecision === "held") {
      setHoldRequestId(requestId);
      setHoldReason("");
      setHoldError("");
      return;
    }

    setIsLoading(true);
    try {
      updateGuardDecision(requestId, nextDecision);
    } finally {
      setIsLoading(false);
    }
  }

  function closeHoldModal() {
    setHoldRequestId(null);
    setHoldReason("");
    setHoldError("");
  }

  function confirmHold() {
    if (!holdRequestId) return;

    const reason = holdReason.trim();
    if (!reason) {
      setHoldError("Hold reason is required.");
      return;
    }

    setIsLoading(true);
    try {
      updateGuardDecision(holdRequestId, "held", reason);
    } finally {
      setIsLoading(false);
    }

    closeHoldModal();
  }

  function handleMarkReturned(requestId: string) {
    setReturnRequestId(requestId);
    setReturnNote("");
  }

  function closeReturnModal() {
    setReturnRequestId(null);
    setReturnNote("");
  }

  function confirmReturn() {
    if (!returnRequestId) return;
    setIsLoading(true);
    try {
      markLaptopAsReturned(returnRequestId, returnNote);
    } finally {
      setIsLoading(false);
    }
    closeReturnModal();
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-10">
      <LoadingModal open={isLoading} message="Processing guard action..." />
      <header className="card fade-in-up mb-5 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#6f7e93]">
            Guard Dashboard
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-[#253448]">
            Gate Monitoring and Release Approval
          </h1>
          <p className="text-sm text-[#5c6a7f]">
            Signed in as {sessionUser?.name || "..."}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/login" className="btn-ghost">
            Login
          </Link>
          <button onClick={onLogout} className="btn-primary">
            Logout
          </button>
        </div>
      </header>

      <section className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <article className="card p-4">
          <p className="text-xs font-mono uppercase tracking-[0.08em] text-[#7a879a]">Approved by Admin</p>
          <p className="mt-2 text-3xl font-semibold text-[#253448]">{approvedRequests.length}</p>
        </article>
        <article className="card p-4">
          <p className="text-xs font-mono uppercase tracking-[0.08em] text-[#7a879a]">Pending Gate Check</p>
          <p className="mt-2 text-3xl font-semibold text-[#9d6b16]">{pendingAtGate.length}</p>
        </article>
        <article className="card p-4">
          <p className="text-xs font-mono uppercase tracking-[0.08em] text-[#7a879a]">Processed by Guard</p>
          <p className="mt-2 text-3xl font-semibold text-[#2f7a45]">{processedAtGate.length}</p>
        </article>
        <article className="card p-4">
          <p className="text-xs font-mono uppercase tracking-[0.08em] text-[#7a879a]">Laptops Pending Return</p>
          <p className="mt-2 text-3xl font-semibold text-[#9d6b16]">{pendingLaptopReturns.length}</p>
        </article>
      </section>

      <section className="card mb-5 p-3 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-mono uppercase tracking-[0.08em] text-[#7a879a]">Workspace View</p>
            <h2 className="text-lg font-semibold text-[#253448]">Separate Desk Modes</h2>
            <p className="text-sm text-[#5d6b80]">Switch between gate release workflow and laptop return workflow.</p>
          </div>

          <div className="inline-flex rounded-xl border border-[#d7cab6] bg-[#fefaf1] p-1">
            <button
              onClick={() => setActiveDesk("gate")}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                activeDesk === "gate"
                  ? "bg-[#253448] text-white shadow-sm"
                  : "text-[#4f6075] hover:bg-[#f2ead9]"
              }`}
            >
              Gate Queue ({pendingAtGate.length} pending)
            </button>
            <button
              onClick={() => setActiveDesk("return")}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                activeDesk === "return"
                  ? "bg-[#253448] text-white shadow-sm"
                  : "text-[#4f6075] hover:bg-[#f2ead9]"
              }`}
            >
              Laptop Return Desk ({pendingLaptopReturns.length} out)
            </button>
          </div>
        </div>
      </section>

      {activeDesk === "gate" ? (
        <section className="card fade-in-up p-4 sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-[#253448]">Gate Queue</h2>
              <p className="text-sm text-[#5d6b80]">
                Monitor admin-approved requests and make final gate decision. Click any row to view full details.
              </p>
            </div>
            <p className="text-xs font-mono uppercase tracking-[0.08em] text-[#7a879a]">
              Pending: {pendingAtGate.length} | Processed: {processedAtGate.length}
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
              Pending ({pendingAtGate.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveRequestTab("approved")}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                activeRequestTab === "approved" ? "bg-[#253448] text-white" : "text-[#42556d] hover:bg-[#ece2d2]"
              }`}
            >
              Approved ({approvedAtGate.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveRequestTab("rejected")}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                activeRequestTab === "rejected" ? "bg-[#253448] text-white" : "text-[#42556d] hover:bg-[#ece2d2]"
              }`}
            >
              Rejected ({rejectedAtGate.length})
            </button>
          </div>

          {approvedRequests.length === 0 ? (
            <p className="rounded-lg border border-dashed border-[#dbcdb8] bg-[#fffdf8] p-3 text-sm text-[#627188]">
              No admin-approved requests available for guard monitoring.
            </p>
          ) : activeGateRequests.length === 0 ? (
            <p className="rounded-lg border border-dashed border-[#dbcdb8] bg-[#fffdf8] p-3 text-sm text-[#627188]">
              No {activeRequestTab} guard requests.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-y-3 text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-[0.08em] text-[#7a879a]">
                    <th className="px-3">Employee</th>
                    <th className="px-3">Device</th>
                    <th className="px-3">Needed</th>
                    <th className="px-3">Admin</th>
                    <th className="px-3">Guard</th>
                    <th className="px-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {activeGateRequests.map((request) => (
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
                        <p className="font-semibold">{request.deviceName} ({request.model})</p>
                        <p className="text-xs text-[#6f7e93]">Type: {request.deviceType} | Asset: {request.assetTag} | Inclusions: {request.inclusions}</p>
                      </td>
                      <td className="border-y border-[#e6d9c5] px-3 py-3">{request.dateNeeded.replace("T", " ")}</td>
                      <td className="border-y border-[#e6d9c5] px-3 py-3">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${adminStatusClass(request.status)}`}>
                          {request.status}
                        </span>
                      </td>
                      <td className="border-y border-[#e6d9c5] px-3 py-3">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${guardStatusClass(request.guardDecision)}`}>
                          {request.guardDecision}
                        </span>
                        {request.deviceType.toLowerCase() === "laptop" && request.guardDecision === "released" ? (
                          <p className="mt-1">
                            <span
                              className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${returnStatusClass(request.returnStatus)}`}
                            >
                              return: {request.returnStatus}
                            </span>
                          </p>
                        ) : null}
                        {request.guardDecision === "held" && request.guardDecisionNote ? (
                          <p className="mt-1 rounded-md bg-[#ffecec] px-2 py-1 text-xs text-[#933f3f]">
                            Guard note: {request.guardDecisionNote}
                          </p>
                        ) : null}
                      </td>
                      <td className="rounded-r-xl border-y border-r border-[#e6d9c5] px-3 py-3">
                        {request.guardDecision === "pending" ? (
                          <div className="flex gap-2" onClick={(event) => event.stopPropagation()}>
                            <button
                              onClick={() => handleGateAction(request.id, "released")}
                              className="btn-action btn-action-success"
                            >
                              Approve Release
                            </button>
                            <button
                              onClick={() => handleGateAction(request.id, "held")}
                              className="btn-action btn-action-danger"
                            >
                              Hold
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[#7a879a]">
                            Processed
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {activeDesk === "return" ? (
        <section className="card fade-in-up p-4 sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-[#253448]">Laptop Return Desk</h2>
              <p className="text-sm text-[#5d6b80]">
                Track released laptops, click any row to view full request details, and confirm they
                have been returned after borrowing.
              </p>
            </div>
            <p className="text-xs font-mono uppercase tracking-[0.08em] text-[#7a879a]">
              Out: {pendingLaptopReturns.length} | Returned: {completedLaptopReturns.length}
            </p>
          </div>

          {releasedLaptopRequests.length === 0 ? (
            <p className="rounded-lg border border-dashed border-[#dbcdb8] bg-[#fffdf8] p-3 text-sm text-[#627188]">
              No released laptops yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-y-3 text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-[0.08em] text-[#7a879a]">
                    <th className="px-3">Employee</th>
                    <th className="px-3">Laptop</th>
                    <th className="px-3">Released At</th>
                    <th className="px-3">Return Status</th>
                    <th className="px-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {releasedLaptopRequests.map((request) => {
                    const isReturned = request.returnStatus === "returned";

                    return (
                      <tr
                        key={`return-${request.id}`}
                        className="cursor-pointer rounded-xl bg-[#fffdf7] text-[#37485f] transition hover:shadow-[0_8px_20px_rgba(62,53,31,0.08)]"
                        onClick={() => setSelectedRequest(request)}
                      >
                        <td className="rounded-l-xl border-y border-l border-[#e6d9c5] px-3 py-3">
                          <p className="font-semibold">{request.employeeName}</p>
                          <p className="text-xs text-[#6f7e93]">{request.department}</p>
                        </td>
                        <td className="border-y border-[#e6d9c5] px-3 py-3">
                          <p className="font-semibold">{request.deviceName} ({request.model})</p>
                          <p className="text-xs text-[#6f7e93]">Asset: {request.assetTag} | Inclusions: {request.inclusions}</p>
                        </td>
                        <td className="border-y border-[#e6d9c5] px-3 py-3">
                          {formatDateTime(request.guardCheckedAt)}
                        </td>
                        <td className="border-y border-[#e6d9c5] px-3 py-3">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${returnStatusClass(request.returnStatus)}`}>
                            {request.returnStatus}
                          </span>
                          {request.returnNote ? (
                            <p className="mt-1 rounded-md bg-[#eef3ff] px-2 py-1 text-xs text-[#3f4f7d]">
                              Return note: {request.returnNote}
                            </p>
                          ) : null}
                        </td>
                        <td className="rounded-r-xl border-y border-r border-[#e6d9c5] px-3 py-3">
                          <button
                            disabled={isReturned}
                            onClick={(event) => {
                              event.stopPropagation();
                              handleMarkReturned(request.id);
                            }}
                            className="btn-action btn-action-success"
                          >
                            {isReturned ? "Returned" : "Return Device"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {returnRequestId ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4"
          onClick={closeReturnModal}
        >
          <section
            className="card w-full max-w-lg p-5 sm:p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.08em] text-[#6f7e93]">
                  Mark Laptop Return
                </p>
                <h3 className="mt-1 text-xl font-semibold text-[#253448]">
                  Return Confirmation
                </h3>
              </div>
              <button
                className="btn-action btn-action-neutral"
                onClick={closeReturnModal}
              >
                Close
              </button>
            </div>

            <label className="block text-sm text-[#2f4561]">
              Note (optional)
              <textarea
                value={returnNote}
                onChange={(event) => setReturnNote(event.target.value)}
                rows={4}
                className="mt-2 w-full rounded-xl border border-[#d6c8b3] bg-[#fffdf7] px-3 py-2 text-sm text-[#42556d] outline-none focus:border-[#c9724d] focus:shadow-[0_0_0_3px_rgba(216,91,44,0.15)]"
                placeholder="Condition, missing charger, scratches, etc."
              />
            </label>

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={closeReturnModal}
                className="btn-action btn-action-neutral"
              >
                Cancel
              </button>
              <button
                onClick={confirmReturn}
                className="btn-action btn-action-success"
              >
                Confirm Return
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {holdRequestId ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4"
          onClick={closeHoldModal}
        >
          <section
            className="card w-full max-w-lg p-5 sm:p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.08em] text-[#6f7e93]">
                  Hold Request
                </p>
                <h3 className="mt-1 text-xl font-semibold text-[#253448]">
                  Hold Reason
                </h3>
              </div>
              <button
                className="btn-action btn-action-neutral"
                onClick={closeHoldModal}
              >
                Close
              </button>
            </div>

            <label className="block text-sm text-[#2f4561]">
              Reason
              <textarea
                value={holdReason}
                onChange={(event) => {
                  setHoldReason(event.target.value);
                  if (holdError) setHoldError("");
                }}
                rows={4}
                className="mt-2 w-full rounded-xl border border-[#d6c8b3] bg-[#fffdf7] px-3 py-2 text-sm text-[#42556d] outline-none focus:border-[#c9724d] focus:shadow-[0_0_0_3px_rgba(216,91,44,0.15)]"
                placeholder="Explain why this request is being held at the gate"
              />
            </label>

            {holdError ? (
              <p className="mt-3 rounded-md bg-[#ffecec] px-3 py-2 text-sm text-[#933f3f]">
                {holdError}
              </p>
            ) : null}

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={closeHoldModal}
                className="btn-action btn-action-neutral"
              >
                Cancel
              </button>
              <button
                onClick={confirmHold}
                className="btn-action btn-action-danger"
              >
                Confirm Hold
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
              <p className="text-sm text-[#4b5f78]"><span className="font-semibold text-[#2e3f55]">Guard Checked:</span> {formatDateTime(selectedRequest.guardCheckedAt)}</p>
              <p className="text-sm text-[#4b5f78]"><span className="font-semibold text-[#2e3f55]">Returned Checked:</span> {formatDateTime(selectedRequest.returnCheckedAt)}</p>
              <div className="flex flex-wrap items-center gap-2 text-sm text-[#4b5f78]">
                <span className="font-semibold text-[#2e3f55]">Admin:</span>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${adminStatusClass(selectedRequest.status)}`}>
                  {selectedRequest.status}
                </span>
                <span className="font-semibold text-[#2e3f55]">Guard:</span>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${guardStatusClass(selectedRequest.guardDecision)}`}>
                  {selectedRequest.guardDecision}
                </span>
                {selectedRequest.deviceType.toLowerCase() === "laptop" && selectedRequest.guardDecision === "released" ? (
                  <>
                    <span className="font-semibold text-[#2e3f55]">Return:</span>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${returnStatusClass(selectedRequest.returnStatus)}`}>
                      {selectedRequest.returnStatus}
                    </span>
                  </>
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
