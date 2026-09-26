import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * A titled card that is also an anchor ("On this page" links jump to it).
 * `flush` drops the body padding for edge-to-edge tables.
 */
export function SectionCard({
  id,
  title,
  description,
  action,
  flush = false,
  className,
  bodyClassName,
  children,
}: {
  id?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  flush?: boolean;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <Card id={id} className={cn("scroll-mt-16", flush && "overflow-hidden", className)}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <div className={cn(!flush && "flex flex-col gap-4 p-4", bodyClassName)}>{children}</div>
    </Card>
  );
}

/** A dashed "add something" box at the foot of a section. */
export function AddBox({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg border border-dashed border-strong p-3.5",
        className,
      )}
    >
      <h3 className="m-0 text-base font-semibold">{title}</h3>
      {children}
    </div>
  );
}

/** The red asterisk after a required field's label. */
export function Required() {
  return (
    <span aria-hidden className="text-danger-text">
      *
    </span>
  );
}

/** The quiet "Optional" after an optional field's label. */
export function Optional() {
  return <span className="text-xs font-normal text-fg-tertiary">Optional</span>;
}
