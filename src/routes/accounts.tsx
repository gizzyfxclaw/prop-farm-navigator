import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Check, Pencil, RotateCcw, Save, Trash2 } from "lucide-react";
import {
  ActionButton, Badge, Button, Card, CockpitHeader, DataGrid, Field, Select, TextInput,
} from "@/components/terminal/ui";
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
  const activeAccount = accounts.find((a) => a.id === engine.selectedAccountId);

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
    <div className="engine-cockpit">
      <CockpitHeader
        title="Prop Accounts"
        badges={
          <>
            <Badge tone="neutral">{accounts.length} configured</Badge>
            {activeAccount && <Badge tone="blue" live>Active · {activeAccount.firm}</Badge>}
          </>
        }
        right={<span className="cockpit-pair">Engine & validator calculate against the selected account</span>}
      />

      <Card
        title={draft.id ? "Edit account" : "Add account"}
        accent={draft.id ? "highlight" : "primary"}
        badge={draft.id ? <Badge tone="amber">Editing</Badge> : <Badge tone="neutral">New</Badge>}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Firm / label">
            <TextInput value={draft.firm} onChange={(e) => patch({ firm: e.target.value })} placeholder="FundedNext $5k" />
          </Field>
          <Field label="Account size ($)">
            <TextInput type="number" value={draft.size} onChange={(e) => patch({ size: Number(e.target.value) })} />
          </Field>
          <Field label="Challenge fee ($)" hint="Real cash paid upfront">
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
            <ActionButton onClick={submit}>
              <Save size={12} />
              {draft.id ? "Save changes" : "Add account"}
            </ActionButton>
            {draft.id && (
              <Button variant="ghost" onClick={() => setDraft(blank())}>Cancel</Button>
            )}
          </div>
        </div>

        {draft.ddType === "Trailing" && (
          <div className="mt-3">
            <div className="alert alert-amber">
              <p className="alert-title">
                <AlertTriangle size={13} />
                Trailing drawdown
              </p>
              <p className="alert-body">
                A trailing max-drawdown ratchets up with equity, so the mirror hedge can breach it on a
                normal losing leg even while the Exness side is healthy. The validator will flag this account.
              </p>
            </div>
          </div>
        )}
      </Card>

      <Card
        title={`Accounts (${accounts.length})`}
        accent="primary"
        flush
        badge={
          <Button
            variant="ghost"
            onClick={() => {
              defaultAccounts().forEach(saveAccount);
              toast.success("Presets restored.");
            }}
          >
            <RotateCcw size={12} />
            Restore presets
          </Button>
        }
      >
        <DataGrid
          head={[
            { label: "Firm" },
            { label: "Size", align: "right" },
            { label: "Fee", align: "right" },
            { label: "Target", align: "right" },
            { label: "Max DD", align: "right" },
            { label: "DD type" },
            { label: "Split", align: "right" },
            { label: "" },
          ]}
        >
          {accounts.map((a) => {
            const active = engine.selectedAccountId === a.id;
            const trailing = a.ddType === "Trailing";
            return (
              <tr key={a.id} className={active ? "is-selected" : undefined}>
                <td style={{ color: "oklch(var(--gz-txt))", fontWeight: 600 }}>
                  <span className="inline-flex items-center gap-2">
                    {a.firm}
                    {active && <Badge tone="blue">Active</Badge>}
                  </span>
                </td>
                <td className="num">{money(a.size)}</td>
                <td className="num">{money(a.fee)}</td>
                <td className="num">{a.targetPct}%</td>
                <td className="num">{a.ddPct}%</td>
                <td>
                  <span style={{ color: trailing ? "oklch(var(--gz-warn))" : "oklch(var(--gz-mut))" }}>
                    {trailing && <AlertTriangle size={10} style={{ display: "inline", marginRight: 3, verticalAlign: "-1px" }} />}
                    {a.ddType}
                  </span>
                </td>
                <td className="num">{a.splitPct}%</td>
                <td>
                  <div className="flex justify-end gap-1.5">
                    <Button
                      variant={active ? "success" : "ghost"}
                      onClick={() => setEngine({ selectedAccountId: a.id })}
                    >
                      {active ? <Check size={11} /> : null}
                      {active ? "Selected" : "Select"}
                    </Button>
                    <Button variant="ghost" onClick={() => setDraft(a)}>
                      <Pencil size={11} />
                      Edit
                    </Button>
                    <Button variant="danger" onClick={() => deleteAccount(a.id)}>
                      <Trash2 size={11} />
                      Delete
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </DataGrid>
      </Card>
    </div>
  );
}
