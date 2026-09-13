"use client";
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Box, Upload, ArrowRight, ArrowLeft, Plus, Layers, BookOpen, FolderOpen, Info, Search, Download, X, ChevronUp, ChevronDown, Check, Lightbulb, Ruler, House } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarFooter, SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { AssemblyViewer } from '@/components/assembly-viewer';
import { revision, inventory, steps, throughStep, dimensions, toCsv, colors, catalog, configuration, type Placement } from '@/lib/assembly';
type Screen = 'workspace' | 'create' | 'projects';
type Photo = {
    id: string;
    url: string;
    name: string;
    label: string;
};
type ModelTool = {
    name: string;
    title: string;
    description: string;
    inputSchema: object;
    annotations: {
        readOnlyHint: boolean;
        untrustedContentHint: boolean;
    };
    execute: (input: unknown) => unknown;
};
declare global {
    interface Document {
        modelContext?: {
            registerTool: (tool: ModelTool, options?: {
                signal: AbortSignal;
            }) => void | Promise<void>;
        };
    }
}
const acceptedMimeTypes = configuration.formats.map(format => format.mime);
const formatDescription = configuration.formats.map(format => format.label).join(', ');
const maxFileSizeMiB = configuration.maxFileBytes / (1024 * 1024);
const lots = inventory(revision.placements);
const dims = dimensions(revision.placements);
function Nav({ screen, onNavigate }: {
    screen: Screen;
    onNavigate: (s: Screen) => void;
}) { const { setOpenMobile } = useSidebar(); const go = (s: Screen) => { onNavigate(s); setOpenMobile(false); }; return <Sidebar className="workshop-sidebar"><SidebarHeader><button className="brand side-brand" onClick={() => go('workspace')} aria-label="LEGO Builder home"><Box size={34}/><span><strong>LEGO</strong> Builder</span></button><button className="primary new-project" onClick={() => go('create')}><Plus size={20}/> New project</button></SidebarHeader><SidebarContent><nav className="side-nav" aria-label="Main navigation"><button className={screen === 'projects' ? 'active' : ''} onClick={() => go('projects')}><FolderOpen size={20}/> My projects</button><button className={screen === 'workspace' ? 'active' : ''} onClick={() => go('workspace')}><Box size={20}/> Sample workbench</button></nav><div className="side-section"><div className="side-label">CURRENT SAMPLE</div><button className="sample-card" onClick={() => go('workspace')}><div className="sample-icon"><House size={32}/></div><span><strong>Little house</strong><small>{revision.placements.length} pieces · Sample</small></span></button><p className="side-note">A small build to explore the workbench.</p></div><div className="side-section"><div className="side-label">THREE CONNECTED VIEWS</div><div className="side-explainer"><Box size={17}/><span>Explore every angle</span></div><div className="side-explainer"><Layers size={17}/><span>Find each piece</span></div><div className="side-explainer"><BookOpen size={17}/><span>Build one step at a time</span></div></div></SidebarContent><SidebarFooter><div className="side-bottom"><span className="preview-pill">UI PREVIEW</span><p>Made for your next little project.</p></div></SidebarFooter></Sidebar>; }
function PartList({ placements }: {
    placements: readonly Placement[];
}) { return <div className="step-parts">{inventory(placements).map(l => <div className="step-part" key={l.key}><span className="part-cue" style={{ background: colors[l.color].hex }}><Layers size={25}/></span><div><strong>{catalog[l.part].name}</strong><span>{colors[l.color].name}</span></div><b>{l.quantity} ×</b></div>)}</div>; }
export default function Home() {
    const [screen, setScreen] = useState<Screen>('workspace');
    const [tab, setTab] = useState('model');
    const [level, setLevel] = useState<number>(configuration.defaultLevel);
    const [target, setTarget] = useState('24');
    const [name, setName] = useState('');
    const [photos, setPhotos] = useState<Photo[]>([]);
    const [photoError, setPhotoError] = useState('');
    const [reading, setReading] = useState(false);
    const [step, setStep] = useState(0);
    const [query, setQuery] = useState('');
    const [color, setColor] = useState('all');
    const [message, setMessage] = useState('');
    const [generationNotice, setGenerationNotice] = useState(false);
    useEffect(() => { window.scrollTo({ top: 0, behavior: 'auto' }); }, [screen, tab]);
    const fileInput = useRef<HTMLInputElement>(null);
    const urls = useRef(new Set<string>());
    const photoRef = useRef(photos);
    photoRef.current = photos;
    const readingRef = useRef(false);
    const alive = useRef(true);
    useEffect(() => { alive.current = true; return () => { alive.current = false; for (const url of urls.current)
        URL.revokeObjectURL(url); urls.current.clear(); }; }, []);
    function navigate(s: Screen) { setScreen(s); setMessage(''); }
    function showTab(value: string) { setScreen('workspace'); setTab(value); setMessage(''); }
    useEffect(() => {
        const context = document.modelContext;
        if (!context?.registerTool)
            return;
        const life = new AbortController();
        const register = (tool: ModelTool) => { try {
            void Promise.resolve(context.registerTool(tool, { signal: life.signal })).catch(() => { });
        }
        catch { } };
        register({ name: 'navigate_sample_view', title: 'Open a sample view', description: 'Open the hand-authored Little house sample in model, parts, or instructions. Does not generate or save a model.', inputSchema: { type: 'object', properties: { view: { type: 'string', enum: ['model', 'parts', 'instructions'] } }, required: ['view'], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute(input) { if (!input || typeof input !== 'object' || !('view' in input) || !['model', 'parts', 'instructions'].includes(String(input.view)) || Object.keys(input).length !== 1)
                throw Error('Choose model, parts, or instructions.'); flushSync(() => { setScreen('workspace'); setTab(String(input.view)); }); return { revision: revision.id, view: input.view, provenance: revision.provenance }; } });
        register({ name: 'navigate_sample_step', title: 'Open an assembly step', description: 'Show a numbered step in the unvalidated sample instructions; changes session-only progress.', inputSchema: { type: 'object', properties: { step: { type: 'integer', minimum: 1, maximum: steps.length } }, required: ['step'], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute(input) { if (!input || typeof input !== 'object' || !('step' in input) || !Number.isInteger(input.step) || Number(input.step) < 1 || Number(input.step) > steps.length || Object.keys(input).length !== 1)
                throw Error(`Step must be 1 to ${steps.length}.`); flushSync(() => { setScreen('workspace'); setTab('instructions'); setStep(Number(input.step) - 1); }); return { revision: revision.id, step: input.step, visiblePieces: throughStep(Number(input.step) - 1).length }; } });
        return () => life.abort();
    }, []);
    async function addPhotos(files: FileList | File[] | null) {
        if (!files) return;
        if (readingRef.current) { setPhotoError('The additional photos were not added because another batch is still being checked. Please add them again when checking finishes.'); return; }
        readingRef.current = true;
        setReading(true);
        setPhotoError('');
        const accepted: Photo[] = [];
        const errors: string[] = [];
        try {
            for (const file of Array.from(files)) {
                if (photoRef.current.length + accepted.length >= configuration.maxPhotos) {
                    errors.push(`Keep up to ${configuration.maxPhotos} photos in this preview.`);
                    break;
                }
                if (!acceptedMimeTypes.includes(file.type)) {
                    errors.push(`${file.name}: choose an image in one of these formats: ${formatDescription}.`);
                    continue;
                }
                if (!file.size || file.size > configuration.maxFileBytes) {
                    errors.push(`${file.name}: choose a non-empty image up to ${maxFileSizeMiB} MB.`);
                    continue;
                }
                const url = URL.createObjectURL(file);
                urls.current.add(url);
                try {
                    await new Promise<void>((resolve, reject) => { const image = new Image(); image.onload = () => image.naturalWidth > 0 ? resolve() : reject(); image.onerror = reject; image.src = url; });
                    if (!alive.current) {
                        URL.revokeObjectURL(url);
                        urls.current.delete(url);
                        break;
                    }
                    accepted.push({ id: crypto.randomUUID(), url, name: file.name, label: 'Unlabeled view' });
                }
                catch {
                    URL.revokeObjectURL(url);
                    urls.current.delete(url);
                    errors.push(`${file.name}: this image could not be read. Try another photo.`);
                }
            }
            if (alive.current) {
                setPhotos(p => [...p, ...accepted]);
                setPhotoError(previous => [previous, ...errors].filter(Boolean).join(' '));
            }
        }
        finally {
            readingRef.current = false;
            if (alive.current)
                setReading(false);
            if (fileInput.current)
                fileInput.current.value = '';
        }
    }
    function removePhoto(id: string) { const photo = photos.find(p => p.id === id); if (photo) {
        URL.revokeObjectURL(photo.url);
        urls.current.delete(photo.url);
    } setPhotos(p => p.filter(x => x.id !== id)); }
    function movePhoto(index: number, delta: number) { setPhotos(p => { const next = [...p]; [next[index], next[index + delta]] = [next[index + delta], next[index]]; return next; }); }
    function download() { try {
        const blob = new Blob([toCsv(revision.placements)], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${revision.id}-sample-parts.csv`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setMessage('Sample parts CSV downloaded. Quantities describe this sample revision only.');
    }
    catch {
        setMessage('The export could not be downloaded. Please try again.');
    } }
    const filtered = lots.filter(l => (color === 'all' || l.color === color) && `${catalog[l.part].name} ${catalog[l.part].reference} ${colors[l.color].name}`.toLowerCase().includes(query.toLowerCase()));
    return <SidebarProvider style={{ '--sidebar-width': '248px' } as React.CSSProperties}><Nav screen={screen} onNavigate={navigate}/><div className="main-shell"><header className="workspace-header"><div className="mobile-menu"><SidebarTrigger /></div><div className="breadcrumb">Your workshop <span>/</span> <strong>{screen === 'workspace' ? 'Little house' : screen === 'create' ? 'New project' : 'My projects'}</strong></div><span className="top-preview">Sample-first preview</span></header>
 {screen === 'workspace' ? <Tabs value={tab} onValueChange={setTab} className="workspace-tabs"><div className="workspace-toolbar"><TabsList className="view-tabs"><TabsTrigger value="model"><Box /> Model</TabsTrigger><TabsTrigger value="parts"><Layers /> Parts</TabsTrigger><TabsTrigger value="instructions"><BookOpen /> Instructions</TabsTrigger></TabsList><span className="revision-label">Little house <span>·</span> Revision 1 <span>·</span> Sample</span></div>
 <TabsContent value="model"><div className="model-layout"><AssemblyViewer /><aside className="detail-panel"><div className="eyebrow">THE SAMPLE COLLECTION</div><h1>Little house</h1><span className="sample-badge">Hand-authored sample</span><p className="muted">A blue roof, light-filled windows, and a place for your imagination. Explore this miniature, piece by piece.</p><div className="stats"><div><Layers size={21}/><b>{revision.placements.length}</b><span>pieces</span></div><div><BookOpen size={21}/><b>{steps.length}</b><span>steps</span></div><div><Box size={21}/><b>{Object.keys(colors).length}</b><span>colors</span></div></div><div className="dimensions"><Ruler size={20}/><div><strong>Model dimensions</strong><p>{dims.width} × {dims.depth} studs · {dims.height} plates high</p><span>Approx. {(dims.width * .8).toFixed(1)} × {(dims.depth * .8).toFixed(1)} × {(dims.height * .32).toFixed(1)} cm</span></div></div><div className="notice"><Info size={18}/><span>Not generated from photos. This sample has not been checked in Studio or physically built.</span></div><div className="panel-actions"><button className="primary" onClick={() => showTab('parts')}><Layers size={20}/> View parts <ArrowRight size={19}/></button><button className="secondary" onClick={() => showTab('instructions')}><BookOpen size={20}/> Explore instructions</button></div><p className="small muted center">Display platform is not included in the parts.</p></aside></div></TabsContent>
 <TabsContent value="parts"><section className="parts-page"><div className="title-row"><div><div className="eyebrow">EVERY PIECE, ACCOUNTED FOR</div><h1>Your sample parts</h1><p className="muted">{revision.placements.length} pieces across {lots.length} part-and-color combinations.</p></div><button className="primary" onClick={download}><Download size={19}/> Export CSV</button></div><div className="parts-summary"><span><strong>{revision.placements.length}</strong> required pieces</span><span><strong>{lots.length}</strong> unique lots</span><span>Price <strong>Unavailable</strong></span><span className="sample-badge">Sample revision 1</span></div><div className="parts-filter"><div className="search-field"><Search size={19}/><input aria-label="Search parts" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by part, number or color"/></div><Select value={color} onValueChange={setColor}><SelectTrigger aria-label="Filter by color"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All colors</SelectItem>{Object.entries(colors).map(([id, c]) => <SelectItem key={id} value={id}>{c.name}</SelectItem>)}</SelectContent></Select></div><div className="parts-table"><Table><TableHeader><TableRow><TableHead>Part</TableHead><TableHead>Reference</TableHead><TableHead>Color</TableHead><TableHead className="quantity">Quantity</TableHead></TableRow></TableHeader><TableBody>{filtered.map(l => <TableRow key={l.key}><TableCell><div className="part-name"><span className="part-cue" style={{ background: colors[l.color].hex }}><Layers size={26}/></span><div><strong>{catalog[l.part].name}</strong><small className="mobile-part-ref">{catalog[l.part].reference}</small></div></div></TableCell><TableCell>{catalog[l.part].reference}</TableCell><TableCell><div className="color-name"><span style={{ background: colors[l.color].hex }}/>{colors[l.color].name}</div></TableCell><TableCell className="quantity"><strong>{l.quantity}</strong></TableCell></TableRow>)}</TableBody></Table>{filtered.length === 0 && <Empty><EmptyHeader><EmptyTitle>No matching pieces</EmptyTitle><EmptyDescription>Try a different part name or color.</EmptyDescription></EmptyHeader><button className="secondary" onClick={() => { setQuery(''); setColor('all'); }}>Clear filters</button></Empty>}</div><p className="notice"><Info size={18}/><span>These quantities match the sample model. Part references and colors are illustrative and have not been verified for purchasing. No spares or decorative platform are included.</span></p><p role="status" className="small muted">{message}</p></section></TabsContent>
 <TabsContent value="instructions"><div className="instruction-layout"><aside className="step-navigation"><div className="eyebrow">LITTLE HOUSE · SAMPLE</div><h2>One layer at a time</h2><nav aria-label="Assembly steps">{steps.map((s, i) => <button key={s.id} aria-current={step === i ? 'step' : undefined} className={step === i ? 'current' : ''} onClick={() => setStep(i)}><span className="step-number">{i < step ? <Check size={16}/> : i + 1}</span><span>{s.title}<small>{s.placements.length} new pieces</small></span></button>)}</nav><p className="small muted">Progress stays in this session and is tied to sample revision 1.</p></aside><div className="instruction-stage"><AssemblyViewer placements={throughStep(step)} highlight={steps[step].placements.map(p => p.id)}/></div><aside className="detail-panel step-detail"><div className="eyebrow">STEP {step + 1} OF {steps.length}</div><h2>{steps[step].title}</h2><p className="muted">Place these {steps[step].placements.length} pieces on {step === 0 ? 'the ground plane' : 'the previous layer'}. Their positions are outlined in blue.</p><h3>Pieces for this step</h3><PartList placements={steps[step].placements}/><div className="notice"><Lightbulb size={20}/><span>New pieces have bold outlines. Earlier layers are faded. Rotate to see how they line up.</span></div><p className="small muted">Illustrative layer sequence. Physical assembly and stability have not been tested.</p>{step === steps.length - 1 && <div className="sample-finish"><Check size={21}/><span>Full sample assembled: {revision.placements.length} of {revision.placements.length} pieces shown.</span></div>}</aside></div><div className="step-footer"><button className="secondary" disabled={step === 0} onClick={() => setStep(s => s - 1)}><ArrowLeft size={19}/> Previous</button><div><strong aria-live="polite">Step {step + 1} of {steps.length}</strong><Progress value={(step + 1) / steps.length * 100} aria-label="Current position in sample instructions"/><span>{throughStep(step).length} of {revision.placements.length} pieces shown</span></div><button className="primary" onClick={() => step === steps.length - 1 ? showTab('model') : setStep(s => s + 1)}>{step === steps.length - 1 ? 'View full model' : 'Next step'}<ArrowRight size={19}/></button></div></TabsContent></Tabs>
            : screen === 'create' ? <main className="create-page"><div className="create-heading"><div className="eyebrow">START SOMETHING SMALL</div><h1>Create a new project</h1><p className="muted">Bring an everyday object to the workbench.</p></div><div className="create-workbench"><section className="panel create-controls"><h2>1. Add your photos</h2><p className="muted small">Use clear views of the same simple object, with a plain background.</p><input ref={fileInput} type="file" accept={acceptedMimeTypes.join(',')} multiple className="sr-only" tabIndex={-1} onChange={e => void addPhotos(e.target.files)}/><div className={'upload-zone ' + (photos.length ? 'has-photos' : '')} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); void addPhotos(e.dataTransfer.files); }}><Upload size={30}/><strong>{reading ? 'Reading photos…' : 'Drop photos here'}</strong><button className="secondary" disabled={reading || photos.length >= configuration.maxPhotos} onClick={() => fileInput.current?.click()}>{photos.length ? 'Add photos' : 'Choose photos'}</button><span className="small muted">{formatDescription} · {maxFileSizeMiB} MB each · up to {configuration.maxPhotos}</span></div><p role="status" className="small muted">{reading ? 'Checking your photos…' : photos.length ? `${photos.length} ${photos.length === 1 ? 'photo' : 'photos'} ready for review` : ''}</p>{photoError && <p role="alert" className="error">{photoError}</p>}<div className="photos">{photos.map((p, i) => <div className="photo" key={p.id}><img src={p.url} alt={p.name}/><div className="photo-actions"><button aria-label={`Move ${p.name} earlier`} disabled={i === 0} onClick={() => movePhoto(i, -1)}><ChevronUp size={16}/></button><button aria-label={`Move ${p.name} later`} disabled={i === photos.length - 1} onClick={() => movePhoto(i, 1)}><ChevronDown size={16}/></button><button aria-label={`Remove ${p.name}`} onClick={() => removePhoto(p.id)}><X size={16}/></button></div><Select value={p.label} onValueChange={v => setPhotos(items => items.map(x => x.id === p.id ? { ...x, label: v } : x))}><SelectTrigger aria-label={`View label for ${p.name}`}><SelectValue /></SelectTrigger><SelectContent>{['Unlabeled view', 'Front', 'Back', 'Left', 'Right', 'Top', 'Detail'].map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select></div>)}</div><p className="small muted">Photos stay in this browser session. Nothing is uploaded or saved.</p><div className="form-divider"/><h2>2. Make it yours</h2><label className="section-label" htmlFor="project-name">Project name</label><input className="field" id="project-name" placeholder="My next build" maxLength={80} value={name} onChange={e => setName(e.target.value)}/><div className="section-label">Complexity <b>{configuration.levels[level]}</b></div><Slider min={0} max={4} step={1} value={[level]} onValueChange={v => setLevel(v[0])} aria-label="Build complexity" aria-valuetext={configuration.levels[level]}/><div className="levels">{configuration.levels.map((l, i) => <button key={l} aria-pressed={i === level} className={i === level ? 'selected' : ''} onClick={() => setLevel(i)}>{l}</button>)}</div><label className="section-label" htmlFor="model-size">Target longest dimension <span>studs</span></label><input id="model-size" className="field" type="number" min={1} step={1} value={target} onChange={e => setTarget(e.target.value)}/><p className="small muted">Piece count is determined during generation. Size and complexity limits are still being calibrated.</p><button className="primary" style={{ width: '100%' }} onClick={() => setGenerationNotice(true)}>Review generation availability <ArrowRight size={18}/></button>{generationNotice && <div role="status" className="notice" style={{ marginTop: 16 }}><Info size={19}/><span>Real generation is not connected yet. Your {photos.length ? 'photos and ' : ''}settings stay here while you explore the separate sample model.</span></div>}</section><section className="create-sample"><div className="sample-stage-label"><span className="sample-badge">Sample inspiration</span><p>Little house · not generated from your photos</p></div><AssemblyViewer /><div className="sample-callout"><div><h2>A little inspiration</h2><p className="muted">Explore the model, find its pieces, and follow each layer.</p></div><button className="primary" onClick={() => showTab('model')}>Open sample <ArrowRight size={18}/></button></div><div className="capture-tip"><Lightbulb size={22}/><p>Start with a simple, solid shape. Thin details and large overhangs are harder to translate into bricks.</p></div></section></div></main>
                : <main className="projects-page"><div className="title-row"><div><div className="eyebrow">YOUR WORKBENCH</div><h1>My projects</h1></div><button className="primary" onClick={() => navigate('create')}><Plus size={18}/> New project</button></div><section className="project-empty"><Empty><EmptyHeader><FolderOpen size={35}/><EmptyTitle>No saved projects yet</EmptyTitle><EmptyDescription>Project saving is not connected in this preview. Your current setup stays available for this browser session.</EmptyDescription></EmptyHeader><button className="secondary" onClick={() => navigate('create')}>{photos.length || name ? 'Return to current setup' : 'Start a project'}</button></Empty></section><h2>Explore a sample</h2><p className="muted">Get a feel for the workbench before your first build.</p><button className="project-sample" onClick={() => showTab('model')}><AssemblyViewer compact/><div><span className="sample-badge">Hand-authored sample</span><h2>Little house</h2><p>{revision.placements.length} pieces · {steps.length} steps</p><span className="project-open">Open workbench <ArrowRight size={19}/></span></div></button></main>}
 <footer className="workspace-footer"><span>LEGO Builder · Independent UI prototype</span><span>Sample models are not physically validated.</span></footer></div></SidebarProvider>;
}
