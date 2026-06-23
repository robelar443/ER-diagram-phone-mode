import React, { useRef, useEffect } from 'react';

import type { EREntity, ERRelationship } from './types';

export const SNAKE_COLORS = [
    { main: '#10b981', glow: '#059669', name: 'Smaragd' },
    { main: '#3b82f6', glow: '#2563eb', name: 'Blå' },
    { main: '#8b5cf6', glow: '#7c3aed', name: 'Lilla' },
    { main: '#f43f5e', glow: '#e11d48', name: 'Rosa' },
    { main: '#f59e0b', glow: '#d97706', name: 'Oransje' },
    { main: '#06b6d4', glow: '#0891b2', name: 'Turkis' }
];

interface CanvasGridProps {
    entities: EREntity[];
    relationships: ERRelationship[];
    activeRelationshipId: number | null;
    isSolving: boolean;
    gridW: number;
    gridH: number;
    onGridClick: (x: number, y: number) => void;
    onEdgeClick?: (relId: number, segmentIdx: number, gridX: number, gridY: number) => void;
}

const getEdgePoint = (path: number[], isStart: boolean, cellW: number, cellH: number, gridW: number) => {
    const startIdx = isStart ? 0 : path.length - 1;
    const nextIdx = isStart ? 1 : path.length - 2;
    
    const startU = path[startIdx];
    const nextU = path[nextIdx];
    
    const px = (startU % gridW) * cellW + cellW / 2;
    const py = Math.floor(startU / gridW) * cellH + cellH / 2;
    
    const nx = (nextU % gridW) * cellW + cellW / 2;
    const ny = Math.floor(nextU / gridW) * cellH + cellH / 2;
    
    let dx = 0, dy = 0;
    if (nx > px) dx = 1;
    else if (nx < px) dx = -1;
    else if (ny > py) dy = 1;
    else if (ny < py) dy = -1;
    
    return { px, py, dx, dy, idx: startIdx };
};

const drawCardinalitySymbol = (ctx: CanvasRenderingContext2D, px: number, py: number, dx: number, dy: number, color: string, type: string, usedPositions: {x: number, y: number}[], entities: EREntity[], cellW: number, cellH: number) => {
    let normType = type;
    if (type === '1') normType = '1..1';
    if (type === 'N' || type === 'M') normType = '0..N';

    let pdx = -dy; 
    let pdy = dx;  
    
    // Teksten står nå på selve linjen (forskjøvet ut fra midten, pga px, py nå er midt på stien)
    // Vi fjerner dx * 50 fordi px, py allerede er trukket ut fra boksen
    let cx = px + pdx * 25;
    let cy = py + pdy * 25;

    // Sjekk om teksten havner UNDER en entitetsboks!
    const isInsideEntity = (x: number, y: number) => {
        return entities.some(e => {
            const ew = e.fields ? Math.max(8, 6 + Math.max(...e.fields.map(f => f.name.length)) * 0.4) : 8;
            const eh = 6 + (e.fields ? e.fields.length : 0);
            const eLeft = (e.x - ew / 2) * cellW;
            const eRight = (e.x + ew / 2) * cellW;
            const eTop = (e.y - eh / 2) * cellH;
            const eBottom = (e.y + eh / 2) * cellH;
            return x >= eLeft - 20 && x <= eRight + 20 && y >= eTop - 20 && y <= eBottom + 20;
        });
    };

    if (isInsideEntity(cx, cy)) {
        cx = px - pdx * 25;
        cy = py - pdy * 25;
        pdx = -pdx;
        pdy = -pdy;
    }

    // Sjekk om det er kollisjon med eksisterende kardinaliteter, flytt den i så fall
    while (usedPositions.some(p => Math.abs(p.x - cx) < 30 && Math.abs(p.y - cy) < 30)) {
        cx += pdx * 40;
        cy += pdy * 40;
    }
    usedPositions.push({x: cx, y: cy});

    ctx.font = "bold 24px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // "Blender inn" ved å tegne en tykk kant rundt teksten i samme farge som bakgrunnen
    ctx.strokeStyle = '#292929'; // Standard mørk Fluent UI bakgrunn
    ctx.lineWidth = 8;
    ctx.lineJoin = 'round';
    ctx.strokeText(normType, cx, cy);

    ctx.fillStyle = color;
    ctx.fillText(normType, cx, cy);
};

