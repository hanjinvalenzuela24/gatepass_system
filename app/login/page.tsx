"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { LoadingModal } from "@/app/components/loading-modal";
import { bootstrapMockData, getCurrentUser, login, registerEmployee, type UserRole } from "@/lib/portal";

const roleOptions: Array<{ label: string; value: UserRole; helper: string }> = [
  { label: "Employee", value: "employee", helper: "Most users should register as employee; admin approval is still required." },
  { label: "Manager", value: "manager", helper: "Manager registrations require admin approval before login." },
  { label: "Admin", value: "admin", helper: "Admin registrations require admin approval before login." },
];

export default function LoginPage() {
  const router = useRouter();

  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<UserRole>("employee");
  const [department, setDepartment] = useState("");
  const [loginError, setLoginError] = useState("");
  const [registerError, setRegisterError] = useState("");
  const [registerSuccess, setRegisterSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    bootstrapMockData();
    const current = getCurrentUser();
    if (current?.role === "admin") {
      router.replace("/admin");
      return;
    }
    if (current?.role === "manager") {
      router.replace("/manager");
      return;
    }
    if (current?.role === "guard") {
      router.replace("/guard");
      return;
    }
    if (current?.role === "employee") {
      router.replace("/employee");
    }
  }, [router]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginError("");
    setIsLoading(true);

    const result = await login(email, password);
    setIsLoading(false);
    if (!result.ok) {
      setLoginError(result.error);
      return;
    }

    if (result.user.role === "admin") {
      router.push("/admin");
      return;
    }

    if (result.user.role === "manager") {
      router.push("/manager");
      return;
    }

    if (result.user.role === "guard") {
      router.push("/guard");
      return;
    }

    router.push("/employee");
  }

  async function onRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRegisterError("");
    setRegisterSuccess("");
    setIsLoading(true);

    if (!name.trim()) {
      setIsLoading(false);
      setRegisterError("Full name is required.");
      return;
    }

    if (!department.trim()) {
      setIsLoading(false);
      setRegisterError("Department is required.");
      return;
    }

    const result = await registerEmployee({
      name,
      email,
      password,
      role,
      department,
    });

    setIsLoading(false);
    if (!result.ok) {
      setRegisterError(result.error);
      return;
    }

    setRegisterSuccess(
      "Registration submitted successfully. Your account is pending admin approval before you can login.",
    );
    setEmail("");
    setPassword("");
    setName("");
    setDepartment("");
    setRole("employee");
    setIsRegistering(false);
  }

  return (
    <main className="relative flex min-h-screen w-full items-center justify-center overflow-hidden px-4 py-10">
      <div className="absolute inset-0 bg-[linear-gradient(90deg,#ebe2ca_0%,#ebe2ca_50%,#efd8c7_50%,#efd8c7_100%)]" />

      <LoadingModal open={isLoading} message="Processing your request..." />
      <section className="relative z-10 w-full max-w-[530px] rounded-3xl border border-[#e8ddd0] bg-[#f4f4f4] p-8 shadow-[0_12px_30px_rgba(82,66,44,0.08)] sm:p-10">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <Image
              src="/seiwa-kaiun-logo.png"
              alt="Seiwa Kaiun logo"
              width={56}
              height={56}
              className="rounded-full bg-white p-1"
            />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#a26843]">
                Seiwa Kaiun Philippines Inc.
              </p>
              <h2 className="mt-1 text-[clamp(1.9rem,3.2vw,2.35rem)] font-semibold leading-none text-[#1f3c63]">
                Gatepass System
              </h2>
            </div>
          </div>
          <div className="inline-flex overflow-hidden rounded-full border border-[#d2c4ad] bg-[#fffaf2] text-sm font-semibold text-[#42556d] shadow-[0_10px_24px_rgba(82,66,44,0.08)]">
            <button
              type="button"
              onClick={() => setIsRegistering(false)}
              className={`px-4 py-3 transition ${!isRegistering ? "bg-[#dc6534] text-white" : "hover:bg-[#f0e4d4]"}`}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => setIsRegistering(true)}
              className={`px-4 py-3 transition ${isRegistering ? "bg-[#dc6534] text-white" : "hover:bg-[#f0e4d4]"}`}
            >
              Register
            </button>
          </div>
        </div>

        <p className="max-w-md text-[clamp(0.95rem,1.55vw,1.1rem)] leading-tight text-[#617086]">
          {isRegistering
            ? "Register a new account with role selection. Every new account must be approved by admin before login."
            : "Use your company credentials to continue."}
        </p>

        {registerSuccess ? (
          <p className="mt-6 rounded-xl bg-[#ebf8ef] px-3 py-2 text-sm text-[#2f7a45]">
            {registerSuccess}
          </p>
        ) : null}

        <div className="mt-8">
          {isRegistering ? (
            <form onSubmit={onRegister} className="space-y-5">
              <label className="block text-[clamp(1rem,1.7vw,1.15rem)] text-[#224269]">
                Full Name
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-2 h-[54px] w-full rounded-2xl border border-[#d2c4ad] bg-[#f4f1eb] px-4 text-[clamp(0.95rem,1.5vw,1.1rem)] text-[#5f6f84] outline-none transition focus:border-[#c9724d] focus:shadow-[0_0_0_3px_rgba(216,91,44,0.15)]"
                  placeholder="Juan Dela Cruz"
                />
              </label>

              <label className="block text-[clamp(1rem,1.7vw,1.15rem)] text-[#224269]">
                Email
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-2 h-[54px] w-full rounded-2xl border border-[#d2c4ad] bg-[#f4f1eb] px-4 text-[clamp(0.95rem,1.5vw,1.1rem)] text-[#5f6f84] outline-none transition focus:border-[#c9724d] focus:shadow-[0_0_0_3px_rgba(216,91,44,0.15)]"
                  placeholder="name@warehouse.local"
                />
              </label>

              <label className="block text-[clamp(1rem,1.7vw,1.15rem)] text-[#224269]">
                Password
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-2 h-[54px] w-full rounded-2xl border border-[#d2c4ad] bg-[#f4f1eb] px-4 text-[clamp(0.95rem,1.5vw,1.1rem)] text-[#5f6f84] outline-none transition focus:border-[#c9724d] focus:shadow-[0_0_0_3px_rgba(216,91,44,0.15)]"
                  placeholder="At least 6 characters"
                />
              </label>

              <label className="block text-[clamp(1rem,1.7vw,1.15rem)] text-[#224269]">
                Role
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                  className="mt-2 h-[54px] w-full rounded-2xl border border-[#d2c4ad] bg-[#f4f1eb] px-4 text-[clamp(0.95rem,1.5vw,1.1rem)] text-[#5f6f84] outline-none transition focus:border-[#c9724d] focus:shadow-[0_0_0_3px_rgba(216,91,44,0.15)]"
                >
                  {roleOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-[clamp(1rem,1.7vw,1.15rem)] text-[#224269]">
                Department
                <select
                  required
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="mt-2 h-[54px] w-full rounded-2xl border border-[#d2c4ad] bg-[#f4f1eb] px-4 text-[clamp(0.95rem,1.5vw,1.1rem)] text-[#5f6f84] outline-none transition focus:border-[#c9724d] focus:shadow-[0_0_0_3px_rgba(216,91,44,0.15)]"
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

              {registerError ? (
                <p className="rounded-xl bg-[#ffe9e9] px-3 py-2 text-sm text-[#9e3636]">
                  {registerError}
                </p>
              ) : null}

              <button
                type="submit"
                className="h-[54px] w-full rounded-2xl bg-[#dc6534] text-[clamp(1rem,1.5vw,1.15rem)] font-semibold text-white transition hover:brightness-105"
              >
                Submit Registration
              </button>
            </form>
          ) : (
            <form onSubmit={onSubmit} className="space-y-5">
              <label className="block text-[clamp(1rem,1.7vw,1.15rem)] text-[#224269]">
                Email
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-2 h-[54px] w-full rounded-2xl border border-[#d2c4ad] bg-[#f4f1eb] px-4 text-[clamp(0.95rem,1.5vw,1.1rem)] text-[#5f6f84] outline-none transition focus:border-[#c9724d] focus:shadow-[0_0_0_3px_rgba(216,91,44,0.15)]"
                  placeholder="name@warehouse.local"
                />
              </label>

              <label className="block text-[clamp(1rem,1.7vw,1.15rem)] text-[#224269]">
                Password
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-2 h-[54px] w-full rounded-2xl border border-[#d2c4ad] bg-[#f4f1eb] px-4 text-[clamp(0.95rem,1.5vw,1.1rem)] text-[#5f6f84] outline-none transition focus:border-[#c9724d] focus:shadow-[0_0_0_3px_rgba(216,91,44,0.15)]"
                  placeholder="Enter your password"
                />
              </label>

              {loginError ? (
                <p className="rounded-xl bg-[#ffe9e9] px-3 py-2 text-sm text-[#9e3636]">
                  {loginError}
                </p>
              ) : null}

              <button
                type="submit"
                className="h-[54px] w-full rounded-2xl bg-[#dc6534] text-[clamp(1rem,1.5vw,1.15rem)] font-semibold text-white transition hover:brightness-105"
              >
                Continue
              </button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}