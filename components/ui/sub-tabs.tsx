"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

// Generic in-page sub-tab bar used by the consolidated top-level tabs
// (Overview / Governance / Workflow). Each item's `content` is a server-
// rendered node passed in from the page, so existing view components are
// reused verbatim. The active tab is seeded from `?tab=` for deep-linking
// (old routes redirect here with the matching `tab`).

// `icon` is a pre-rendered node (e.g. <ShieldCheck/>), not a component reference —
// functions can't be passed from a Server Component to this Client Component.
export type SubTabItem = { value: string; label: string; icon?: React.ReactNode; content: React.ReactNode };

function SubTabsInner({ items, paramKey = "tab" }: { items: SubTabItem[]; paramKey?: string }) {
  const sp = useSearchParams();
  const want = sp.get(paramKey);
  const initial = items.some((i) => i.value === want) ? (want as string) : items[0]?.value;

  return (
    <Tabs defaultValue={initial} className="w-full">
      <div className="flex justify-center px-6 pt-4">
        <TabsList>
          {items.map(({ value, label, icon }) => (
            <TabsTrigger key={value} value={value} className="gap-1.5">
              {icon}
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {items.map(({ value, content }) => (
        <TabsContent key={value} value={value} className="mt-0 focus-visible:outline-none">
          {content}
        </TabsContent>
      ))}
    </Tabs>
  );
}

export function SubTabs(props: { items: SubTabItem[]; paramKey?: string }) {
  // useSearchParams must sit under a Suspense boundary.
  return (
    <Suspense fallback={null}>
      <SubTabsInner {...props} />
    </Suspense>
  );
}