const drawCardinality = (ctx: CanvasRenderingContext2D, path: number[], isStart: boolean, type: string | undefined, color: string, cellW: number, cellH: number, usedPositions: {x: number, y: number}[], entities: EREntity[], gridW: number) => {
    if (!type || type === 'none' || path.length < 2) return;
    
    // Velg et punkt litt lenger ut på stien for å unngå at alle samler seg akkurat i T-krysset
    let targetIdx = isStart ? Math.min(3, path.length - 2) : Math.max(1, path.length - 4);
    let nextIdx = isStart ? targetIdx + 1 : targetIdx - 1;

    if (path.length <= 4) { // Fallback for veldig korte stier
        targetIdx = isStart ? 0 : path.length - 1;
        nextIdx = isStart ? 1 : path.length - 2;
    }

    const startU = path[targetIdx];
    const nextU = path[nextIdx];
    
    const px = (startU % gridW) * cellW + cellW / 2;
    const py = Math.floor(startU / gridW) * cellH + cellH / 2;
    
    const nx = (nextU % gridW) * cellW + cellW / 2;
    const ny = Math.floor(nextU / gridW) * cellH + cellH / 2;
    
    let dx = 0, dy = 0;
    if (nx > px) dx = 1;
    else if (nx < px) dx = -1;
    else if (ny > py) dy = 1;
    else if (ny < py) dy = -1;

    drawCardinalitySymbol(ctx, px, py, dx, dy, color, type, usedPositions, entities, cellW, cellH);
};

