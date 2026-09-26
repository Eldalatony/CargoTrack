"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LogInIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { ErrorMessage } from "@/components/common/error-message";
import { FadeIn } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { ThemeMenu } from "@/components/layout/theme-menu";
import { homeFor, useAuth } from "@/lib/auth/auth-context";

const schema = z.object({
  email: z.email("Enter the email you sign in with."),
  password: z.string().min(1, "Enter your password."),
});

type Values = z.infer<typeof schema>;

export default function LoginPage() {
  const { state, login } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<unknown>(null);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  useEffect(() => {
    if (state.status === "authenticated") {
      router.replace(homeFor(state.user.role));
    }
  }, [state, router]);

  async function submit(values: Values) {
    setError(null);
    try {
      const user = await login(values.email, values.password);
      router.replace(homeFor(user.role));
    } catch (caught) {
      setError(caught);
    }
  }

  return (
    <div className="relative flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="absolute top-3 right-3">
        <ThemeMenu />
      </div>
      <FadeIn className="flex w-full max-w-[380px] flex-col gap-6">
        <div className="flex flex-col items-center gap-1 text-center">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl leading-none font-semibold tracking-tight">CargoTrack</span>
          </div>
          <p className="m-0 text-sm text-fg-secondary">
            From the factory in China to your door in Egypt.
          </p>
        </div>

        <Card>
          <CardContent className="flex flex-col gap-4 p-5">
            <h1 className="m-0 text-lg font-semibold">Sign in</h1>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(submit)} className="flex flex-col gap-4" noValidate>
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" autoComplete="username" className="h-10" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input type="password" autoComplete="current-password" className="h-10" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <ErrorMessage error={error} />
                <Button type="submit" size="lg" disabled={form.formState.isSubmitting}>
                  <LogInIcon />
                  {form.formState.isSubmitting ? "Signing in…" : "Sign in"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </FadeIn>
    </div>
  );
}
