"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ErrorMessage } from "@/components/ui/error-message";
import { Field } from "@/components/ui/field";
import { homeFor, useAuth } from "@/lib/auth/auth-context";

export default function LoginPage() {
  const { state, login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (state.status === "authenticated") {
      router.replace(homeFor(state.user.role));
    }
  }, [state, router]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const user = await login(email, password);
      router.replace(homeFor(user.role));
    } catch (caught) {
      setError(caught);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main>
      <h1>CargoTrack</h1>
      <h2>Sign in</h2>
      <form onSubmit={submit}>
        <Field label="Email">
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>
        <br />
        <Field label="Password">
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>
        <br />
        <button type="submit" disabled={submitting}>
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <ErrorMessage error={error} />
    </main>
  );
}
