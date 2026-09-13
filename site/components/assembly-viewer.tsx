"use client";
import { useEffect, useRef, useState } from 'react';
import { RotateCcw, RotateCw, ZoomIn, ZoomOut, Maximize, Move, ArrowLeft, ArrowRight, ArrowUp, ArrowDown } from 'lucide-react';
import { colors, size, revision, type Placement } from '@/lib/assembly';
type Point = [
    number,
    number,
    number
];
const start = { yaw: .7, pitch: .48, zoom: 1, panX: 0, panY: 0 };
function shade(hex: string, n: number) { const rgb = parseInt(hex.slice(1), 16); return `rgb(${[16, 8, 0].map(s => Math.min(255, Math.max(0, ((rgb >> s) & 255) + n))).join(',')})`; }
export function AssemblyViewer({ placements = revision.placements, highlight, compact = false }: {
    placements?: readonly Placement[];
    highlight?: readonly string[];
    compact?: boolean;
}) {
    const canvas = useRef<HTMLCanvasElement>(null);
    const host = useRef<HTMLDivElement>(null);
    const [view, setView] = useState(start);
    const [pan, setPan] = useState(false);
    const [unavailable, setUnavailable] = useState(false);
    const [bounds, setBounds] = useState({ width: 700, height: 580 });
    const drag = useRef<{
        x: number;
        y: number;
    } | null>(null);
    useEffect(() => { if (!host.current)
        return; const observer = new ResizeObserver(entries => { const r = entries[0].contentRect; setBounds({ width: r.width, height: r.height }); }); observer.observe(host.current); return () => observer.disconnect(); }, []);
    useEffect(() => {
        const el = canvas.current;
        if (!el)
            return;
        const ctx = el.getContext('2d');
        if (!ctx) {
            setUnavailable(true);
            return;
        }
        const { width: w, height: h } = bounds;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        el.width = w * dpr;
        el.height = h * dpr;
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, w, h);
        const scale = Math.min(w / 19, h / 16) * (compact ? 1.05 : 1) * view.zoom;
        const project = ([x, y, z]: Point): [
            number,
            number,
            number
        ] => { x -= 4; z -= 3; const xx = x * Math.cos(view.yaw) - z * Math.sin(view.yaw); const zz = x * Math.sin(view.yaw) + z * Math.cos(view.yaw); return [w / 2 + xx * scale + view.panX, h * .66 + (zz * Math.sin(view.pitch) - y * Math.cos(view.pitch)) * scale + view.panY, zz * Math.cos(view.pitch) + y * Math.sin(view.pitch)]; };
        const polygon = (pts: Point[], fill: string, stroke = 'rgba(20,40,75,.12)', line = 1) => { ctx.beginPath(); pts.forEach((p, i) => { const q = project(p); if (i === 0)
            ctx.moveTo(q[0], q[1]);
        else
            ctx.lineTo(q[0], q[1]); }); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = stroke; ctx.lineWidth = line; ctx.stroke(); };
        // The plinth is staging only and is never included in the sample inventory.
        ctx.save();
        ctx.shadowColor = 'rgba(25,45,78,.23)';
        ctx.shadowBlur = 30;
        ctx.shadowOffsetY = 22;
        polygon([[-2, -.35, -2], [10, -.35, -2], [10, -.35, 8], [-2, -.35, 8]], '#dbe3f1');
        ctx.restore();
        polygon([[-2, -.1, 8], [10, -.1, 8], [10, -.35, 8], [-2, -.35, 8]], '#c8d4e6');
        polygon([[10, -.1, -2], [10, -.1, 8], [10, -.35, 8], [10, -.35, -2]], '#d4deec');
        polygon([[-2, -.1, -2], [10, -.1, -2], [10, -.1, 8], [-2, -.1, 8]], '#fdfefe');
        const sorted = [...placements].sort((a, b) => { const da = size(a), db = size(b); return a.y - b.y || project([a.x + da.x / 2, (a.y + da.y / 2) * .4, a.z + da.z / 2])[2] - project([b.x + db.x / 2, (b.y + db.y / 2) * .4, b.z + db.z / 2])[2]; });
        for (const p of sorted) {
            const d = size(p);
            const x = p.x + .025, z = p.z + .025, y = p.y * .4;
            const x2 = x + d.x - .05, z2 = z + d.z - .05, y2 = y + d.y * .4 - .035;
            const old = !!highlight && !highlight.includes(p.id);
            const c = old ? '#cdd7e3' : colors[p.color].hex;
            const line = highlight?.includes(p.id) ? '#164de0' : 'rgba(17,38,69,.2)';
            const lw = highlight?.includes(p.id) ? 1.8 : .7;
            if (Math.cos(view.yaw) >= 0)
                polygon([[x, y, z2], [x2, y, z2], [x2, y2, z2], [x, y2, z2]], shade(c, -22), line, lw);
            else
                polygon([[x2, y, z], [x, y, z], [x, y2, z], [x2, y2, z]], shade(c, -22), line, lw);
            if (Math.sin(view.yaw) >= 0)
                polygon([[x2, y, z2], [x2, y, z], [x2, y2, z], [x2, y2, z2]], shade(c, -42), line, lw);
            else
                polygon([[x, y, z], [x, y, z2], [x, y2, z2], [x, y2, z]], shade(c, -42), line, lw);
            polygon([[x, y2, z], [x2, y2, z], [x2, y2, z2], [x, y2, z2]], shade(c, 8), line, lw);
            for (let sx = p.x + .5; sx < p.x + d.x; sx++)
                for (let sz = p.z + .5; sz < p.z + d.z; sz++) {
                    const q = project([sx, y2 + .1, sz]);
                    const r = scale * .3, ry = Math.max(1, r * Math.sin(view.pitch));
                    ctx.beginPath();
                    ctx.ellipse(q[0], q[1] + scale * .09, r, ry, 0, 0, Math.PI * 2);
                    ctx.fillStyle = shade(c, -27);
                    ctx.fill();
                    ctx.beginPath();
                    ctx.ellipse(q[0], q[1], r, ry, 0, 0, Math.PI * 2);
                    ctx.fillStyle = shade(c, 15);
                    ctx.fill();
                    ctx.strokeStyle = shade(c, -12);
                    ctx.lineWidth = .6;
                    ctx.stroke();
                }
        }
    }, [placements, highlight, view, bounds, compact]);
    function key(e: React.KeyboardEvent) { const k = e.key; if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '-', '0'].includes(k))
        return; e.preventDefault(); setView(v => k === '0' ? start : { ...v, yaw: v.yaw + (k === 'ArrowLeft' ? -.12 : k === 'ArrowRight' ? .12 : 0), pitch: Math.max(.15, Math.min(1.2, v.pitch + (k === 'ArrowUp' ? .07 : k === 'ArrowDown' ? -.07 : 0))), zoom: Math.max(.5, Math.min(2.2, v.zoom + (k === '+' ? .1 : k === '-' ? -.1 : 0))) }); }
    return <div className={'viewer ' + (compact ? 'compact' : '')}><div className="canvas-host" ref={host}><canvas ref={canvas} role="img" aria-label={`Interactive sample assembly, ${placements.length} visible bricks. Arrow keys rotate; plus and minus zoom; zero resets.`} tabIndex={compact ? -1 : 0} onKeyDown={key} onPointerDown={e => { drag.current = { x: e.clientX, y: e.clientY }; e.currentTarget.setPointerCapture(e.pointerId); }} onPointerUp={() => drag.current = null} onPointerCancel={() => drag.current = null} onPointerMove={e => { if (!drag.current)
        return; const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y; drag.current = { x: e.clientX, y: e.clientY }; setView(v => pan ? { ...v, panX: v.panX + dx, panY: v.panY + dy } : { ...v, yaw: v.yaw + dx * .008, pitch: Math.max(.15, Math.min(1.2, v.pitch + dy * .006)) }); }}/><noscript>The sample contains {revision.placements.length} placements. Enable JavaScript to inspect it.</noscript>{unavailable && <div className="viewer-fallback">The model view is unavailable. You can still inspect the parts and follow the text steps.</div>}</div>{!compact && <><div className="viewer-tag">SAMPLE MODEL <span>·</span> {placements.length} pieces shown</div><div className="view-tools" aria-label="Camera controls"><button title="Rotate left" aria-label="Rotate left" onClick={() => setView(v => ({ ...v, yaw: v.yaw - .25 }))}><RotateCcw /></button><button title="Rotate right" aria-label="Rotate right" onClick={() => setView(v => ({ ...v, yaw: v.yaw + .25 }))}><RotateCw /></button><span /><button title="Zoom in" aria-label="Zoom in" onClick={() => setView(v => ({ ...v, zoom: Math.min(2.2, v.zoom + .15) }))}><ZoomIn /></button><button title="Zoom out" aria-label="Zoom out" onClick={() => setView(v => ({ ...v, zoom: Math.max(.5, v.zoom - .15) }))}><ZoomOut /></button><span /><button title="Fit and reset view" aria-label="Fit and reset view" onClick={() => setView(start)}><Maximize /></button><button title="Drag to pan" aria-label="Drag to pan" aria-pressed={pan} onClick={() => setPan(!pan)}><Move /></button></div>{pan && <div className="pan-tools">{[[ArrowLeft, -25, 0, 'Pan left'], [ArrowRight, 25, 0, 'Pan right'], [ArrowUp, 0, -25, 'Pan up'], [ArrowDown, 0, 25, 'Pan down']].map(([Icon, x, y, label]) => { const I = Icon as typeof ArrowLeft; return <button key={String(label)} aria-label={String(label)} onClick={() => setView(v => ({ ...v, panX: v.panX + Number(x), panY: v.panY + Number(y) }))}><I size={18}/></button>; })}</div>}<div className="viewer-hint">Drag to {pan ? 'pan' : 'rotate'} <span>·</span> Arrow keys to orbit</div></>}</div>;
}
