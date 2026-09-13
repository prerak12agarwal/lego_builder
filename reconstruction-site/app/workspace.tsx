"use client";

import { useEffect, useRef, useState } from "react";
import { Box, Upload, ArrowRight, RotateCcw, Check, X, Download, LoaderCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { validateImageInput } from "@/core/src/image";
import { ACTIVE_STATES, LIMITS, type JobView } from "@/lib/limits";
import ModelViewer from "./model-viewer";

type Config = { configured: boolean; latest: JobView | null; latestReady: JobView | null };
const stageText: Record<string, [string, string]> = {
  submitting: ["Sending your photo", "Your job is being submitted to TRELLIS."],
  queued: ["Your model is in the queue", "TRELLIS will begin when a generator is available."],
  generating: ["Building your model", "TRELLIS is inferring the object's shape from your photo."],
  collecting: ["Preparing your model", "Checking the returned mesh and saving your downloads."],
  unknown: ["Submission needs checking", "The request may have reached TRELLIS. Check fal request history before trying again."],
  failed: ["This model could not be completed", "Your photo is still available. Review the message below before starting again."],
  deleted: ["This model was removed", "Choose a photo to start a new generation."],
};
async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({ error: "The service could not be reached. Try again shortly." }));
  if (!response.ok) throw Object.assign(new Error((data as { error?: string }).error ?? "The request failed."), { status: response.status });
  return data as T;
}
const message = (e: unknown) => e instanceof Error ? e.message : "The request could not be completed.";

