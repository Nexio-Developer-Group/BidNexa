"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createTender } from "../actions";

const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED"];

export default function NewTenderPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    title: "",
    referenceNumber: "",
    clientName: "",
    location: "",
    currency: "INR",
    deadline: "",
    notes: "",
  });

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const result = await createTender({
      title: form.title,
      referenceNumber: form.referenceNumber || null,
      clientName: form.clientName || null,
      location: form.location || null,
      currency: form.currency,
      deadline: form.deadline || null,
      notes: form.notes || null,
    });
    setSubmitting(false);

    if ("error" in result) {
      toast.error(result.error);
      return;
    }

    toast.success("Tender created. Now upload the tender workbook.");
    router.push(`/tenders/${result.tenderId}`);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h2 className="text-xl font-semibold">Create Tender</h2>
        <p className="text-sm text-[var(--muted)]">
          Step 1 of 5 — tender details. You&apos;ll upload the BOQ workbook next.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Tender details</CardTitle>
          <CardDescription>Basic information used across dashboards and comparisons.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="title">Tender name *</Label>
              <Input id="title" required value={form.title} onChange={(e) => update("title", e.target.value)} />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="referenceNumber">Tender reference</Label>
                <Input
                  id="referenceNumber"
                  value={form.referenceNumber}
                  onChange={(e) => update("referenceNumber", e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="clientName">Client / Project</Label>
                <Input id="clientName" value={form.clientName} onChange={(e) => update("clientName", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="location">Location</Label>
                <Input id="location" value={form.location} onChange={(e) => update("location", e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="deadline">Tender deadline</Label>
                <Input
                  id="deadline"
                  type="date"
                  value={form.deadline}
                  onChange={(e) => update("deadline", e.target.value)}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="currency">Currency</Label>
              <select
                id="currency"
                className="h-10 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-3 text-sm"
                value={form.currency}
                onChange={(e) => update("currency", e.target.value)}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" value={form.notes} onChange={(e) => update("notes", e.target.value)} />
            </div>
            <Button type="submit" disabled={submitting} className="mt-2">
              {submitting ? "Creating…" : "Create tender & continue"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
