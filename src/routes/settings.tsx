import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Alert, Button, Card, Field, Row, TextInput } from "@/components/terminal/ui";
import { fetchAccountInformation } from "@/lib/metaapi.functions";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "MetaApi Settings — GizzyFx" },
      {
        name: "description",
        content:
          "Connect your MetaApi Cloud token and MT5 account IDs so the terminal can stream live prices and place pending orders.",
      },
      { property: "og:title", content: "MetaApi Settings — GizzyFx" },
      {
        property: "og:description",
        content: "Store your MetaApi Cloud credentials locally and test the MT5 connection in one click.",
      },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { meta, setMeta } = useStore();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ level: "green" | "red"; title: string; detail: string } | null>(null);

  async function test(accountId: string, label: string) {
    if (!meta.token || !accountId) {
      toast.error(`Enter your token and the ${label} account ID first.`);
      return;
    }
    setBusy(true);
    const res = await fetchAccountInformation({ data: { token: meta.token, accountId } });
    setBusy(false);
    if (!res.ok) {
      setStatus({ level: "red", title: `${label} connection failed`, detail: res.error });
      return;
    }
    const a = res.data;
    setStatus({
      level: "green",
      title: `${label} connected`,
      detail: `${a.broker ?? "broker"} · ${a.server ?? "server"} · login ${a.login ?? "-"} · balance ${a.balance} ${
        a.currency ?? ""
      }`,
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Settings</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Credentials stay in this browser and are forwarded per request — never stored on the server.
        </p>
      </div>

      {status && (
        <Alert level={status.level} title={status.title}>
          {status.detail}
        </Alert>
      )}

      <Card title="MetaApi Cloud">
        <div className="grid gap-4">
          <Field label="MetaApi token" hint="Create it at app.metaapi.cloud → API access tokens.">
            <TextInput
              type="password"
              value={meta.token}
              onChange={(e) => setMeta({ token: e.target.value })}
              placeholder="eyJhbGciOi..."
              autoComplete="off"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Exness MT5 account ID" hint="The hedge / fuel account that gets executed.">
              <TextInput
                value={meta.exnessAccountId}
                onChange={(e) => setMeta({ exnessAccountId: e.target.value })}
                placeholder="0f1e2d3c-..."
              />
            </Field>
            <Field label="Prop MT5 account ID" hint="Optional — read-only monitoring of the challenge account.">
              <TextInput
                value={meta.propAccountId}
                onChange={(e) => setMeta({ propAccountId: e.target.value })}
                placeholder="9a8b7c6d-..."
              />
            </Field>
          </div>
          <Field label="Exness symbol suffix" hint='Some Exness servers use "EURUSDm" — enter "m".'>
            <TextInput
              value={meta.exnessSymbolSuffix}
              onChange={(e) => setMeta({ exnessSymbolSuffix: e.target.value })}
              placeholder="(none)"
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => test(meta.exnessAccountId, "Exness")}>
              {busy ? "Testing…" : "Test Exness connection"}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => test(meta.propAccountId, "Prop")}>
              Test prop connection
            </Button>
          </div>
        </div>
      </Card>

      <Card title="Current configuration">
        <Row label="Token" value={meta.token ? `••••${meta.token.slice(-6)}` : "not set"} />
        <Row label="Exness account" value={meta.exnessAccountId || "not set"} />
        <Row label="Prop account" value={meta.propAccountId || "not set"} />
        <Row label="Symbol suffix" value={meta.exnessSymbolSuffix || "none"} />
      </Card>
    </div>
  );
}
