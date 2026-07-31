"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { jsPDF } from "jspdf";
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

function downloadRequestPdf(request: DeviceRequest) {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const margin = 40;
  const tableLeft = margin;
  const tableTop = 100;
  const labelWidth = 150;
  const valueWidth = 390;
  const rowHeight = 28;
  const tableWidth = labelWidth + valueWidth + 20;

  doc.setFontSize(18);
  doc.text("Gatepass Request Form", margin, 50);

  doc.setFontSize(11);
  doc.setFillColor(237, 243, 254);
  doc.rect(tableLeft, tableTop - rowHeight, tableWidth, rowHeight, "F");

  doc.setFont("helvetica", "bold");
  doc.setTextColor(33, 37, 41);
  doc.text("Field", tableLeft + 8, tableTop - 8);
  doc.text("Value", tableLeft + labelWidth + 12, tableTop - 8);
  doc.setFont("helvetica", "normal");

  const employeeEmail = request.employeeEmail.trim() || getCurrentUser()?.email?.trim() || "Not available";
  const rows = [
    ["Employee Name", request.employeeName],
    ["Employee Email", employeeEmail],
    ["Department", request.department],
    ["Device Type", request.deviceType],
    ["Device Name", request.deviceName],
    ["Model", request.model],
    ["Asset Tag", request.assetTag],
    ["Inclusions", request.inclusions],
    ["Purpose", request.purpose],
    ["Date Needed", formatDateTime(request.dateNeeded)],
    ["Status", request.status],
    ["Guard Decision", request.guardDecision],
    ["Created At", formatDateTime(request.createdAt)],
  ];

  rows.forEach(([label, value], index) => {
    const y = tableTop + index * rowHeight;
    if (index % 2 === 0) {
      doc.setFillColor(250, 250, 250);
      doc.rect(tableLeft, y, tableWidth, rowHeight, "F");
    }

    doc.setDrawColor(204);
    doc.setLineWidth(0.5);
    doc.line(tableLeft, y, tableLeft + tableWidth, y);

    doc.setFont("helvetica", "bold");
    doc.setTextColor(51, 65, 85);
    doc.text(label, tableLeft + 8, y + 18, { maxWidth: labelWidth - 12 });

    doc.setFont("helvetica", "normal");
    doc.setTextColor(74, 85, 104);
    doc.text(String(value), tableLeft + labelWidth + 12, y + 18, { maxWidth: valueWidth - 12 });
  });

  doc.setDrawColor(204);
  doc.setLineWidth(0.8);
  doc.line(tableLeft, tableTop, tableLeft, tableTop + rows.length * rowHeight);
  doc.line(tableLeft + labelWidth + 10, tableTop, tableLeft + labelWidth + 10, tableTop + rows.length * rowHeight);
  doc.line(tableLeft + tableWidth, tableTop, tableLeft + tableWidth, tableTop + rows.length * rowHeight);
  doc.line(tableLeft, tableTop + rows.length * rowHeight, tableLeft + tableWidth, tableTop + rows.length * rowHeight);

  doc.save(`gatepass-request-${request.id}.pdf`);
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

        <div className="mt-4 overflow-x-auto rounded-3xl border border-[#e6d9c5] bg-white shadow-sm">
          {requests.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-[#dbcdb8] bg-[#fffdf8] p-6 text-sm text-[#627188]">
              No requests yet. Submit your first laptop gatepass request.
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-[#dbcdb8] bg-[#fffdf8] p-6 text-sm text-[#627188]">
              No {activeRequestTab} requests found.
            </div>
          ) : (
            <table className="min-w-full border-separate border-spacing-0 text-left">
              <thead>
                <tr className="bg-[#f5f5f6] text-sm text-[#4b5563]">
                  <th className="border-b border-[#e2e8f0] px-4 py-4 font-medium">Request</th>
                  <th className="border-b border-[#e2e8f0] px-4 py-4 font-medium">Type / Asset</th>
                  <th className="border-b border-[#e2e8f0] px-4 py-4 font-medium">Status</th>
                  <th className="border-b border-[#e2e8f0] px-4 py-4 font-medium">Needed</th>
                  <th className="border-b border-[#e2e8f0] px-4 py-4 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredRequests.map((request) => (
                  <tr
                    key={request.id}
                    className="cursor-pointer border-b border-[#e2e8f0] transition hover:bg-[#faf9f4]"
                    onClick={() => setSelectedRequest(request)}
                  >
                    <td className="px-4 py-4 align-top">
                      <p className="font-semibold text-[#1f2937]">{request.deviceName} ({request.model})</p>
                      <p className="mt-1 text-sm text-[#525f7a]">{request.purpose}</p>
                    </td>
                    <td className="px-4 py-4 align-top text-sm text-[#525f7a]">
                      <p>{request.deviceType}</p>
                      <p className="mt-1 text-[#6b7280]">{request.assetTag}</p>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${getRequestStatusBadge(request).className}`}>
                          {getRequestStatusBadge(request).label}
                        </span>
                        {request.deviceType.toLowerCase() === "laptop" && request.guardDecision === "released" ? (
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${returnStatusClass(request.returnStatus)}`}>
                            return: {request.returnStatus}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-4 align-top text-sm text-[#525f7a]">{request.dateNeeded.replace("T", " ")}</td>
                    <td className="px-4 py-4 align-top">
                      {request.status === "approved" && request.guardDecision !== "held" ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            downloadRequestPdf(request);
                          }}
                          className="rounded-full border border-[#d7dce4] bg-white px-3 py-1 text-xs font-semibold text-[#253448] transition hover:bg-[#f5f7fb]"
                        >
                          Download Form
                        </button>
                      ) : (
                        <span className="text-sm text-[#6b7280]">View details</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
