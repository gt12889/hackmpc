import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-8 pb-2 pt-4">
      <div>
        <h1 className={cn("text-2xl tracking-tight text-neutral-900", "display-serif")}>{title}</h1>
        {description && <p className="mt-1 text-sm text-neutral-600">{description}</p>}
      </div>
      {children}
    </div>
  );
}
