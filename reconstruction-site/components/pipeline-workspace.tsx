"use client";

import { useEffect, useRef, useState } from "react";
import { BookOpen, Box, Check, Download, Layers, LoaderCircle, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ConversionView } from "@/lib/conversions";
import type { ConversionSettings, InputUpAxis } from "@/lib/conversion-contract";
import type { JobView } from "@/lib/limits";
import ModelViewer from "@/app/model-viewer";
import { AssemblyWorkspace, type AssemblyTab } from "./assembly-workspace";

class RequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data: unknown = await response.json().catch(() => ({ error: "The saved handoff could not be reached." }));
  if (!response.ok) throw new RequestError((data as { error?: string }).error ?? "The request failed. Try again.", response.status);
  return data as T;
}
const defaultSettings: ConversionSettings = { targetParts: 2000, inputUpAxis: "y" };
const errorMessage = (error: unknown) => error instanceof Error ? error.message : "The request could not be completed.";

export function PipelineWorkspace({ job, onResultAvailable, converterConfigured = false }: { job: JobView; onResultAvailable: (value: boolean) => void; converterConfigured?: boolean }) {
  const base = `/api/jobs/${encodeURIComponent(job.id)}/conversion`;
  const [conversion, setConversion] = useState<ConversionView | null>(null);
  const [tab, setTab] = useState("mesh");
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<ConversionSettings>(defaultSettings);
  const [reload, setReload] = useState(0);
  const [previous, setPrevious] = useState<ConversionView | null>(null);
  const [pending, setPending] = useState<{ key: string; settings: ConversionSettings } | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  const selectedRequest = useRef<string | null>(null);
  useEffect(() => { onResultAvailable(conversion?.state === "result_available"); }, [conversion?.state, onResultAvailable]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    const control = new AbortController();
    void (async () => {
      try {
        const savedId = new URLSearchParams(location.search).get("conversion");
        let value = savedId
          ? (await request<{ request: ConversionView }>(`${base}/${encodeURIComponent(savedId)}/handoff`, { signal: control.signal })).request
          : await request<ConversionView | null>(base, { signal: control.signal });
        if (!value) value = await request<ConversionView>(base, { method: "POST", signal: control.signal, headers: { "Content-Type": "application/json", "Idempotency-Key": `pieces-${job.id}` }, body: JSON.stringify({ schemaVersion: 1, settings: defaultSettings }) });
        if (!control.signal.aborted) {
          setError("");
          setConversion(value); setSettings(value.settings); selectedRequest.current = value.id;
          history.replaceState(null, "", `/?job=${encodeURIComponent(job.id)}&conversion=${encodeURIComponent(value.id)}`);
          if (value.state === "result_available") setTab("model");
          const earlier = await request<ConversionView | null>(`${base}?result=latest`, { signal: control.signal });
          if (!control.signal.aborted) setPrevious(earlier && earlier.id !== value.id ? earlier : null);
        }
      } catch (cause) { if (!control.signal.aborted) setError(errorMessage(cause)); }
      finally { if (!control.signal.aborted) setLoading(false); }
    })();
    return () => control.abort();
  }, [base, job.id, reload]);

  // A supplied result may arrive through another browser or the future adapter.
  useEffect(() => {
    if (!conversion || conversion.state === "result_available") return;
    const conversionId = conversion.id;
    const control = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const handoff = await request<{ request: ConversionView }>(`${base}/${conversionId}/handoff`, { signal: control.signal });
        if (!control.signal.aborted && selectedRequest.current === conversionId) {
          setConversion(handoff.request);
          if (handoff.request.state === "result_available") { setTab("model"); return; }
        }
      } catch { /* The retained mesh and explicit refresh stay available. */ }
      if (!control.signal.aborted) timer = setTimeout(poll, 5000);
    };
    timer = setTimeout(poll, 5000);
    return () => { control.abort(); clearTimeout(timer); };
  }, [base, conversion]);

  async function createAttempt() {
    const attempt = pending ?? { key: crypto.randomUUID(), settings: { targetParts: settings.targetParts ?? 2000, inputUpAxis: settings.inputUpAxis === "unspecified" ? "y" : settings.inputUpAxis } };
    setPending(attempt); setBusy(true); setError("");
    try {
      const value = await request<ConversionView>(base, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": attempt.key }, body: JSON.stringify({ schemaVersion: 1, settings: attempt.settings }) });
      if (!alive.current) return;
      if (conversion?.state === "result_available") setPrevious(conversion);
      setConversion(value); setSettings(value.settings); selectedRequest.current = value.id; setPending(null); setTab("mesh");
      history.replaceState(null, "", `/?job=${encodeURIComponent(job.id)}&conversion=${encodeURIComponent(value.id)}`);
    } catch (cause) {
      if (alive.current) {
        if (cause instanceof RequestError && [400, 409, 429].includes(cause.status)) setPending(null);
        setError(errorMessage(cause));
      }
    }
    finally { if (alive.current) setBusy(false); }
  }
  async function runConversion() {
    if (!conversion || busy || !converterConfigured) return;
    setBusy(true); setRunning(true); setError("");
    try {
      const desired: ConversionSettings = { targetParts: settings.targetParts ?? 2000, inputUpAxis: settings.inputUpAxis === "unspecified" ? "y" : settings.inputUpAxis };
      let selected = conversion;
      if (selected.settings.targetParts !== desired.targetParts || selected.settings.inputUpAxis !== desired.inputUpAxis || selected.settings.targetSizeStuds !== undefined) {
        selected = await request<ConversionView>(base, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ schemaVersion: 1, settings: desired }) });
        if (!alive.current) return;
        setConversion(selected); setSettings(selected.settings); selectedRequest.current = selected.id;
        history.replaceState(null, "", `/?job=${encodeURIComponent(job.id)}&conversion=${encodeURIComponent(selected.id)}`);
      }
      const value = await request<ConversionView>(`${base}/${selected.id}/run`, { method: "POST" });
      if (alive.current && selectedRequest.current === selected.id) { setConversion(value); setTab("model"); }
    } catch (cause) { if (alive.current) setError(errorMessage(cause)); }
    finally { if (alive.current) { setBusy(false); setRunning(false); } }
  }
  async function upload(file: File) {
    if (!conversion || busy) return;
    setBusy(true); setError("");
    try {
      if (!/\.ldr$/i.test(file.name) || file.size > 5 * 1024 * 1024) throw Error("Choose a flat .ldr file up to 5 MB with official part references.");
      const value = await request<ConversionView>(`${base}/${conversion.id}/result`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ schemaVersion: 1, sourceObjSha256: conversion.sourceObjSha256, settingsSha256: conversion.settingsSha256, ldr: await file.text(), producer: { name: "Manually supplied LDraw", version: "unverified" } }) });
      if (!alive.current) return;
      setConversion(value); selectedRequest.current = value.id; setTab("model");
    } catch (cause) { if (alive.current) setError(errorMessage(cause)); }
    finally { if (alive.current) setBusy(false); }
  }
  const hasResult = conversion?.state === "result_available" && conversion.inspection && conversion.ldrSha256 && conversion.revisionSha256;
  return <div className="pipeline-workspace">
    <div className="pipeline-status" role="status"><span className="pipeline-status-icon">{hasResult ? <Layers size={20}/> : <Check size={20}/>}</span><div><strong>{hasResult ? "LDraw result received" : running ? "Converting your mesh to LEGO…" : "3D mesh ready"}</strong><p>{hasResult ? "Inspect the supplied model, parts and authored steps. Buildability remains unverified." : running ? "The saved mesh is being fitted to real LEGO parts. This can take a few minutes." : converterConfigured ? "Choose a piece target and convert this saved mesh. No new photo generation is needed." : "The converter backend is not configured. Your mesh remains available to download."}</p></div></div>
    <div className="handoff-settings">
      <div><label htmlFor="piece-target">Target pieces</label><Input id="piece-target" type="number" min={100} max={2200} value={settings.targetParts ?? 2000} disabled={busy} onChange={event => setSettings(value => ({ targetParts: Number(event.target.value), inputUpAxis: value.inputUpAxis === "unspecified" ? "y" : value.inputUpAxis }))}/></div>
      <div><label htmlFor="piece-up">Source upright axis</label><Select value={settings.inputUpAxis === "unspecified" ? "y" : settings.inputUpAxis} disabled={busy} onValueChange={value => setSettings(settings => ({ targetParts: settings.targetParts ?? 2000, inputUpAxis: value as InputUpAxis }))}><SelectTrigger id="piece-up"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="x">X axis</SelectItem><SelectItem value="y">Y axis</SelectItem><SelectItem value="z">Z axis</SelectItem></SelectContent></Select></div>
      <Button disabled={!converterConfigured || loading || busy || !conversion || !Number.isInteger(settings.targetParts ?? 2000) || (settings.targetParts ?? 2000) < 100 || (settings.targetParts ?? 2000) > 2200} onClick={() => void runConversion()}>{running ? <><LoaderCircle className="spinner" size={16}/>Converting…</> : "Convert to LEGO"}</Button>
      <Button asChild variant="outline"><a href={`/api/jobs/${job.id}/files/obj`} download><Download size={16}/>Download mesh OBJ</a></Button>
    </div>
    {!converterConfigured && <p className="handoff-snapshot" role="status">LEGO conversion requires the site owner to configure the converter backend. Downloads and existing results remain available.</p>}
    {conversion?.settings.targetSizeStuds !== undefined && <p className="handoff-snapshot">This saved legacy handoff uses {conversion.settings.targetSizeStuds} studs. Convert to LEGO creates a new explicit piece-target request; it does not reinterpret that size.</p>}
    <Tabs value={tab} onValueChange={setTab} className="pipeline-tabs">
      <TabsList aria-label="Model workspace views"><TabsTrigger value="mesh"><Box/>3D mesh</TabsTrigger><TabsTrigger value="model"><Layers/>Brick model</TabsTrigger><TabsTrigger value="parts"><Layers/>Parts</TabsTrigger><TabsTrigger value="instructions"><BookOpen/>Instructions</TabsTrigger></TabsList>
      <TabsContent value={tab}>
        {tab === "mesh" ? <ModelViewer id={job.id}/> : hasResult && conversion ? <AssemblyWorkspace key={conversion.revisionSha256!} result={{ url: `${base}/${conversion.id}/artifact`, revisionId: conversion.revisionSha256!, sha256: conversion.ldrSha256!, placements: conversion.inspection!.placements, steps: conversion.inspection!.stepCount, hasSteps: conversion.inspection!.hasSteps }} tab={tab as AssemblyTab}/> : <div className="assembly-message"><BookOpen size={36}/><h3>{tab === "instructions" ? "Instructions will appear with the brick model" : tab === "parts" ? "Parts will appear with the brick model" : "The brick model is awaiting conversion"}</h3><p>Your reconstructed mesh is ready. This view opens when an LDraw result is returned; your image will not need to be generated again.</p><Button variant="outline" onClick={() => setTab("mesh")}>View saved 3D mesh</Button></div>}
      </TabsContent>
    </Tabs>
    {error && <div className="pipeline-error" role="alert"><p>{error}</p><Button variant="outline" size="sm" onClick={() => setReload(value => value + 1)} disabled={busy}>Reload saved handoff</Button></div>}
    <details className="converter-tools"><summary>Converter handoff <span>{loading ? "Preparing…" : hasResult ? "Result saved" : "Integration tools"}</span></summary><div className="converter-tools-body">
      <p>For connecting Prerak’s converter: use this mesh and request together, then return its LDraw output here. Supplying a file tests the receiving side; it does not verify image-to-LEGO conversion.</p>
      {loading ? <p role="status"><LoaderCircle className="spinner" size={16}/> Preparing your saved handoff…</p> : conversion && <><Button variant="outline" disabled={busy} onClick={() => void createAttempt()}>{pending ? "Retry saving piece request" : "Save new piece-target request"}</Button>
      <p className="handoff-snapshot">Saved request: {conversion.settings.targetParts !== undefined ? `${conversion.settings.targetParts} pieces` : `${conversion.settings.targetSizeStuds} studs (legacy)`} · Up axis {conversion.settings.inputUpAxis}. Each request retains its original settings.</p>
      <div className="download-row"><Button asChild variant="outline"><a href={`/api/jobs/${job.id}/files/obj`} download><Download size={16}/> Mesh OBJ</a></Button><Button asChild variant="outline"><a href={`${base}/${conversion.id}/handoff`} download="converter-handoff.json"><Download size={16}/> Handoff JSON</a></Button>{hasResult && <Button asChild variant="outline"><a href={`${base}/${conversion.id}/artifact`} download><Download size={16}/> Result LDR</a></Button>}<Button disabled={busy || Boolean(pending) || Boolean(hasResult)} onClick={() => picker.current?.click()}><Upload size={16}/>{busy ? "Saving…" : "Supply LDraw result"}</Button><input ref={picker} hidden type="file" accept=".ldr" aria-label="Supply converter LDraw result" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void upload(file); }}/></div>
      <p className="handoff-snapshot">Each result is saved to its request and cannot be overwritten. Start a new handoff to supply another result. Automatic conversion uses the configured Python backend. Mechanical assembly and instructions remain unverified.</p>
      <p className="handoff-snapshot"><a href={`/?job=${encodeURIComponent(job.id)}&conversion=${encodeURIComponent(conversion.id)}`}>Link to this saved handoff</a></p>
      {previous && <Button variant="ghost" onClick={() => { setConversion(previous); setSettings(previous.settings); selectedRequest.current = previous.id; history.replaceState(null, "", `/?job=${encodeURIComponent(job.id)}&conversion=${encodeURIComponent(previous.id)}`); setTab("model"); }}>View previous saved result</Button>}
      </>}
    </div></details>
  </div>;
}
