import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Alert, Badge, Button, Card, Field, Row, TextInput } from "@/components/terminal/ui";
import {
  fetchAccountInformation,
  fetchAccountStatus,
  linkExistingAccount,
  provisionNewDemoAccount,
  type AccountStatus,
} from "@/lib/metaapi.functions";
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
        content:
          "Store your MetaApi Cloud credentials locally and test the MT5 connection in one click.",
      },
    ],
  }),
  component: SettingsPage,
});

/* ── helpers ──────────────────────────────────────────────────── */

type ProvisionMode = "connect" | "provision";

function statusBadge(state: string, isDemo: boolean) {
  if (!isDemo) return <Badge tone="red">LIVE — BLOCKED</Badge>;
  if (state === "DEPLOYED") return <Badge tone="green">Connected</Badge>;
  if (state === "DEPLOYING") return <Badge tone="amber">Deploying…</Badge>;
  if (state === "ERROR") return <Badge tone="red">Error</Badge>;
  return <Badge tone="neutral">{state}</Badge>;
}

/* ── component ────────────────────────────────────────────────── */

function SettingsPage() {
  const { meta, setMeta } = useStore();

  /* legacy test status */
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{
    level: "green" | "red";
    title: string;
    detail: string;
  } | null>(null);

  /* broker account panel */
  const [provisionMode, setProvisionMode] = useState<ProvisionMode>("connect");
  const [platform, setPlatform] = useState<"mt4" | "mt5">("mt5");
  const [existingAccountId, setExistingAccountId] = useState("");
  const [brokerName, setBrokerName] = useState("");
  const [deposit, setDeposit] = useState("10000");
  const [leverage, setLeverage] = useState("100");
  const [provisionBusy, setProvisionBusy] = useState(false);
  const [provisionError, setProvisionError] = useState<string | null>(null);

  /* connection status (polled) */
  const [accountStatus, setAccountStatus] = useState<AccountStatus | null>(null);
  const [statusBadgeData, setStatusBadgeData] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  async function pollStatus(token: string, accountId: string) {
    const res = await fetchAccountStatus({ data: { token, accountId } });
    if (res.ok) {
      setAccountStatus(res.data);
      setStatusBadgeData(res.data.state);
      if (res.data.state === "DEPLOYED" || res.data.state === "ERROR") stopPolling();
    }
  }

  useEffect(() => () => stopPolling(), []);

  /* ── connect existing account ─────────────────────────────── */
  async function handleConnectExisting() {
    setProvisionError(null);
    if (!meta.token || !existingAccountId) {
      setProvisionError("Enter your MetaApi token and account ID first.");
      return;
    }
    setProvisionBusy(true);
    const res = await linkExistingAccount({
      data: { token: meta.token, accountId: existingAccountId },
    });
    setProvisionBusy(false);
    if (!res.ok) {
      setProvisionError(res.error);
      return;
    }
    setAccountStatus(res.data);
    toast.success("Demo account linked — starting status polling…");
    // Store accountId (not token, not password)
    setMeta({ exnessAccountId: res.data.accountId });
    // Poll until DEPLOYED
    pollRef.current = setInterval(() => pollStatus(meta.token, res.data.accountId), 4_000);
  }

  /* ── provision new demo account ───────────────────────────── */
  async function handleProvisionNew() {
    setProvisionError(null);
    if (!meta.token || !brokerName) {
      setProvisionError("Enter your MetaApi token and broker name first.");
      return;
    }
    const dep = parseFloat(deposit);
    const lev = parseInt(leverage, 10);
    if (isNaN(dep) || dep <= 0) { setProvisionError("Deposit must be a positive number."); return; }
    if (isNaN(lev) || lev <= 0) { setProvisionError("Leverage must be a positive integer."); return; }
    setProvisionBusy(true);
    const res = await provisionNewDemoAccount({
      data: { token: meta.token, platform, brokerName, deposit: dep, leverage: lev },
    });
    setProvisionBusy(false);
    if (!res.ok) {
      setProvisionError(res.error);
      return;
    }
    toast.success(`Demo account provisioned — ID: ${res.data.accountId}. Deploying…`);
    setMeta({ exnessAccountId: res.data.accountId });
    setStatusBadgeData("DEPLOYING");
    // Poll until DEPLOYED
    pollRef.current = setInterval(() => pollStatus(meta.token, res.data.accountId), 4_000);
  }

  /* ── legacy test (unchanged) ──────────────────────────────── */
  async function test(accountId: string, label: string) {
    if (!meta.token || !accountId) {
      toast.error(`Enter your token and the ${label} account ID first.`);
      return;
    }
    setBusy(true);
    const res = await fetchAccountInformation({
      data: { token: meta.token, accountId, clientApiUrl: meta.clientApiUrl || undefined },
    });
    setBusy(false);
    if (!res.ok) {
      setStatus({ level: "red", title: `${label} connection failed`, detail: res.error });
      return;
    }
    const a = res.data;
    const urlNote = meta.clientApiUrl ? ` · via ${meta.clientApiUrl}` : "";
    setStatus({
      level: "green",
      title: `${label} connected`,
      detail: `${a.broker ?? "broker"} · ${a.server ?? "server"} · login ${a.login ?? "-"} · balance ${a.balance} ${a.currency ?? ""}${urlNote}`,
    });
  }

  /* ── render ───────────────────────────────────────────────── */
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Settings</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Credentials stay in this browser and are forwarded per request — never stored on the
          server.
        </p>
      </div>

      {status && (
        <Alert level={status.level} title={status.title}>
          {status.detail}
        </Alert>
      )}

      {/* ── BROKER ACCOUNT ───────────────────────────────────── */}
      <Card
        title="Broker Account"
        badge={
          accountStatus
            ? statusBadge(accountStatus.state, accountStatus.isDemo)
            : statusBadgeData === "DEPLOYING"
            ? <Badge tone="amber">Deploying…</Badge>
            : undefined
        }
      >
        {/* Demo-only notice */}
        <div className="mb-4 rounded-lg border border-warning/25 bg-warning/8 px-3 py-2 text-[12px] text-warning">
          ⚠ Only <strong>demo</strong> accounts are accepted. Real/live accounts are hard-blocked
          regardless of what you enter.
        </div>

        {/* Token */}
        <div className="grid gap-4">
          <Field label="MetaApi token" hint="Create it at app.metaapi.cloud → API access tokens.">
            <TextInput
              type="password"
              value={meta.token}
              onChange={(e) => setMeta({ token: e.target.value })}
              placeholder="eyJhbGciOi…"
              autoComplete="off"
            />
          </Field>

          {/* Platform */}
          <Field label="Platform" hint="MT4 or MT5 — must match your broker account type.">
            <div className="flex gap-2">
              {(["mt4", "mt5"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPlatform(p)}
                  className={[
                    "rounded-md border px-4 py-1.5 text-[13px] font-semibold uppercase transition",
                    platform === p
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-white/10 text-muted-foreground hover:border-primary/40",
                  ].join(" ")}
                >
                  {p.toUpperCase()}
                </button>
              ))}
            </div>
          </Field>

          {/* Provisioning mode */}
          <Field label="Account provisioning mode">
            <div className="flex gap-2">
              <button
                onClick={() => setProvisionMode("connect")}
                className={[
                  "rounded-md border px-3 py-1.5 text-[12px] transition",
                  provisionMode === "connect"
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-white/10 text-muted-foreground hover:border-primary/40",
                ].join(" ")}
              >
                Connect existing demo account
              </button>
              <button
                onClick={() => setProvisionMode("provision")}
                className={[
                  "rounded-md border px-3 py-1.5 text-[12px] transition",
                  provisionMode === "provision"
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-white/10 text-muted-foreground hover:border-primary/40",
                ].join(" ")}
              >
                Provision new demo via MetaApi
              </button>
            </div>
          </Field>

          {/* Connect existing */}
          {provisionMode === "connect" && (
            <>
              <Field
                label="MetaApi account ID"
                hint="The GUID from app.metaapi.cloud — not your broker login."
              >
                <TextInput
                  value={existingAccountId}
                  onChange={(e) => setExistingAccountId(e.target.value)}
                  placeholder="0f1e2d3c-4b5a-6789-abcd-ef0123456789"
                />
              </Field>
              <Button disabled={provisionBusy} onClick={handleConnectExisting}>
                {provisionBusy ? "Linking…" : "Link demo account"}
              </Button>
            </>
          )}

          {/* Provision new */}
          {provisionMode === "provision" && (
            <>
              <Field label="Broker name" hint='e.g. "Pepperstone", "ICMarkets", "XM"'>
                <TextInput
                  value={brokerName}
                  onChange={(e) => setBrokerName(e.target.value)}
                  placeholder="ICMarkets"
                />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Deposit (USD)">
                  <TextInput
                    type="number"
                    value={deposit}
                    onChange={(e) => setDeposit(e.target.value)}
                    placeholder="10000"
                  />
                </Field>
                <Field label="Leverage">
                  <TextInput
                    type="number"
                    value={leverage}
                    onChange={(e) => setLeverage(e.target.value)}
                    placeholder="100"
                  />
                </Field>
              </div>
              <Button disabled={provisionBusy} onClick={handleProvisionNew}>
                {provisionBusy ? "Provisioning…" : "Create demo account"}
              </Button>
            </>
          )}

          {provisionError && (
            <Alert level="red" title="Error">
              {provisionError}
            </Alert>
          )}

          {/* Live status */}
          {accountStatus && (
            <div className="rounded-lg border border-white/8 bg-white/4 p-3 text-[12px] space-y-1">
              <Row label="Account ID" value={accountStatus.accountId} />
              <Row label="Name" value={accountStatus.name ?? "—"} />
              <Row label="Platform" value={accountStatus.platform.toUpperCase()} />
              <Row label="Type" value={accountStatus.accountType} />
              <Row label="State" value={accountStatus.state} />
            </div>
          )}
        </div>
      </Card>

      {/* ── METAAPI CLOUD (existing) ──────────────────────────── */}
      <Card title="MetaApi Cloud — Advanced">
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Exness MT5 account ID" hint="The hedge / fuel account that gets executed.">
              <TextInput
                value={meta.exnessAccountId}
                onChange={(e) => setMeta({ exnessAccountId: e.target.value })}
                placeholder="0f1e2d3c-…"
              />
            </Field>
            <Field
              label="Prop MT5 account ID"
              hint="Optional — read-only monitoring of the challenge account."
            >
              <TextInput
                value={meta.propAccountId}
                onChange={(e) => setMeta({ propAccountId: e.target.value })}
                placeholder="9a8b7c6d-…"
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
          <Field
            label="MetaApi client API URL"
            hint="Override the auto-resolved region URL. Format: https://mt-client-api-v1.{region}.agiliumtrade.ai"
          >
            <TextInput
              value={meta.clientApiUrl}
              onChange={(e) => setMeta({ clientApiUrl: e.target.value })}
              placeholder="https://mt-client-api-v1.london.agiliumtrade.ai"
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
        <Row label="Client API URL" value={meta.clientApiUrl || "auto (region lookup)"} />
      </Card>
    </div>
  );
}
