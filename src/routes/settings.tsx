import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Link2, Loader2, Plug, Plus, ShieldAlert } from "lucide-react";
import {
  ActionButton, Alert, Badge, Button, Card, CockpitHeader, Field, Row, Segmented, TextInput,
} from "@/components/terminal/ui";
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
    <div className="engine-cockpit">
      <CockpitHeader
        title="Terminal Settings"
        badges={
          <>
            <Badge tone={meta.token ? "green" : "neutral"}>
              {meta.token ? "Token set" : "No token"}
            </Badge>
            <Badge tone={meta.exnessAccountId ? "green" : "neutral"}>
              {meta.exnessAccountId ? "Exness linked" : "Exness unlinked"}
            </Badge>
            <Badge tone={meta.propAccountId ? "blue" : "neutral"}>
              {meta.propAccountId ? "Prop linked" : "Prop unlinked"}
            </Badge>
          </>
        }
        right={
          <span className="cockpit-pair">
            Credentials stay in this browser — never stored server-side
          </span>
        }
      />

      {status && (
        <Alert level={status.level} title={status.title}>
          {status.detail}
        </Alert>
      )}

      {/* ── BROKER ACCOUNT ───────────────────────────────────── */}
      <Card
        title="Broker Account"
        accent="primary"
        loading={provisionBusy}
        badge={
          accountStatus
            ? statusBadge(accountStatus.state, accountStatus.isDemo)
            : statusBadgeData === "DEPLOYING"
            ? <Badge tone="amber" live>Deploying…</Badge>
            : undefined
        }
      >
        {/* Demo-only notice */}
        <div className="alert alert-amber mb-4">
          <p className="alert-title">
            <ShieldAlert size={12} />
            Demo accounts only
          </p>
          <p className="alert-body">
            Real/live accounts are hard-blocked server-side regardless of what you enter here.
          </p>
        </div>

        {/* Token */}
        <div className="grid gap-3">
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
            <Segmented
              options={[{ value: "mt4", label: "MT4" }, { value: "mt5", label: "MT5" }] as const}
              value={platform}
              onChange={(v) => setPlatform(v)}
            />
          </Field>

          {/* Provisioning mode */}
          <Field label="Account provisioning mode">
            <Segmented
              options={[
                { value: "connect", label: "Connect existing" },
                { value: "provision", label: "Provision new demo" },
              ] as const}
              value={provisionMode}
              onChange={(v) => setProvisionMode(v)}
            />
          </Field>

          {/* Connect existing */}
          {provisionMode === "connect" && (
            <div className="fx-unfold grid gap-3">
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
              <div>
                <ActionButton disabled={provisionBusy} onClick={handleConnectExisting}>
                  {provisionBusy ? <Loader2 size={12} className="animate-spin" /> : <Link2 size={12} />}
                  {provisionBusy ? "Linking…" : "Link demo account"}
                </ActionButton>
              </div>
            </div>
          )}

          {/* Provision new */}
          {provisionMode === "provision" && (
            <div className="fx-unfold grid gap-3">
              <Field label="Broker name" hint='e.g. "Pepperstone", "ICMarkets", "XM"'>
                <TextInput
                  value={brokerName}
                  onChange={(e) => setBrokerName(e.target.value)}
                  placeholder="ICMarkets"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
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
              <div>
                <ActionButton disabled={provisionBusy} onClick={handleProvisionNew}>
                  {provisionBusy ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                  {provisionBusy ? "Provisioning…" : "Create demo account"}
                </ActionButton>
              </div>
            </div>
          )}

          {provisionError && (
            <Alert level="red" title="Provisioning failed">
              {provisionError}
            </Alert>
          )}

          {/* Live status */}
          {accountStatus && (
            <div className="panel panel-sunken fx-unfold" style={{ padding: "0.7rem" }}>
              <p className="section-label mb-1.5">Broker link</p>
              <Row label="Account ID" value={accountStatus.accountId} />
              <Row label="Name" value={accountStatus.name ?? "—"} />
              <Row label="Platform" value={accountStatus.platform.toUpperCase()} />
              <Row label="Type" value={accountStatus.accountType} />
              <Row
                label="State"
                value={accountStatus.state}
                tone={accountStatus.state === "DEPLOYED" ? "pos" : accountStatus.state === "ERROR" ? "neg" : "warn"}
                strong
              />
            </div>
          )}
        </div>
      </Card>

      {/* ── METAAPI CLOUD (advanced) ──────────────────────────── */}
      <Card title="MetaApi Cloud — Advanced" accent="highlight" loading={busy}>
        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
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
          <div className="action-buttons">
            <ActionButton disabled={busy} onClick={() => test(meta.exnessAccountId, "Exness")}>
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Plug size={12} />}
              {busy ? "Testing…" : "Test Exness connection"}
            </ActionButton>
            <Button variant="ghost" disabled={busy} onClick={() => test(meta.propAccountId, "Prop")}>
              <Plug size={12} />
              Test prop connection
            </Button>
          </div>
        </div>
      </Card>

      <Card title="Current configuration" accent="primary">
        <Row label="Token" value={meta.token ? `••••${meta.token.slice(-6)}` : "not set"} tone={meta.token ? "pos" : "warn"} />
        <Row label="Exness account" value={meta.exnessAccountId || "not set"} tone={meta.exnessAccountId ? "pos" : "warn"} />
        <Row label="Prop account" value={meta.propAccountId || "not set"} />
        <Row label="Symbol suffix" value={meta.exnessSymbolSuffix || "none"} />
        <Row label="Client API URL" value={meta.clientApiUrl || "auto (region lookup)"} strong />
      </Card>
    </div>
  );
}
