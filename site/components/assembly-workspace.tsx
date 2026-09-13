"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Download, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { createPartTransport } from "@/lib/ldraw/transport";
import { importLDraw } from "@/lib/ldraw/import";
import { importLimits, importedCsv, importedInventory } from "@/lib/ldraw/model";
import { disposeModel, prepareLDraw, type LoadedLDraw } from "@/lib/ldraw/render";
import { LDrawViewer } from "./ldraw-viewer";

export type AssemblyTab = "model" | "parts" | "instructions";
export type SavedAssembly = { url: string; revisionId: string; sha256: string; placements: number; steps: number; hasSteps: boolean };

/** Stored inspection artifacts retain their server identity; no sample or inferred steps. */
export function AssemblyWorkspace({ result, tab }: { result: SavedAssembly; tab: AssemblyTab }) {
  const transport = useRef<ReturnType<typeof createPartTransport> | null>(null);
  if (!transport.current) transport.current = createPartTransport();
  const [loaded, setLoaded] = useState<LoadedLDraw | null>(null);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("Opening the saved LDraw result…");
  const [retry, setRetry] = useState(0);
  const [step, setStep] = useState(0);
  const [query, setQuery] = useState("");
  const [missingSteps, setMissingSteps] = useState(false);
  const [draftSteps, setDraftSteps] = useState(false);
  useEffect(() => {
    const control = new AbortController();
    let current: LoadedLDraw | null = null;
    const timer = setTimeout(() => control.abort(new Error("The parts library took too long to respond. Retry opening the saved result.")), importLimits.timeoutMs);
    void (async () => {
      try {
        const response = await fetch(result.url, { signal: control.signal });
        if (control.signal.aborted) return;
        setLoaded(null); setError(""); setProgress("Checking the saved result…"); setStep(0); setQuery("");
        if (!response.ok) throw Error("The saved LDraw file could not be downloaded. Try again.");
        const bytes = await response.arrayBuffer();
        if (bytes.byteLength > importLimits.fileBytes) throw Error("This result exceeds the supported file size.");
        const digest = await crypto.subtle.digest("SHA-256", bytes);
        const checksum = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
        if (checksum !== result.sha256) throw Error("The downloaded file does not match this saved result.");
        const colors = await fetch("/ldraw/LDConfig.ldr", { signal: control.signal });
        if (!colors.ok) throw Error("The LDraw color library could not be loaded.");
        const ldr = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        const draft = ldr.split(/\r?\n/).some(line => line.trim() === "0 !LEGO_BUILDER_INSTRUCTIONS DRAFT_LAYER_V1");
        const revision = await importLDraw("model.ldr", ldr, await colors.text(), (name, signal) => transport.current!(name, signal, setProgress), control.signal, setProgress);
        if (revision.placements.length !== result.placements || revision.steps.length !== result.steps || revision.hasSteps !== result.hasSteps)
          throw Error("The model and assembly steps do not match the saved result metadata.");
        revision.id = result.revisionId;
        control.signal.throwIfAborted();
        current = await prepareLDraw(revision);
        control.signal.throwIfAborted();
        setLoaded(current); setDraftSteps(draft); setMissingSteps(!revision.hasSteps); setProgress("");
      } catch (cause) {
        if (current && control.signal.aborted) disposeModel(current.group);
        if (!control.signal.aborted || control.signal.reason?.message?.includes("too long"))
          setError(cause instanceof Error ? cause.message : "The model could not be opened.");
      } finally { clearTimeout(timer); }
    })();
    return () => { control.abort(); clearTimeout(timer); if (current) disposeModel(current.group); };
  }, [result.url, result.revisionId, result.sha256, result.placements, result.steps, result.hasSteps, retry]);

  if (error) return <div className="assembly-message" role="alert"><h3>The model could not open</h3><p>{error}</p><p>The saved file is retained. Opening it again does not rerun TRELLIS.</p><Button variant="outline" onClick={() => setRetry(value => value + 1)}><RotateCcw size={16}/> Retry opening model</Button></div>;
  if (!loaded) return <div className="assembly-message" role="status"><span className="ldr-spinner"/><p>{progress}</p></div>;
  const model = loaded.revision;
  const lots = importedInventory(model.placements);
  const matches = lots.filter(lot => `${lot.name} ${lot.part} ${lot.colorName}`.toLowerCase().includes(query.toLowerCase()));
  const added = model.placements.filter(part => part.step === step);
  const placed = model.placements.filter(part => part.step <= step).length;
  function downloadCsv() {
    const url = URL.createObjectURL(new Blob([importedCsv(model)], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `lego-parts-${result.revisionId.slice(0,12)}.csv`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <div className="assembly-content">
    <div className="assembly-summary"><strong>{model.placements.length.toLocaleString()} pieces</strong><span>{lots.length} part / color combinations</span><span>{model.hasSteps ? `${model.steps.length} ${draftSteps ? "draft" : "authored"} steps` : "Assembly steps missing"}</span></div>
    {tab === "instructions" && model.hasSteps && draftSteps && <p className="assembly-disclaimer" role="note"><strong>Draft instructions</strong> — assembly order, connections, stability and physical buildability are unverified.</p>}
    {tab === "model" && <LDrawViewer loaded={loaded}/>}
    {tab === "parts" && <><div className="assembly-toolbar"><input aria-label="Search parts" placeholder="Search parts or colors…" value={query} onChange={event => setQuery(event.target.value)}/><Button variant="outline" onClick={downloadCsv}><Download size={16}/> Parts CSV</Button></div><Table><TableHeader><TableRow><TableHead>Part</TableHead><TableHead>Color</TableHead><TableHead>Quantity</TableHead></TableRow></TableHeader><TableBody>{matches.map(lot => <TableRow key={lot.key}><TableCell><strong>{lot.name}</strong><small className="part-id">{lot.part}</small></TableCell><TableCell><span className="part-color" style={{ background: lot.colorHex }}/>{lot.colorName}</TableCell><TableCell>{lot.quantity}</TableCell></TableRow>)}</TableBody></Table>{!matches.length && <p className="assembly-message">No matching parts.</p>}</>}
    {tab === "instructions" && (model.hasSteps ? <><div className="assembly-stepbar"><div><h3>Step {step + 1} of {model.steps.length}</h3><p>{added.length} {added.length === 1 ? "piece" : "pieces"} added · {placed} of {model.placements.length} placed</p></div><div className="assembly-step-controls"><Select value={String(step)} onValueChange={value => setStep(Number(value))}><SelectTrigger aria-label="Choose assembly step"><SelectValue/></SelectTrigger><SelectContent>{model.steps.map((item,index) => <SelectItem key={item.number} value={String(index)}>Step {item.number}</SelectItem>)}</SelectContent></Select><Button variant="outline" size="icon" aria-label="Previous step" disabled={step === 0} onClick={() => setStep(value => value - 1)}><ArrowLeft size={16}/></Button><Button disabled={step === model.steps.length - 1} onClick={() => setStep(value => value + 1)}>Next step <ArrowRight size={16}/></Button></div></div><LDrawViewer loaded={loaded} step={step}/><div className="step-pieces"><h3>Pieces for this step</h3>{importedInventory(added).map(lot => <div key={lot.key}><span className="part-color" style={{ background: lot.colorHex }}/><span>{lot.name} · {lot.colorName}</span><strong>×{lot.quantity}</strong></div>)}</div></> : <div className="assembly-message"><BookOpen size={36}/><h3>Assembly steps aren’t included</h3><p>This LDraw file has no authored step boundaries. The full model and parts remain available. Start a new handoff attempt to supply a corrected file.</p></div>)}
    <p className="assembly-disclaimer">Supplied LDraw result · Physical buildability and its match to the source mesh have not been verified.</p>
    {model.warnings.length > 0 && <details className="assembly-notes"><summary>Import notes</summary><ul>{model.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></details>}
    <p className="assembly-attribution">Geometry: <a href="https://library.ldraw.org/" target="_blank" rel="noreferrer">LDraw contributors</a> · <a href="https://www.ldraw.org/article/227.html" target="_blank" rel="noreferrer">Library licenses</a></p>
    <AlertDialog open={missingSteps} onOpenChange={setMissingSteps}><AlertDialogContent><AlertDialogTitle>Assembly steps aren’t included</AlertDialogTitle><AlertDialogDescription>The saved file contains no authored step boundaries. You can inspect the full model and its parts; instructions are unavailable.</AlertDialogDescription><AlertDialogFooter><AlertDialogAction>View model</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}
