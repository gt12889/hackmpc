import { PageHeader } from "@/components/page-header";
import { ChatPanel } from "@/components/chat/chat-panel";

export const dynamic = "force-dynamic";

export default function ChatPage() {
  return (
    <div className="flex h-screen flex-col">
      <PageHeader title="Talk to Your Data" description="ChatGPT for your fleet's spending — charts and follow-ups included" />
      <div className="flex-1 overflow-hidden">
        <ChatPanel />
      </div>
    </div>
  );
}
