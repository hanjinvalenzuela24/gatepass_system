"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  bootstrapMockData,
  getPortalServerSnapshot,
  getPortalSnapshot,
  getCurrentUser,
  logout,
  subscribePortalState,
  submitRequest,
  type DeviceRequest,
} from "@/lib/portal";

type FormValues = {
  department: string;
  deviceType: string;
  deviceName: string;
  model: string;
  assetTag: string;
  inclusions: string;
  purpose: string;
  dateNeeded: string;
};

const initialForm: FormValues = {
  department: "",
  deviceType: "",
  deviceName: "",
  model: "",
  assetTag: "",
  inclusions: "",
  purpose: "",
  dateNeeded: "",
};

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

export default function EmployeePage() {
  const router = useRouter();
  const [form, setForm] = useState<FormValues>(initialForm);
  const [submitError, setSubmitError] = useState("");
  const [selectedRequest, setSelectedRequest] = useState<DeviceRequest | null>(null);
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
  const recentRequests = useMemo(() => requests.slice(0, 3), [requests]);

  const canSubmit = useMemo(
    () => Object.values(form).every((v) => v.trim().length > 0),
    [form],
  );

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

      if (current.role === "manager") {
        router.replace("/manager");
        return;
      }

      router.replace("/guard");
      return;
    }
  }, [router]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError("");

    const employee = getCurrentUser();
    if (!employee || employee.role !== "employee") return;

    const result = await submitRequest({
      employeeId: employee.id,
      employeeName: employee.name,
      department: form.department,
      deviceType: form.deviceType,
      deviceName: form.deviceName,
      model: form.model,
      assetTag: form.assetTag,
      inclusions: form.inclusions,
      purpose: form.purpose,
      dateNeeded: form.dateNeeded,
    });

    if (!result.ok) {
      setSubmitError(result.error);
      return;
    }

    setForm(initialForm);
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
            Employee Panel
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-[#253448]">
            Gatepass Request Form
          </h1>
          <p className="text-sm text-[#5c6a7f]">
            Signed in as {sessionUser?.name ?? "..."}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/employee/requests" className="btn-ghost">
            All Requests
          </Link>
          <Link href="/" className="btn-ghost">
            Home
          </Link>
          <button onClick={onLogout} className="btn-primary">
            Logout
          </button>
        </div>
      </header>

      <section className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
        <form onSubmit={onSubmit} className="card fade-in-up p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-[#253448]">New Request</h2>
          <p className="mt-1 text-sm text-[#5d6b80]">
            Provide complete laptop details and business reason.
          </p>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="text-sm text-[#344359]">
              Department
              <select
                className="field mt-1"
                value={form.department}
                onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
              >
                <option value="">Select department</option>
                <option value="Operation Job Site (OJS)">Operation Job Site (OJS)</option>
                <option value="Operation Office Site (OOS)">Operation Office Site (OOS)</option>
                <option value="HR/GA">HR/GA</option>
                <option value="MIS">MIS</option>
                <option value="Finance">Finance</option>
                <option value="General Manager">General Manager</option>
              </select>
            </label>
            <label className="text-sm text-[#344359]">
              Date and Time Needed
              <input
                type="datetime-local"
                className="field mt-1"
                value={form.dateNeeded}
                onChange={(e) => setForm((f) => ({ ...f, dateNeeded: e.target.value }))}
              />
            </label>
            <label className="text-sm text-[#344359]">
              Device Name
              <input
                className="field mt-1"
                value={form.deviceName}
                onChange={(e) => setForm((f) => ({ ...f, deviceName: e.target.value }))}
                placeholder="Lenovo ThinkPad"
              />
            </label>
            <label className="text-sm text-[#344359]">
              Item Type
              <select
                className="field mt-1"
                value={form.deviceType}
                onChange={(e) => setForm((f) => ({ ...f, deviceType: e.target.value }))}
              >
                <option value="">Select device type</option>
                <option value="Laptop">Laptop</option>
                <option value="Company Cellphone">Company Cellphone</option>
                <option value="Tablet">Tablet</option>
                <option value="Other Company Device">Other Company Device</option>
              </select>
            </label>
            <label className="text-sm text-[#344359]">
              Model
              <input
                className="field mt-1"
                value={form.model}
                onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
                placeholder="T14 Gen 3"
              />
            </label>
            <label className="text-sm text-[#344359]">
              Asset Tag
              <input
                className="field mt-1"
                value={form.assetTag}
                onChange={(e) => setForm((f) => ({ ...f, assetTag: e.target.value }))}
                placeholder="IT 21 0023"
              />
            </label>
            <label className="text-sm text-[#344359] sm:col-span-2">
              Inclusions
              <input
                className="field mt-1"
                value={form.inclusions}
                onChange={(e) => setForm((f) => ({ ...f, inclusions: e.target.value }))}
                placeholder="Laptop charger, mouse, laptop bag"
              />
            </label>
            <label className="text-sm text-[#344359] sm:col-span-2">
              Purpose
              <textarea
                className="field mt-1 min-h-28"
                value={form.purpose}
                onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))}
                placeholder="Night shift stock reconciliation and report generation"
              />
            </label>
          </div>

          <button disabled={!canSubmit} className="btn-primary mt-5 w-full disabled:cursor-not-allowed disabled:opacity-55">
            Submit Request
          </button>
          {submitError ? (
            <p className="mt-3 rounded-md bg-[#ffecec] px-3 py-2 text-sm text-[#933f3f]">
              {submitError}
            </p>
          ) : null}
        </form>

        <section className="card fade-in-up p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-[#253448]">Recent Requests</h2>
          <p className="mt-1 text-sm text-[#5d6b80]">
            Showing your latest 3 requests. Use All Requests in the top navigation to view everything.
          </p>

          <div className="mt-4 space-y-3">
            {recentRequests.length === 0 ? (
              <p className="rounded-lg border border-dashed border-[#dbcdb8] bg-[#fffdf8] p-3 text-sm text-[#627188]">
                No requests yet. Submit your first laptop gatepass request.
              </p>
            ) : (
              recentRequests.map((request) => (
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