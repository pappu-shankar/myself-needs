"use client";

import Link from "next/link";
import { CircleCheck, Circle } from "lucide-react";
import { dismissGettingStartedAction } from "@/modules/finance/actions/config/allocation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Step {
  label: string;
  description: string;
  href: string;
  done: boolean;
}

/**
 * First-visit walkthrough on the finance hub — Accounts, Categories,
 * Transactions, and Budgets are the order everything else in Finance
 * assumes (you can't log a transaction without an account, a budget
 * without a category, and so on). Disappears on its own once every step
 * is done; "Skip for now" persists a dismissal for anyone who'd rather
 * explore on their own terms.
 */
export function GettingStartedChecklist({ steps }: { steps: Step[] }) {
  return (
    <Card className="mb-6">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base font-medium">Getting started</CardTitle>
          <p className="text-muted-foreground mt-1 text-sm">
            Finance builds up in this order — each step unlocks the next.
          </p>
        </div>
        <form action={dismissGettingStartedAction}>
          <Button type="submit" variant="ghost" size="sm">
            Skip for now
          </Button>
        </form>
      </CardHeader>
      <CardContent>
        <ol className="flex flex-col gap-3">
          {steps.map((step, i) => (
            <li key={step.href} className="flex items-start gap-3">
              {step.done ? (
                <CircleCheck className="text-primary mt-0.5 size-5 shrink-0" aria-hidden />
              ) : (
                <Circle className="text-muted-foreground mt-0.5 size-5 shrink-0" aria-hidden />
              )}
              <div className="flex-1">
                {step.done ? (
                  <p className="text-muted-foreground text-sm line-through decoration-1">
                    {i + 1}. {step.label}
                  </p>
                ) : (
                  <Link
                    href={step.href}
                    className="text-primary text-sm font-medium underline-offset-4 hover:underline"
                  >
                    {i + 1}. {step.label}
                  </Link>
                )}
                <p className="text-muted-foreground text-xs">{step.description}</p>
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
