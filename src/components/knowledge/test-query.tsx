"use client";

import { SearchIcon } from "lucide-react";
import { useActionState } from "react";
import {
  testQueryAction,
  type TestQueryState,
} from "@/app/(app)/knowledge/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

/** Try a question against the index and see what the agent would find, with scores. */
export function TestQuery({ disabled }: { disabled?: boolean }) {
  const [state, action, pending] = useActionState<TestQueryState, FormData>(
    testQueryAction,
    undefined,
  );
  return (
    <section
      aria-label="Test a query"
      className="flex flex-col gap-3 rounded-xl border bg-card p-5 shadow-xs"
    >
      <h2 className="text-[15px] font-semibold">Test a query</h2>
      <form action={action} className="flex flex-col gap-2">
        <div className="flex gap-2">
          <Input
            name="query"
            defaultValue={state?.query ?? "taxi fare Shillong airport sedan"}
            aria-label="Question to test"
            className="h-10"
            maxLength={300}
            disabled={disabled}
          />
          <Button
            type="submit"
            size="icon"
            className="size-10 shrink-0"
            disabled={pending || disabled}
            aria-label="Search"
          >
            {pending ? <Spinner /> : <SearchIcon />}
          </Button>
        </div>
      </form>
      {pending ? (
        <p role="status" className="text-sm text-muted-foreground">
          Searching the index…
        </p>
      ) : null}
      {state?.error ? (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      ) : null}
      {state?.hits && state.hits.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing in the index is close to that.
        </p>
      ) : null}
      {state?.hits && state.hits.length > 0 ? (
        <ol className="flex flex-col gap-2" aria-label="Results">
          {state.hits.map((h) => (
            <li
              key={h.id}
              className="flex items-start justify-between gap-3 rounded-lg border px-3 py-2.5"
              data-testid="hit"
              data-type={h.type}
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-sm font-medium">{h.title}</span>
                <span className="truncate font-mono text-xs text-muted-foreground">
                  {h.sourceName}
                  {h.district ? ` · ${h.district}` : ""}
                </span>
                <span className="line-clamp-2 text-xs text-muted-foreground">
                  {h.text}
                </span>
              </div>
              <span
                className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs"
                title="Similarity score"
              >
                {h.score.toFixed(2)}
              </span>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
