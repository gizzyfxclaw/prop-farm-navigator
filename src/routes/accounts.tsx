import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Badge, Button, Card, Field, Select, TextInput } from "@/components/terminal/ui";
import { money, type DrawdownType, type PropAccount } from "@/lib/engine/calc";
import { defaultAccounts, useStore } from "@/lib/store";

export const Route = createFileRoute("/accounts")({
  head: () => ({
    meta: [
      { title: "Prop Accounts — GizzyFx" },
      {
        name: "description",
        content:
          "Manage prop firm challenge presets: account size, fee, profit target, drawdown rules and profit split used by the engine.",
      },
      { property: "og:title", content: "Prop Accounts — GizzyFx" },
      {
        property: "og:description",
        content: "Add, edit and select the prop firm accounts the hedge engine calculates against.",
      },
    ],
  }),
  component: AccountsPage,
});

const blank = (): PropAccount => ({
  id: "",
  firm: "",
  size: 5000,
  fee: 28.6,
  targetPct: 6,
  ddPct: 6,
  ddType: "Static",
  splitPct: 80,
});

function AccountsPage() {
  const { accounts, saveAccount, deleteAccount, engine, setEngine } = useStore();
  const [draft, setDraft] = useState<PropAccount>(blank);

  const patch = (p: Partial<PropAccount>) => setDraft((d) => ({ ...d, ...p }));

  function submit() {
    if (!draft.firm.trim()) {
      toast.error("Give the account a name.");
      return;
    }
    const account: PropAccount = {
      ...draft,
      id: draft.id || `custom-${Date.now()}`,
      firm: draft.firm.trim(),
    };
    saveAccount(account);
    setEngine({ selectedAccountId: account.id });
    setDraft(blank());
    toast.success(`${account.firm} saved and selected.`);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Prop accounts</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          The engine and validator calculate against the account selected here.
        </p>
      </div>

      <Card title={draft.id ? "Edit account" : "Add account"}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Firm / label">
            <TextInput value={draft.firm} onChange={(e) => patch({ firm: e.target.value })} placeholder="FundedNext $5k" />
          </Field>
          <Field label="Account size ($)">
            <TextInput type="number" value={draft.size} onChange={(e) => patch({ size: Number(e.target.value) })} />
          </Field>
          <Field label="Challenge fee ($)">
            <TextInput type="number" step="0.01" value={draft.fee} onChange={(e) => patch({ fee: Number(e.target.value) })} />
          </Field>
          <Field label="Profit target (%)">
            <TextInput type="number" step="0.1" value={draft.targetPct} onChange={(e) => patch({ targetPct: Number(e.target.value) })} />
          </Field>
          <Field label="Max drawdown (%)">
            <TextInput type="number" step="0.1" value={draft.ddPct} onChange={(e) => patch({ ddPct: Number(e.target.value) })} />
          </Field>
          <Field label="Drawdown type" hint="Trailing drawdown breaks the mirror strategy.">
            <Select value={draft.ddType} onChange={(e) => patch({ ddType: e.target.value as DrawdownType })}>
              <option value="Static">Static</option>
              <option value="Trailing">Trailing</option>
            </Select>
          </Field>
          <Field label="Profit split (%)">
            <TextInput type="number" value={draft.splitPct} onChange={(e) => patch({ splitPct: Number(e.target.value) })} />
          </Field>
          <div className="flex items-end gap-2">
            <Button onClick={submit}>{draft.id ? "Save changes" : "Add account"}</Button>
            {draft.id && (
              <Button variant="ghost" onClick={() => setDraft(blank())}>
                Cancel
              </Button>
            )}
          </div>
        </div>
      </Card>

      <Card
        title={`Accounts (${accounts.length})`}
        badge={
          <Button
            variant="ghost"
            className="h-8 px-3 text-[11px]"
            onClick={() => {
              defaultAccounts().forEach(saveAccount);
              toast.success("Presets restored.");
            }}
          >
            Restore presets
          </Button>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-left text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">
                <th className="py-2 pr-3">Firm</th>
                <th className="py-2 pr-3">Size</th>
                <th className="py-2 pr-3">Fee</th>
                <th className="py-2 pr-3">Target</th>
                <th className="py-2 pr-3">Max DD</th>
                <th className="py-2 pr-3">Type</th>
                <th className="py-2 pr-3">Split</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody className="font-mono">
              {accounts.map((a) => (
                <tr key={a.id} className="border-t border-border">
                  <td className="py-2 pr-3 text-foreground">
                    {a.firm}{" "}
                    {engine.selectedAccountId === a.id && <Badge tone="blue">Active</Badge>}
                  </td>
                  <td className="py-2 pr-3">{money(a.size)}</td>
                  <td className="py-2 pr-3">{money(a.fee)}</td>
                  <td className="py-2 pr-3">{a.targetPct}%</td>
                  <td className="py-2 pr-3">{a.ddPct}%</td>
                  <td className="py-2 pr-3">{a.ddType}</td>
                  <td className="py-2 pr-3">{a.splitPct}%</td>
                  <td className="py-2">
                    <div className="flex justify-end gap-1.5">
                      <button
                        onClick={() => setEngine({ selectedAccountId: a.id })}
                        className="rounded-lg border border-border px-2.5 py-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                      >
                        Select
                      </button>
                      <button
                        onClick={() => setDraft(a)}
                        className="rounded-lg border border-border px-2.5 py-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteAccount(a.id)}
                        className="rounded-lg border border-destructive/40 px-2.5 py-1 text-[11px] font-semibold text-destructive"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
