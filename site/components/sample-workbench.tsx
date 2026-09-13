"use client";
import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { Box, ArrowRight, ArrowLeft, Layers, BookOpen, Info, Search, Download, Check, Lightbulb, Ruler } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { WorkshopNavigation } from '@/components/workshop-shell';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { AdminTestBench } from '@/components/admin/test-bench';
import { AssemblyViewer } from '@/components/assembly-viewer';
import { revision, inventory, steps, throughStep, dimensions, toCsv, colors, catalog, type Placement } from '@/lib/assembly';
type Screen = 'workspace' | 'admin';
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
const lots = inventory(revision.placements);
const dims = dimensions(revision.placements);
function PartList({ placements }: {
    placements: readonly Placement[];
}) { return <div className="step-parts">{inventory(placements).map(l => <div className="step-part" key={l.key}><span className="part-cue" style={{ background: colors[l.color].hex }}><Layers size={25}/></span><div><strong>{catalog[l.part].name}</strong><span>{colors[l.color].name}</span></div><b>{l.quantity} ×</b></div>)}</div>; }
export function SampleWorkbench({ initialScreen = 'workspace' }: { initialScreen?: 'workspace' | 'admin' }) {
    const [screen, setScreen] = useState<Screen>(initialScreen);
    const [tab, setTab] = useState('model');
    const [step, setStep] = useState(0);
    const [query, setQuery] = useState('');
    const [color, setColor] = useState('all');
    const [message, setMessage] = useState('');
    useEffect(() => { window.scrollTo({ top: 0, behavior: 'auto' }); }, [screen, tab]);
    function navigate(s: Screen) { setScreen(s); setMessage(''); history.replaceState(null, '', s === 'admin' ? '/?view=admin' : '/'); }
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
    return <SidebarProvider style={{ '--sidebar-width': '248px' } as React.CSSProperties}><WorkshopNavigation current={screen === 'admin' ? 'admin' : 'sample'} onNavigate={view => navigate(view === 'admin' ? 'admin' : 'workspace')}/><div className="main-shell"><header className="workspace-header"><div className="mobile-menu"><SidebarTrigger /></div><div className="breadcrumb">Your workshop <span>/</span> <strong>{screen === 'admin' ? 'Admin test bench' : 'Little house'}</strong></div><span className="top-preview">{screen === 'admin' ? 'Local LDraw inspection' : 'Sample-first preview'}</span></header>
 <div hidden={screen !== 'admin'}><AdminTestBench active={screen === 'admin'}/></div>
 {screen === 'admin' ? null : <Tabs value={tab} onValueChange={setTab} className="workspace-tabs"><div className="workspace-toolbar"><TabsList className="view-tabs"><TabsTrigger value="model"><Box /> Model</TabsTrigger><TabsTrigger value="parts"><Layers /> Parts</TabsTrigger><TabsTrigger value="instructions"><BookOpen /> Instructions</TabsTrigger></TabsList><span className="revision-label">Little house <span>·</span> Revision 1 <span>·</span> Sample</span></div>
 <TabsContent value="model"><div className="model-layout"><AssemblyViewer /><aside className="detail-panel"><div className="eyebrow">THE SAMPLE COLLECTION</div><h1>Little house</h1><span className="sample-badge">Hand-authored sample</span><p className="muted">A blue roof, light-filled windows, and a place for your imagination. Explore this miniature, piece by piece.</p><div className="stats"><div><Layers size={21}/><b>{revision.placements.length}</b><span>pieces</span></div><div><BookOpen size={21}/><b>{steps.length}</b><span>steps</span></div><div><Box size={21}/><b>{Object.keys(colors).length}</b><span>colors</span></div></div><div className="dimensions"><Ruler size={20}/><div><strong>Model dimensions</strong><p>{dims.width} × {dims.depth} studs · {dims.height} plates high</p><span>Approx. {(dims.width * .8).toFixed(1)} × {(dims.depth * .8).toFixed(1)} × {(dims.height * .32).toFixed(1)} cm</span></div></div><div className="notice"><Info size={18}/><span>Not generated from photos. This sample has not been checked in Studio or physically built.</span></div><div className="panel-actions"><button className="primary" onClick={() => showTab('parts')}><Layers size={20}/> View parts <ArrowRight size={19}/></button><button className="secondary" onClick={() => showTab('instructions')}><BookOpen size={20}/> Explore instructions</button></div><p className="small muted center">Display platform is not included in the parts.</p></aside></div></TabsContent>
 <TabsContent value="parts"><section className="parts-page"><div className="title-row"><div><div className="eyebrow">EVERY PIECE, ACCOUNTED FOR</div><h1>Your sample parts</h1><p className="muted">{revision.placements.length} pieces across {lots.length} part-and-color combinations.</p></div><button className="primary" onClick={download}><Download size={19}/> Export CSV</button></div><div className="parts-summary"><span><strong>{revision.placements.length}</strong> required pieces</span><span><strong>{lots.length}</strong> unique lots</span><span>Price <strong>Unavailable</strong></span><span className="sample-badge">Sample revision 1</span></div><div className="parts-filter"><div className="search-field"><Search size={19}/><input aria-label="Search parts" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by part, number or color"/></div><Select value={color} onValueChange={setColor}><SelectTrigger aria-label="Filter by color"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All colors</SelectItem>{Object.entries(colors).map(([id, c]) => <SelectItem key={id} value={id}>{c.name}</SelectItem>)}</SelectContent></Select></div><div className="parts-table"><Table><TableHeader><TableRow><TableHead>Part</TableHead><TableHead>Reference</TableHead><TableHead>Color</TableHead><TableHead className="quantity">Quantity</TableHead></TableRow></TableHeader><TableBody>{filtered.map(l => <TableRow key={l.key}><TableCell><div className="part-name"><span className="part-cue" style={{ background: colors[l.color].hex }}><Layers size={26}/></span><div><strong>{catalog[l.part].name}</strong><small className="mobile-part-ref">{catalog[l.part].reference}</small></div></div></TableCell><TableCell>{catalog[l.part].reference}</TableCell><TableCell><div className="color-name"><span style={{ background: colors[l.color].hex }}/>{colors[l.color].name}</div></TableCell><TableCell className="quantity"><strong>{l.quantity}</strong></TableCell></TableRow>)}</TableBody></Table>{filtered.length === 0 && <Empty><EmptyHeader><EmptyTitle>No matching pieces</EmptyTitle><EmptyDescription>Try a different part name or color.</EmptyDescription></EmptyHeader><button className="secondary" onClick={() => { setQuery(''); setColor('all'); }}>Clear filters</button></Empty>}</div><p className="notice"><Info size={18}/><span>These quantities match the sample model. Part references and colors are illustrative and have not been verified for purchasing. No spares or decorative platform are included.</span></p><p role="status" className="small muted">{message}</p></section></TabsContent>
 <TabsContent value="instructions"><div className="instruction-layout"><aside className="step-navigation"><div className="eyebrow">LITTLE HOUSE · SAMPLE</div><h2>One layer at a time</h2><nav aria-label="Assembly steps">{steps.map((s, i) => <button key={s.id} aria-current={step === i ? 'step' : undefined} className={step === i ? 'current' : ''} onClick={() => setStep(i)}><span className="step-number">{i < step ? <Check size={16}/> : i + 1}</span><span>{s.title}<small>{s.placements.length} new pieces</small></span></button>)}</nav><p className="small muted">Progress stays in this session and is tied to sample revision 1.</p></aside><div className="instruction-stage"><AssemblyViewer placements={throughStep(step)} highlight={steps[step].placements.map(p => p.id)}/></div><aside className="detail-panel step-detail"><div className="eyebrow">STEP {step + 1} OF {steps.length}</div><h2>{steps[step].title}</h2><p className="muted">Place these {steps[step].placements.length} pieces on {step === 0 ? 'the ground plane' : 'the previous layer'}. Their positions are outlined in blue.</p><h3>Pieces for this step</h3><PartList placements={steps[step].placements}/><div className="notice"><Lightbulb size={20}/><span>New pieces have bold outlines. Earlier layers are faded. Rotate to see how they line up.</span></div><p className="small muted">Illustrative layer sequence. Physical assembly and stability have not been tested.</p>{step === steps.length - 1 && <div className="sample-finish"><Check size={21}/><span>Full sample assembled: {revision.placements.length} of {revision.placements.length} pieces shown.</span></div>}</aside></div><div className="step-footer"><button className="secondary" disabled={step === 0} onClick={() => setStep(s => s - 1)}><ArrowLeft size={19}/> Previous</button><div><strong aria-live="polite">Step {step + 1} of {steps.length}</strong><Progress value={(step + 1) / steps.length * 100} aria-label="Current position in sample instructions"/><span>{throughStep(step).length} of {revision.placements.length} pieces shown</span></div><button className="primary" onClick={() => step === steps.length - 1 ? showTab('model') : setStep(s => s + 1)}>{step === steps.length - 1 ? 'View full model' : 'Next step'}<ArrowRight size={19}/></button></div></TabsContent></Tabs>}
 <footer className="workspace-footer"><span>LEGO Builder · Independent UI prototype</span><span>Sample models are not physically validated.</span></footer></div></SidebarProvider>;
}