export const CanvasGrid: React.FC<CanvasGridProps> = ({
    entities,
    relationships,
    activeRelationshipId,
    isSolving,
    gridW,
    gridH,
    onGridClick,
    onEdgeClick
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const drawCanvas = (ctx: CanvasRenderingContext2D, width: number, height: number, time: number) => {
        const cellW = width / gridW;
        const cellH = height / gridH;
        const usedCardPositions: {x: number, y: number}[] = [];

        ctx.clearRect(0, 0, width, height);

        // 1. Tegn subtilt rutenett
        ctx.fillStyle = '#1e293b'; 
        for (let x = cellW / 2; x < width; x += cellW) {
            for (let y = cellH / 2; y < height; y += cellH) {
                ctx.beginPath();
                ctx.arc(x, y, 2, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // 2. Tegn alle ruter/slanger
        relationships.forEach(rel => {
            const colors = SNAKE_COLORS[rel.colorIdx];
            const isActive = rel.id === activeRelationshipId;

            if (rel.paths && rel.paths.length > 0) {
                // Base slangekropp
                ctx.beginPath();
                ctx.strokeStyle = colors.main;
                ctx.shadowColor = colors.glow;
                ctx.shadowBlur = isActive ? 10 + Math.sin(time / 200) * 5 : 5; 
                ctx.lineWidth = Math.min(cellW, cellH) * 0.35;
                ctx.lineJoin = 'round';
                ctx.lineCap = 'round';

                rel.paths.forEach((path, idx) => {
                    if (path.length <= 1) return;
                    const startEdge = getEdgePoint(path, true, cellW, cellH, gridW);
                    const endEdge = getEdgePoint(path, false, cellW, cellH, gridW);

                    if (idx === 0) {
                        ctx.moveTo(startEdge.px, startEdge.py);
                    } else {
                        ctx.lineTo(startEdge.px, startEdge.py);
                    }

                    // If it's a straight line where startEdge/endEdge crossed the same segment, skip inner loop
                    for (let i = startEdge.idx; i <= endEdge.idx; i++) {
                        let u = path[i];
                        let cx = (u % gridW) * cellW + cellW / 2;
                        let cy = Math.floor(u / gridW) * cellH + cellH / 2;
                        ctx.lineTo(cx, cy);
                    }
                    ctx.lineTo(endEdge.px, endEdge.py);
                });
                ctx.stroke();
                
                if (isActive) {
                    ctx.strokeStyle = 'white';
                    ctx.lineWidth = 1;
                    ctx.stroke();
                }
                ctx.shadowBlur = 0;

                // Tegn koblingspunkter (sockets)
                rel.paths.forEach((path, idx) => {
                    if (path.length <= 1) return;
                    const startEdge = getEdgePoint(path, true, cellW, cellH, gridW);
                    const endEdge = getEdgePoint(path, false, cellW, cellH, gridW);
                    
                    const drawSocket = (px: number, py: number) => {
                        ctx.beginPath();
                        ctx.arc(px, py, 5, 0, Math.PI * 2);
                        ctx.fillStyle = '#1e293b';
                        ctx.fill();
                        ctx.lineWidth = 2.5;
                        ctx.strokeStyle = colors.main;
                        ctx.stroke();
                        ctx.beginPath();
                        ctx.arc(px, py, 2, 0, Math.PI * 2);
                        ctx.fillStyle = colors.main;
                        ctx.fill();
                    };

                    drawSocket(startEdge.px, startEdge.py);
                    drawSocket(endEdge.px, endEdge.py);

                    // Tegn kardinaliteter hvis satt
                    let lcType = rel.cardinalities && rel.cardinalities[idx] ? rel.cardinalities[idx].split('|')[0] : '1';
                    drawCardinality(ctx, path, true, lcType, colors.main, cellW, cellH, usedCardPositions, entities, gridW);
                    
                    let rcType = rel.cardinalities && rel.cardinalities[idx] ? rel.cardinalities[idx].split('|')[1] : '1';
                    drawCardinality(ctx, path, false, rcType, colors.main, cellW, cellH, usedCardPositions, entities, gridW);
                });
            }
        });
    };

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        let animationFrameId: number;

        const render = (time: number) => {
            if (canvas.width !== gridW * 40 || canvas.height !== gridH * 40) {
                animationFrameId = requestAnimationFrame(render);
                return;
            }
            drawCanvas(ctx, canvas.width, canvas.height, time);
            animationFrameId = requestAnimationFrame(render);
        };

        animationFrameId = requestAnimationFrame(render);
        return () => cancelAnimationFrame(animationFrameId);
    }, [entities, relationships, activeRelationshipId, isSolving]);

    const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (isSolving) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const x = Math.floor(((e.clientX - rect.left) * scaleX) / (canvas.width / gridW));
        const y = Math.floor(((e.clientY - rect.top) * scaleY) / (canvas.height / gridH));

        if (x >= 0 && x < gridW && y >= 0 && y < gridH) {
            if (onEdgeClick) {
                const clickedNode = y * gridW + x;
                let hitRelId = null;
                let hitSegmentIdx = null;

                for (let rel of relationships) {
                    if (!rel.paths) continue;
                    for (let i = 0; i < rel.paths.length; i++) {
                        if (rel.paths[i].includes(clickedNode)) {
                            hitRelId = rel.id;
                            hitSegmentIdx = i;
                            break;
                        }
                    }
                    if (hitRelId !== null) break;
                }

                if (hitRelId !== null && hitSegmentIdx !== null) {
                    onEdgeClick(hitRelId, hitSegmentIdx, x, y);
                    return;
                }
            }
            onGridClick(x, y);
        }
    };

    return (
        <canvas
            ref={canvasRef}
            width={gridW * 40}
            height={gridH * 40}
            onClick={handleCanvasClick}
            style={{
                display: 'block',
                width: '100%',
                height: '100%',
                cursor: 'crosshair',
                imageRendering: 'pixelated'
            }}
        />
    );
};