export default function Workspace() {
  const picker = useRef<HTMLInputElement>(null);
  const selection = useRef(0);
  const [photo, setPhoto] = useState<string | null>(null);
  const [input, setInput] = useState<Blob | null>(null);
  const [filename, setFilename] = useState("");
  const [error, setError] = useState("");
  const [config, setConfig] = useState<Config | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [signInPath, setSignInPath] = useState("/signin-with-chatgpt?return_to=%2F");
  const [job, setJob] = useState<JobView | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingRequest, setPendingRequest] = useState<string | null>(null);
  const [previousReady, setPreviousReady] = useState<string | null>(null);
  const active = Boolean(job && ACTIVE_STATES.includes(job.state));
  const ready = job?.state === "ready";

  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo); }, [photo]);
  useEffect(() => {
    let mounted = true;
    setSignInPath(`/signin-with-chatgpt?return_to=${encodeURIComponent(location.pathname + location.search)}`);
    void api<Config>("/api/config").then(async value => {
      if (!mounted) return;
      setConfig(value);
      setPreviousReady(value.latestReady?.id ?? null);
      const params = new URLSearchParams(location.search);
      const id = params.get("job"), requestKey = params.get("request");
      let existing = value.latest;
      if (id) existing = await api<JobView>(`/api/jobs/${encodeURIComponent(id)}`);
      else if (requestKey) { existing = await api<JobView | null>(`/api/jobs?request=${encodeURIComponent(requestKey)}`); if (!existing) setPendingRequest(requestKey); }
      if (mounted && existing) selectJob(existing);
    }).catch(e => { if (mounted) { setSignedOut(e.status === 401); setError(message(e)); } });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!job || !["submitting", "queued", "generating", "collecting"].includes(job.state)) return;
    let alive = true, timer: ReturnType<typeof setTimeout>;
    const currentId = job.id;
    const poll = async () => {
      try {
        const updated = await api<JobView>(`/api/jobs/${currentId}`, { method: "POST" });
        if (alive) { setJob(updated); setError(""); }
      } catch (e) { if (alive) setError(message(e)); }
      if (alive) timer = setTimeout(poll, 5000);
    };
    timer = setTimeout(poll, 1500);
    return () => { alive = false; clearTimeout(timer); };
  }, [job?.id, job?.state]);

  function selectJob(value: JobView) {
    setJob(value); setPendingRequest(null);
    history.replaceState(null, "", `/?job=${encodeURIComponent(value.id)}`);
  }
  async function choose(file?: File) {
    if (!file || active || busy || pendingRequest) return;
    const token = ++selection.current;
    setBusy(true); setError("");
    try {
      if (file.size > LIMITS.inputBytes) throw new Error("Choose a JPG or PNG no larger than 10 MB.");
      validateImageInput(new Uint8Array(await file.arrayBuffer()));
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, LIMITS.imageEdge / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) { bitmap.close(); throw new Error("Your browser could not prepare this image."); }
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
      const normalized = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Image preparation failed.")), "image/png"));
      if (normalized.size > LIMITS.normalizedBytes) throw new Error("Choose a smaller image.");
      if (token !== selection.current) return;
      setInput(normalized); setFilename(file.name); setPhoto(URL.createObjectURL(normalized));
    } catch { setError("This image could not be read. Choose a valid JPG or PNG up to 10 MB and 40 megapixels."); }
    finally { if (token === selection.current) setBusy(false); if (picker.current) picker.current.value = ""; }
  }
  async function generate() {
    if (!input || active || busy || pendingRequest || !config?.configured) return;
    const key = crypto.randomUUID();
    setBusy(true); setError(""); setPendingRequest(key);
    if (ready && job) setPreviousReady(job.id);
    history.replaceState(null, "", `/?request=${key}`);
    try { selectJob(await api<JobView>("/api/jobs", { method: "POST", headers: { "Content-Type": "image/png", "Idempotency-Key": key }, body: input })); }
    catch (e) {
      // Recover the durable id before letting the user start another potentially billed job.
      try {
        const saved = await api<JobView | null>(`/api/jobs?request=${key}`);
        if (saved) selectJob(saved);
        else if ((e as { status?: number }).status) { setPendingRequest(null); history.replaceState(null, "", job ? `/?job=${job.id}` : "/"); }
      } catch { /* The pending request URL remains the recovery hint. */ }
      setError(message(e));
    } finally { setBusy(false); }
  }
  async function checkPending() {
    if (!pendingRequest) return;
    setBusy(true);
    try { const saved = await api<JobView | null>(`/api/jobs?request=${pendingRequest}`); if (saved) selectJob(saved); else setError("No saved submission was found yet. Wait briefly and check again before starting another generation."); }
    catch (e) { setError(message(e)); } finally { setBusy(false); }
  }
  async function remove() {
    if (!job) return;
    setBusy(true); setError("");
    try { await api(`/api/jobs/${job.id}`, { method: "DELETE" }); setJob(null); setPendingRequest(null); history.replaceState(null, "", "/"); }
    catch (e) { setError(message(e)); } finally { setBusy(false); }
  }
  const displayedPhoto = photo ?? (job && job.state !== "deleted" ? `/api/jobs/${job.id}/files/source` : null);
  const stage = stageText[job?.state ?? ""];
  return <div className="workshop">
    <header className="app-header"><a className="brand" href="/"><Box size={28}/><span>LEGO <b>Builder</b></span></a><span className="header-tag">IMAGE TO 3D · PILOT</span></header>
    <main className="workbench">
      <div className="page-heading"><div><p className="eyebrow">RECONSTRUCTION WORKBENCH</p><h1>Turn your photo into a 3D model.</h1><p className="muted">One object. A new shape to explore.</p></div><span className="step-pill">01 / RECONSTRUCT</span></div>
      <div className="work-grid">
        <aside className="input-panel">
          <div className="panel-title"><span className="number">1</span><h2>Your reference</h2></div>
          <input ref={picker} type="file" accept="image/jpeg,image/png" hidden onChange={e => void choose(e.target.files?.[0])}/>
          <button className="photo-drop" disabled={active || busy || Boolean(pendingRequest)} onClick={() => picker.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => {e.preventDefault(); void choose(e.dataTransfer.files[0]);}} aria-label="Choose a reference photo">
            {displayedPhoto ? <img src={displayedPhoto} alt="Reference photo for this object"/> : <><span className="upload-icon"><Upload size={27}/></span><strong>Drop your object here</strong><span>or choose a photo</span><small>JPG or PNG · up to 10 MB</small></>}
          </button>
          {photo && <div className="photo-caption"><span>{filename}</span><Button variant="ghost" size="icon" disabled={active || busy || Boolean(pendingRequest)} aria-label="Remove selected photo" onClick={() => {setPhoto(null);setInput(null);setFilename("");}}><X/></Button></div>}
          {job && !active && !input && job.state !== "deleted" && <Button variant="outline" className="saved-photo-button" disabled={busy} onClick={async () => {
            try { const r = await fetch(`/api/jobs/${job.id}/files/source`); if (!r.ok) throw new Error("The saved photo is unavailable."); await choose(new File([await r.blob()], "saved-photo.png", { type: "image/png" })); } catch (e) { setError(message(e)); }
          }}>Use saved photo</Button>}
          <div className="photo-tips"><h3>A good starting photo</h3><p><Check/> One object, fully in view</p><p><Check/> A clear, simple background</p><p><Check/> Even light and a useful angle</p></div>
          <div className="mode-card"><Box size={21}/><div><strong>Shape first</strong><p>A neutral model with GLB and OBJ downloads.</p></div></div>
          {signedOut ? <Button asChild className="generate-button"><a href={signInPath} target="_top">Sign in with ChatGPT</a></Button> : <Button className="generate-button" onClick={() => void generate()} disabled={!input || !config?.configured || active || busy || Boolean(pendingRequest)}>{busy ? "Preparing…" : "Generate 3D model"}{busy ? <LoaderCircle className="spinner"/> : <ArrowRight size={18}/>}</Button>}
          <p className="setup-note">{signedOut ? "Sign in to keep your models private and recover saved jobs." : !config ? "Connecting to your workspace…" : !config.configured ? "Generation needs to be configured by the site owner." : `Powered by TRELLIS. Up to ${LIMITS.dailyPerUser} submissions per person per day in this pilot.`}</p>
          <p className="privacy-note">Generate sends your resized photo to fal. Saved photos and models stay in your private workspace until removed. Provider output expiration is requested after 24 hours.</p>
          {pendingRequest && <Button variant="outline" onClick={() => void checkPending()} disabled={busy}>Check saved submission</Button>}
          {error && <p role="alert" className="error-note">{error}</p>}
        </aside>
        <section className="model-panel" aria-label="3D model workspace">
          <div className="viewer-header"><div><span className="number">2</span><h2>Your 3D model</h2></div><span className="viewer-label">{ready ? "READY TO EXPLORE" : "PERSPECTIVE VIEW"}</span></div>
          {ready && job ? <ModelViewer key={job.id} id={job.id}/> : <div className="empty-stage"><Empty><EmptyHeader><EmptyMedia><span className="stage-icon">{active && job?.state !== "unknown" ? <LoaderCircle size={38} className="spinner"/> : <Box size={38} strokeWidth={1.25}/>}</span></EmptyMedia><EmptyTitle>{stage?.[0] ?? "A new perspective awaits."}</EmptyTitle><EmptyDescription>{stage?.[1] ?? "Your generated model will appear here. Rotate it and inspect its shape."}</EmptyDescription></EmptyHeader></Empty></div>}
          {job && <div className="job-details" aria-live="polite">
            {ready ? <><div className="model-summary"><strong>{job.triangles?.toLocaleString()} triangles</strong><span>Physical scale unknown · LEGO compatibility unchecked</span>{job.bounds && <span>Bounds: {job.bounds.max.map((v, i) => (v - job.bounds!.min[i]).toPrecision(3)).join(" × ")} model units</span>}</div><div className="download-row">{["glb", "obj", "manifest"].map(kind => <Button asChild variant={kind === "glb" ? "default" : "outline"} key={kind}><a href={`/api/jobs/${job.id}/files/${kind}`} download><Download size={16}/>{kind === "manifest" ? "Model details" : `Download ${kind.toUpperCase()}`}</a></Button>)}</div></> : <p>{job.message ?? (active ? "Keep this page open to collect the result, or return through this job link promptly." : "Choose another photo to make a new model.")}</p>}
            <div className="job-actions"><a href={`/?job=${job.id}`}>Saved job link</a><AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" disabled={busy}><Trash2 size={15}/>Remove job</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Remove this job and its files?</AlertDialogTitle><AlertDialogDescription>This removes your saved photo and downloads from this workspace. An active provider request may still finish and be charged. Provider copies follow fal’s retention settings. If submission is uncertain, check your fal history first.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep job</AlertDialogCancel><AlertDialogAction onClick={() => void remove()}>Remove job</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div>
          </div>}
          <div className="viewer-footer"><span><RotateCcw size={16}/> Drag to rotate · Scroll to zoom · Arrow keys pan</span><span>Geometry preview</span></div>
        </section>
      </div>
      {previousReady && previousReady !== job?.id && <p className="previous-model"><a href={`/?job=${previousReady}`}>Open your previous completed model</a></p>}
      <footer className="page-footer"><span>Photos become approximate shapes. Hidden surfaces are inferred.</span><span>LEGO conversion is a later step.</span></footer>
    </main>
  </div>;
}
