import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Bot, Phone, MessageCircle, Zap, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/agent")({
  component: AgentPage,
});

function AgentPage() {
  const [settings, setSettings] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [running, setRunning] = useState(false);

  const load = async () => {
    const [{ data: s }, { data: l }] = await Promise.all([
      supabase.from("app_settings").select("*").eq("id", 1).single(),
      supabase.from("agent_logs").select("*").order("run_at", { ascending: false }).limit(20),
    ]);
    setSettings(s);
    setLogs(l ?? []);
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    const { error } = await supabase.from("app_settings").update({
      agent_autopilot: settings.agent_autopilot,
      ai_calls_enabled: settings.ai_calls_enabled,
      ai_calls_delay_min: settings.ai_calls_delay_min,
      calling_provider: settings.calling_provider,
      vapi_assistant_id: settings.vapi_assistant_id,
      custom_calling_endpoint: settings.custom_calling_endpoint,
      custom_calling_token: settings.custom_calling_token,
      ai_auto_reply_enabled: settings.ai_auto_reply_enabled,
      openai_model: settings.openai_model,
    }).eq("id", 1);
    if (error) toast.error(error.message);
    else toast.success("Settings saved!");
  };

  const runAgent = async () => {
    setRunning(true);
    try {
      const { data: s } = await supabase.from("app_settings").select("bridge_secret").eq("id", 1).single();
      const res = await fetch("/api/public/agent/run", {
        method: "POST",
        headers: { Authorization: `Bearer ${s?.bridge_secret}` },
      });
      const result = await res.json();
      toast.success(`Agent ran: ${result.callsScheduled ?? 0} calls, ${result.repliesHandled ?? 0} replies handled`);
      load();
    } catch (e: any) {
      toast.error("Agent run failed: " + e.message);
    }
    setRunning(false);
  };

  if (!settings) return <div className="p-4 text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Bot className="h-6 w-6 text-purple-500" /> AI Agent</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load}><RefreshCw className="h-3 w-3 mr-1" /> Refresh</Button>
          <Button onClick={runAgent} disabled={running} className="bg-purple-600 hover:bg-purple-700">
            {running ? "Running…" : "Run Agent Now"}
          </Button>
        </div>
      </div>

      {/* Auto-pilot toggle */}
      <Card className={settings.agent_autopilot ? "border-purple-400" : ""}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-purple-500" />
            Auto-Pilot Mode
            {settings.agent_autopilot && <Badge className="bg-purple-600">Active</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center gap-3">
            <Switch
              checked={settings.agent_autopilot}
              onCheckedChange={(v) => setSettings({ ...settings, agent_autopilot: v })}
            />
            <span className="text-sm">
              {settings.agent_autopilot
                ? "Agent is running autonomously"
                : "Agent is in manual mode"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            When enabled, the agent automatically schedules calls, handles customer replies,
            and retries failed messages. Triggers via cron or bridge heartbeat.
          </p>
        </CardContent>
      </Card>

      {/* AI Calling */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Phone className="h-4 w-4 text-blue-500" /> AI Calling Setup</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Switch
              checked={settings.ai_calls_enabled}
              onCheckedChange={(v) => setSettings({ ...settings, ai_calls_enabled: v })}
            />
            <Label>Enable AI calls for new orders</Label>
          </div>
          
          <div className="flex items-center gap-3 mb-2">
            <Label className="text-sm">Calling Provider:</Label>
            <select
              className="border rounded p-1 text-sm bg-background"
              value={settings.calling_provider ?? "vapi"}
              onChange={(e) => setSettings({ ...settings, calling_provider: e.target.value })}
            >
              <option value="vapi">VAPI.ai (Default)</option>
              <option value="custom">Custom Webhook / Your Own Agent</option>
            </select>
          </div>

          {settings.calling_provider === "custom" ? (
            <div className="space-y-3 bg-muted/50 p-3 rounded border">
              <div>
                <Label className="text-xs">Custom Agent Webhook URL</Label>
                <Input
                  placeholder="https://your-agent.com/make-call"
                  value={settings.custom_calling_endpoint ?? ""}
                  onChange={(e) => setSettings({ ...settings, custom_calling_endpoint: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">Authorization Token (Optional)</Label>
                <Input
                  placeholder="Bearer token..."
                  value={settings.custom_calling_token ?? ""}
                  onChange={(e) => setSettings({ ...settings, custom_calling_token: e.target.value })}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                We will send a POST request here with <code>order_id, phone, first_message, items</code> when a call is needed.<br/>
                Your system should execute the call and later POST the transcript back to:<br/>
                <code className="bg-muted px-1 rounded block mt-1">{window.location.origin}/api/public/call-webhook</code>
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 bg-muted/50 p-3 rounded border">
              <div>
                <Label className="text-xs">Call after X minutes</Label>
                <Input
                  type="number"
                  min={1}
                  max={60}
                  value={settings.ai_calls_delay_min}
                  onChange={(e) => setSettings({ ...settings, ai_calls_delay_min: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label className="text-xs">VAPI Assistant ID</Label>
                <Input
                  placeholder="asst_xxxxxxxx"
                  value={settings.vapi_assistant_id ?? ""}
                  onChange={(e) => setSettings({ ...settings, vapi_assistant_id: e.target.value })}
                />
              </div>
              <p className="text-xs text-muted-foreground col-span-2">
                Get your VAPI Assistant ID from <a href="https://vapi.ai" target="_blank" className="text-primary underline">vapi.ai</a>.
                Set VAPI_API_KEY in your .env file.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI Auto-Reply */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><MessageCircle className="h-4 w-4 text-green-500" /> AI Auto-Reply (WhatsApp)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Switch
              checked={settings.ai_auto_reply_enabled}
              onCheckedChange={(v) => setSettings({ ...settings, ai_auto_reply_enabled: v })}
            />
            <Label>Auto-reply to customer WhatsApp messages</Label>
          </div>
          <div>
            <Label className="text-xs">OpenAI Model</Label>
            <Input
              placeholder="gpt-4o-mini"
              value={settings.openai_model ?? "gpt-4o-mini"}
              onChange={(e) => setSettings({ ...settings, openai_model: e.target.value })}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Set OPENAI_API_KEY in .env. AI analyzes customer intent (cancel, address change, status query, etc.)
            and auto-replies with confidence &gt; 60%.
          </p>
        </CardContent>
      </Card>

      <Button onClick={save} className="w-full">Save All Agent Settings</Button>

      {/* Agent Run Logs */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Recent Agent Runs</h2>
        {logs.length === 0 && <div className="text-sm text-muted-foreground">No runs yet. Click "Run Agent Now" to test.</div>}
        <div className="space-y-2">
          {logs.map((log) => (
            <div key={log.id} className="rounded-md border p-3 text-sm">
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium">{new Date(log.run_at).toLocaleString()}</span>
                <span className="text-xs text-muted-foreground">{log.duration_ms}ms</span>
              </div>
              <div className="flex gap-4 text-xs text-muted-foreground">
                <span>📋 {log.orders_processed} orders</span>
                <span>📞 {log.calls_scheduled} calls</span>
                <span>💬 {log.replies_handled} replies</span>
                <span>📤 {log.messages_queued} messages</span>
                {log.errors?.length > 0 && <span className="text-red-500">⚠ {log.errors.length} errors</span>}
              </div>
              {log.actions_taken?.length > 0 && (
                <details className="mt-1">
                  <summary className="text-xs cursor-pointer text-muted-foreground">Actions taken ({log.actions_taken.length})</summary>
                  <ul className="mt-1 text-xs space-y-0.5 pl-3">
                    {(log.actions_taken as string[]).map((a, i) => <li key={i}>• {a}</li>)}
                  </ul>
                </details>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
