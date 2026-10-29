"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export function QuotationChat({
  tenderId,
  submissionId,
  initialMessages,
  disabled,
}: {
  tenderId: string;
  submissionId: string;
  initialMessages: ChatMessage[];
  disabled?: boolean;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || sending || disabled) return;

    setInput("");
    setSending(true);
    const optimisticUser: ChatMessage = { id: `local-${Date.now()}`, role: "user", content: text };
    setMessages((prev) => [...prev, optimisticUser]);

    try {
      const res = await fetch(`/api/tenders/${tenderId}/contractors/${submissionId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || "Chat failed");
        setMessages((prev) => prev.filter((m) => m.id !== optimisticUser.id));
        setInput(text);
        return;
      }
      setMessages((prev) => [...prev, { id: `reply-${Date.now()}`, role: "assistant", content: json.reply }]);
      if (json.actionsApplied?.length > 0) {
        toast.success(`${json.actionsApplied.length} value(s) updated.`);
        router.refresh();
      }
    } catch (err) {
      toast.error((err as Error).message);
      setMessages((prev) => prev.filter((m) => m.id !== optimisticUser.id));
      setInput(text);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-col">
      <div ref={scrollRef} className="flex max-h-[60vh] min-h-[280px] flex-col gap-3 overflow-y-auto overflow-x-hidden p-3 sm:max-h-[70vh] sm:p-4">
        {messages.length === 0 ? (
          <p className="p-4 text-center text-sm text-[var(--muted)]">
            Ask something like &quot;what&apos;s the margin on item 2.1?&quot; or &quot;change the rate of item 3 to
            450&quot;.
          </p>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={`max-w-[85%] min-w-0 whitespace-pre-wrap break-words rounded-[var(--radius)] px-3 py-2 text-sm ${
                m.role === "user"
                  ? "ml-auto bg-[var(--navy-900)] text-white"
                  : "mr-auto bg-[var(--muted-surface)] text-[var(--foreground)]"
              }`}
            >
              {m.content}
            </div>
          ))
        )}
        {sending && <div className="mr-auto rounded-[var(--radius)] bg-[var(--muted-surface)] px-3 py-2 text-sm text-[var(--muted)]">Thinking…</div>}
      </div>

      <div className="flex min-w-0 gap-2 border-t border-[var(--border)] p-3 sm:p-4">
        <textarea
          value={input}
          disabled={disabled || sending}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={disabled ? "Save the quotation first to enable chat…" : "Ask about this quotation…"}
          rows={1}
          className="min-w-0 flex-1 resize-none rounded-[var(--radius)] border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)] disabled:opacity-50"
        />
        <Button size="sm" onClick={send} disabled={disabled || sending || !input.trim()} className="shrink-0">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
