import * as React from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface FormFieldProps extends React.ComponentProps<"div"> {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
}

/**
 * Label + control + hint/error, consistent across every form in the app.
 * Errors are linked to the control via aria-describedby (docs/design/accessibility.md).
 */
export function FormField({
  label,
  htmlFor,
  hint,
  error,
  className,
  children,
  ...props
}: FormFieldProps) {
  const hintId = hint ? `${htmlFor}-hint` : undefined;
  const errorId = error ? `${htmlFor}-error` : undefined;

  return (
    <div className={cn("flex flex-col gap-1.5", className)} {...props}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {React.isValidElement(children)
        ? React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
            id: htmlFor,
            "aria-describedby": [hintId, errorId].filter(Boolean).join(" ") || undefined,
            "aria-invalid": Boolean(error) || undefined,
          })
        : children}
      {hint && !error && (
        <p id={hintId} className="text-muted-foreground text-sm">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * For a non-field grid cell (typically a submit button) that needs to sit in the
 * same `items-start` form grid as `FormField`s and still line up with their
 * *inputs*, not their labels. Renders a same-markup, invisible copy of the real
 * label so the vertical offset always matches exactly — no guessed padding value
 * to keep in sync if `Label`'s type size/line-height ever changes.
 */
export function FormFieldAction({
  label,
  className,
  children,
  ...props
}: { label: string } & React.ComponentProps<"div">) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)} {...props}>
      <Label aria-hidden="true" className="hidden invisible sm:block">
        {label}
      </Label>
      {children}
    </div>
  );
}
