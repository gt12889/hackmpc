import { cn } from "@/lib/utils";
import { BlurText } from "@/components/blur-text";

export function PageHeader({
  title,
  description,
  children,
  blur = false,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
  blur?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-8 pb-2 pt-4">
      <div>
        {blur ? (
          <BlurText text={title} className={cn("text-2xl tracking-tight text-neutral-900", "display-serif")} />
        ) : (
          <h1 className={cn("text-2xl tracking-tight text-neutral-900", "display-serif")}>{title}</h1>
        )}
        {description && <p className="mt-1 text-sm text-neutral-600">{description}</p>}
      </div>
      {children}
    </div>
  );
}
