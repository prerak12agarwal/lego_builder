/** UI-only fixture. x/z: studs; y: plates; +z points toward the front. Not a production catalog. */
export const catalog = {
    'brick-2x4': { name: 'Brick 2 × 4', reference: '3001', x: 2, z: 4, y: 3 },
    'brick-2x2': { name: 'Brick 2 × 2', reference: '3003', x: 2, z: 2, y: 3 },
    'plate-2x4': { name: 'Plate 2 × 4', reference: '3020', x: 2, z: 4, y: 1 },
    'plate-2x2': { name: 'Plate 2 × 2', reference: '3022', x: 2, z: 2, y: 1 },
} as const;
export const colors = {
    navy: { name: 'Dark blue', hex: '#193c70' },
    ivory: { name: 'Warm white', hex: '#f1eee3' },
    blue: { name: 'Blue', hex: '#3268d9' },
    glass: { name: 'Light blue', hex: '#73bdd3' },
} as const;
export type Placement = Readonly<{
    id: string;
    part: keyof typeof catalog;
    color: keyof typeof colors;
    x: number;
    y: number;
    z: number;
    rotation: 0 | 90;
}>;
const source: Placement[] = [];
function add(part: Placement['part'], color: Placement['color'], x: number, y: number, z: number, rotation: 0 | 90 = 0) {
    source.push(Object.freeze({ id: `house-${String(source.length + 1).padStart(3, '0')}`, part, color, x, y, z, rotation }));
}
for (const y of [0, 1, 7, 10])
    for (const x of [0, 2, 4, 6]) {
        const plate = y === 0 || y === 10;
        const color = plate ? 'navy' : 'ivory';
        add(plate ? 'plate-2x4' : 'brick-2x4', y === 7 && (x === 0 || x === 6) ? 'glass' : color, x, y, y === 7 ? 2 : 0);
        add(plate ? 'plate-2x2' : 'brick-2x2', color, x, y, y === 7 ? 0 : 4);
    }
for (const z of [0, 2, 4])
    for (const x of [0, 4])
        add('brick-2x4', 'ivory', x, 4, z, 90);
for (const x of [1, 3, 5]) {
    add('brick-2x4', 'blue', x, 11, 0);
    add('brick-2x2', 'blue', x, 11, 4);
}
for (const z of [0, 2, 4])
    add('brick-2x4', 'blue', 2, 14, z, 90);
add('brick-2x4', 'blue', 3, 17, 0);
add('brick-2x2', 'blue', 3, 17, 4);
export const revision = Object.freeze({ id: 'little-house-v1', name: 'Little house', provenance: 'Hand-authored sample', placements: Object.freeze(source) });
export function size(p: Placement) { const d = catalog[p.part]; return { x: p.rotation === 90 ? d.z : d.x, y: d.y, z: p.rotation === 90 ? d.x : d.z }; }
export function inventory(placements: readonly Placement[]) {
    const lots = new Map<string, {
        key: string;
        part: Placement['part'];
        color: Placement['color'];
        quantity: number;
    }>();
    for (const p of placements) {
        const key = `${p.part}:${p.color}`;
        const lot = lots.get(key);
        if (lot)
            lot.quantity++;
        else
            lots.set(key, { key, part: p.part, color: p.color, quantity: 1 });
    }
    return [...lots.values()].sort((a, b) => a.key.localeCompare(b.key));
}
const stepNames = ['Lay the foundation', 'Build the lower walls', 'Connect the walls', 'Add the window layer', 'Cap the walls', 'Start the blue roof', 'Raise the roof', 'Finish the ridge'];
export const steps = Object.freeze([...new Set(source.map(p => p.y))].sort((a, b) => a - b).map((y, i) => Object.freeze({ id: `${revision.id}-step-${i + 1}`, title: stepNames[i], y, placements: Object.freeze(source.filter(p => p.y === y)) })));
export function throughStep(index: number) { return revision.placements.filter(p => p.y <= steps[index].y); }
export function dimensions(placements: readonly Placement[]) {
    return { width: Math.max(...placements.map(p => p.x + size(p).x)) - Math.min(...placements.map(p => p.x)), depth: Math.max(...placements.map(p => p.z + size(p).z)) - Math.min(...placements.map(p => p.z)), height: Math.max(...placements.map(p => p.y + size(p).y)) - Math.min(...placements.map(p => p.y)) };
}
export function toCsv(placements: readonly Placement[]) {
    return ['revision,provenance,part_reference,part,color,quantity', ...inventory(placements).map(l => [revision.id, 'Unvalidated sample', catalog[l.part].reference, catalog[l.part].name, colors[l.color].name, l.quantity].join(','))].join('\r\n');
}
export function validate(placements: readonly Placement[], { requireConnected = true } = {}) {
    const errors: string[] = [];
    const ids = new Set<string>();
    const occupied = new Map<string, string>();
    if (!placements.length)
        errors.push('Empty assembly');
    for (const p of placements) {
        if (ids.has(p.id))
            errors.push(`Duplicate placement: ${p.id}`);
        ids.add(p.id);
        if (!catalog[p.part] || !colors[p.color] || ![0, 90].includes(p.rotation) || ![p.x, p.y, p.z].every(Number.isInteger) || p.y < 0) {
            errors.push(`Invalid placement: ${p.id}`);
            continue;
        }
        const d = size(p);
        for (let x = p.x; x < p.x + d.x; x++)
            for (let y = p.y; y < p.y + d.y; y++)
                for (let z = p.z; z < p.z + d.z; z++) {
                    const key = `${x},${y},${z}`;
                    if (occupied.has(key))
                        errors.push(`Collision: ${p.id}`);
                    occupied.set(key, p.id);
                }
    }
    for (const p of placements) {
        if (!catalog[p.part] || p.y === 0)
            continue;
        const d = size(p);
        for (let x = p.x; x < p.x + d.x; x++)
            for (let z = p.z; z < p.z + d.z; z++)
                if (!occupied.has(`${x},${p.y - 1},${z}`))
                    errors.push(`Unsupported: ${p.id}`);
    }
    const graph = new Map(placements.map(p => [p.id, new Set<string>()]));
    for (const p of placements) {
        if (!catalog[p.part])
            continue;
        const d = size(p);
        for (let x = p.x; x < p.x + d.x; x++)
            for (let z = p.z; z < p.z + d.z; z++) {
                const below = occupied.get(`${x},${p.y - 1},${z}`);
                if (below && below !== p.id) {
                    graph.get(p.id)?.add(below);
                    graph.get(below)?.add(p.id);
                }
            }
    }
    let components = 0;
    const visited = new Set<string>();
    for (const id of graph.keys()) {
        if (visited.has(id))
            continue;
        components++;
        const pending = [id];
        while (pending.length) {
            const current = pending.pop()!;
            if (visited.has(current))
                continue;
            visited.add(current);
            for (const neighbor of graph.get(current) ?? [])
                if (!visited.has(neighbor))
                    pending.push(neighbor);
        }
    }
    if (requireConnected && components > 1)
        errors.push(`Disconnected assembly: ${components} components`);
    return { errors, cells: occupied.size, placements: ids.size, components };
}
export const configuration = Object.freeze({ levels: ['Very easy', 'Easy', 'Medium', 'Hard', 'Very hard'], defaultLevel: 1, maxPhotos: 8, maxFileBytes: 10 * 1024 * 1024, formats: [{ mime: 'image/jpeg', label: 'JPG' }, { mime: 'image/png', label: 'PNG' }, { mime: 'image/webp', label: 'WebP' }] });
