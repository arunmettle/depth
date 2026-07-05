"use client";

import { useActionState } from "react";

import { requestMagicLink, type SignInState } from "@/app/sign-in/actions";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

const initialState: SignInState = {
  message: null,
  status: "idle",
};

type SignInFormProps = {
  nextPath?: string;
};

export function SignInForm({ nextPath = "/dashboard" }: SignInFormProps) {
  const [state, formAction, isPending] = useActionState(
    requestMagicLink,
    initialState
  );

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="next" value={nextPath} />
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <FieldContent>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="trader@example.com"
              required
            />
            <FieldDescription>
              We use a magic link to keep onboarding lightweight and
              mobile-friendly.
            </FieldDescription>
          </FieldContent>
        </Field>
      </FieldGroup>

      {state.message ? (
        <p className="text-sm text-muted-foreground">{state.message}</p>
      ) : null}

      <Button type="submit" disabled={isPending}>
        {isPending ? "Sending link..." : "Send magic link"}
      </Button>
    </form>
  );
}
