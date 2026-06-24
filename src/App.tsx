import { useState, useRef, useEffect, Fragment } from 'react';
import {
  makeStyles,
  tokens,
  Button,
  Subtitle1,
  Body1,
  Divider,
  Select
} from '@fluentui/react-components';
import { Play20Filled, ArrowReset20Filled, Add20Filled, Delete20Regular, ZoomIn20Regular, ZoomOut20Regular, Dismiss16Regular, Save20Regular, FolderOpen20Regular } from '@fluentui/react-icons';
import type { EREntity, ERRelationship } from './types';
import { attemptSolve, W, H, updateGridDimensions } from './router';
import type { ObstacleBox } from './router';
import { CanvasGrid, SNAKE_COLORS } from './CanvasGrid';
import { ERBox } from './ERBox';

const useStyles = makeStyles({
  container: {
    display: 'flex',
    height: '100vh',
    width: '100vw',
    backgroundColor: tokens.colorNeutralBackground2,
    fontFamily: tokens.fontFamilyBase,
  },
  workspace: {
    flexGrow: 1,
    display: 'flex',
    flexDirection: 'column',
    padding: '24px',
    gap: '16px',
    position: 'relative', // To absolute position ER Boxes relative to workspace if needed.
    minWidth: 0,
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },
  canvasContainer: {
    flexGrow: 1,
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: '12px',
    boxShadow: tokens.shadow16,
    position: 'relative',
    overflow: 'hidden',
    border: `1px solid ${tokens.colorNeutralStroke1}`,
  },
  sidebar: {
    width: '320px',
    flexShrink: 0,
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow16,
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    borderLeft: `1px solid ${tokens.colorNeutralStroke1}`,
    overflowY: 'auto',
  },
  relationshipCard: {
    padding: '12px',
    borderRadius: '8px',
    border: `2px solid transparent`,
    backgroundColor: tokens.colorNeutralBackground2,
    cursor: 'pointer',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    transition: 'background-color 0.2s',
    ':hover': {
        backgroundColor: tokens.colorNeutralBackground2Hover,
    }
  },
  relationshipCardActive: {
    backgroundColor: tokens.colorNeutralBackground1Hover,
  },
  statusBox: {
    padding: '12px',
    backgroundColor: tokens.colorNeutralBackground4,
    borderRadius: '8px',
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: '12px',
    color: tokens.colorPaletteGreenForeground1,
  }
});

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export default function App() {
  const classes = useStyles();
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [entities, setEntities] = useState<EREntity[]>([]);
  const [relationships, setRelationships] = useState<ERRelationship[]>([
    { id: 1, entityIds: [], paths: null, crossings: 0, colorIdx: 0, cardinalities: [] }
  ]);
  const [activeRelId, setActiveRelId] = useState<number | null>(1);
  const [isSolving, setIsSolving] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [gridDim, setGridDim] = useState({ w: 80, h: 60 });
  const [edgePopup, setEdgePopup] = useState<{ relId: number, segmentIdx: number, x: number, y: number } | null>(null);
  const recalcTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [viewMode, setViewMode] = useState<'edit' | 'presentation'>('edit');
  const [phoneOrientation, setPhoneOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [phoneViewType, setPhoneViewType] = useState<'pair' | 'overview'>('pair');
  const [phoneZoom, setPhoneZoom] = useState(0.5);
  const [presentationGroupIdx, setPresentationGroupIdx] = useState(0);
  const [presentationItemIdx, setPresentationItemIdx] = useState(0);
  const [presEdgePopup, setPresEdgePopup] = useState<{ relId: number, segmentIdx: number } | null>(null);

  useEffect(() => {
    let max_x = 80;
    let max_y = 60;
    let shiftY = 0;
    let shiftX = 0;

    for (const e of entities) {
        const eh = 4 + (e.fields ? e.fields.length : 0);
        const ew = e.fields ? Math.max(6, 4 + Math.max(0, ...e.fields.map(f => f.name.length)) * 0.4) : 6;
        
        const topEdge = e.y - Math.ceil(eh / 2);
        const leftEdge = e.x - Math.ceil(ew / 2);
        
        if (topEdge < 2) {
            const neededY = 2 - topEdge;
            if (neededY > shiftY) shiftY = neededY;
        }
        if (leftEdge < 2) {
            const neededX = 2 - leftEdge;
            if (neededX > shiftX) shiftX = neededX;
        }
    }

    if (shiftX > 0 || shiftY > 0) {
        setEntities(ents => ents.map(e => ({ ...e, x: e.x + shiftX, y: e.y + shiftY })));
        return;
    }

    for (const e of entities) {
        const eh = 4 + (e.fields ? e.fields.length : 0);
        const ew = e.fields ? Math.max(6, 4 + Math.max(0, ...e.fields.map(f => f.name.length)) * 0.4) : 6;
        
        if (e.x + Math.ceil(ew / 2) + 10 > max_x) max_x = Math.ceil(e.x + ew / 2) + 10;
        if (e.y + Math.ceil(eh / 2) + 10 > max_y) max_y = Math.ceil(e.y + eh / 2) + 10;
    }

    if (max_x !== gridDim.w || max_y !== gridDim.h) {
        updateGridDimensions(max_x, max_y);
        setGridDim({ w: max_x, h: max_y });
    }
  }, [entities, gridDim.w, gridDim.h]);

  useEffect(() => {
      if (viewMode !== 'presentation') return;

      const handleKeyDown = (e: KeyboardEvent) => {
          if (relationships.length === 0) return;
          
          let gIdx = presentationGroupIdx;
          if (gIdx >= relationships.length) gIdx = 0;
          
          const currentRel = relationships[gIdx];
          const itemCount = currentRel.entityIds.length;
          const maxIIdx = Math.max(0, itemCount - 2);
          let iIdx = Math.min(presentationItemIdx, maxIIdx);

          if (e.key === 'ArrowDown') {
              e.preventDefault();
              let nextGIdx = (gIdx + 1) % relationships.length;
              setPresentationGroupIdx(nextGIdx);
              setPresentationItemIdx(0);
              setPresEdgePopup(null);
          } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              let prevGIdx = (gIdx - 1 + relationships.length) % relationships.length;
              setPresentationGroupIdx(prevGIdx);
              setPresentationItemIdx(0);
              setPresEdgePopup(null);
          } else if (e.key === 'ArrowRight') {
              if (itemCount > 1) {
                  e.preventDefault();
                  setPresentationItemIdx(Math.min(maxIIdx, iIdx + 1));
                  setPresEdgePopup(null);
              }
          } else if (e.key === 'ArrowLeft') {
              if (itemCount > 1) {
                  e.preventDefault();
                  setPresentationItemIdx(Math.max(0, iIdx - 1));
                  setPresEdgePopup(null);
              }
          }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewMode, presentationGroupIdx, presentationItemIdx, relationships]);

  const handleSave = () => {
      const scrollX = document.getElementById('scroll-container')?.scrollLeft || 0;
      const scrollY = document.getElementById('scroll-container')?.scrollTop || 0;
      const cleanedRelationships = relationships.map(r => {
          const { paths, path, ...rest } = r as any;
          return { ...rest, crossings: 0 };
      });
      const data = JSON.stringify({ entities, relationships: cleanedRelationships, zoom, scrollX, scrollY });
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'er_diagram.json';
      a.click();
  };

  const handleLoad = (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
          try {
              const data = JSON.parse(e.target?.result as string);
              const loadedEntities: EREntity[] = data.entities || [];
              const loadedRels: ERRelationship[] = (data.relationships || []).map((r: any) => {
                  const { paths, path, ...rest } = r;
                  return {
                      ...rest,
                      paths: null,
                      crossings: 0
                  };
              });
              const loadedZoom = data.zoom || 1;
              const loadedScrollX = data.scrollX || 0;
              const loadedScrollY = data.scrollY || 0;
              
              let maxW = 24;
              let maxH = 24;
              loadedEntities.forEach(ent => {
                  if (ent.x + 10 > maxW) maxW = ent.x + 10;
                  if (ent.y + 10 > maxH) maxH = ent.y + 10;
              });
              updateGridDimensions(maxW, maxH);
              setGridDim({ w: maxW, h: maxH });

              setEntities(loadedEntities);
              setRelationships(loadedRels);
              setActiveRelId(loadedRels?.[0]?.id || null);
              setZoom(loadedZoom);
              
              setTimeout(() => {
                  const scrollContainer = document.getElementById('scroll-container');
                  if (scrollContainer) {
                      scrollContainer.scrollLeft = loadedScrollX;
                      scrollContainer.scrollTop = loadedScrollY;
                  }
                  let attempts = 0;
                  const interval = setInterval(() => {
                      const btn = document.getElementById('beregn-ruter-btn') as HTMLButtonElement;
                      if (btn && !btn.disabled) {
                          btn.click();
                          clearInterval(interval);
                      }
                      if (attempts++ > 20) clearInterval(interval);
                  }, 100);
              }, 100);
          } catch (err) {
              alert('Feil ved lesing av fil');
          }
      };
      reader.readAsText(file);
      event.target.value = '';
  };

  const getAllBoxes = (ents: EREntity[]): ObstacleBox[] => {
      return ents.map(e => {
          const ew = 8;
          const eh = 6 + e.fields.length;
          let startX = Math.max(0, e.x - Math.floor(ew / 2));
          let endX = Math.min(gridDim.w - 1, e.x + Math.ceil(ew / 2));
          let startY = Math.max(0, e.y - Math.floor(eh / 2));
          let endY = Math.min(gridDim.h - 1, e.y + Math.ceil(eh / 2));

          let cells = [];
          for (let y = startY; y <= endY; y++) {
              for (let x = startX; x <= endX; x++) {
                  cells.push(y * gridDim.w + x);
              }
          }
          return { id: e.id, center: e.y * gridDim.w + e.x, cells };
      });
  };

  const getEntityOffsets = (rels: ERRelationship[]) => {
      let entityRelMap = new Map<number, number[]>();
      rels.forEach(r => {
          r.entityIds.forEach(eid => {
              if (!entityRelMap.has(eid)) entityRelMap.set(eid, []);
              if (!entityRelMap.get(eid)!.includes(r.id)) {
                  entityRelMap.get(eid)!.push(r.id);
              }
          });
      });

      let offsets = new Map<number, Map<number, number>>();
      entityRelMap.forEach((relIds, eid) => {
          relIds.sort((a, b) => a - b);
          let count = relIds.length;
          let entityMap = new Map<number, number>();
          relIds.forEach((rid, idx) => {
              let offset = 0;
              if (count === 2) offset = idx === 0 ? -1 : 1;
              else if (count === 3) offset = idx - 1;
              else if (count > 3) offset = idx - Math.floor(count / 2);
              entityMap.set(rid, offset);
          });
          offsets.set(eid, entityMap);
      });
      return offsets;
  };

  const recalculateInstantly = (currentEntities: EREntity[], dimensionsChanged = false) => {
      setRelationships(prevRels => {
          let updatedRels = [...prevRels];
          if (dimensionsChanged) {
              updatedRels = updatedRels.map(r => ({ ...r, paths: null, crossings: 0 }));
          }
          
          for (let i = 0; i < updatedRels.length; i++) {
              let rel = updatedRels[i];
              if (rel.entityIds.length < 2) continue;
              
              let nodes = rel.entityIds.map(eid => {
                  const e = currentEntities.find(ent => ent.id === eid);
                  return e ? e.y * gridDim.w + e.x : -1;
              }).filter(n => n !== -1);

              let allBoxes = getAllBoxes(currentEntities);
              let offsets = getEntityOffsets(updatedRels);
              
              let existingPaths: number[][] = [];
              for (let j = 0; j < updatedRels.length; j++) {
                  if (i !== j && updatedRels[j].paths) {
                      updatedRels[j].paths!.forEach(p => existingPaths.push(p));
                  }
              }

              let res = attemptSolve(nodes, rel.id, allBoxes, existingPaths, offsets);
              if (res) {
                  updatedRels[i] = { ...rel, paths: res.paths, crossings: res.crossings };
              } else {
                  updatedRels[i] = { ...rel, paths: null, crossings: 0 };
              }
          }
          return updatedRels;
      });
  };

  const toggleEntityInActiveRel = (targetEntityId: number) => {
      if (activeRelId === null) return;
      setRelationships(prevRels => {
          return prevRels.map(rel => {
              if (rel.id === activeRelId) {
                  const index = rel.entityIds.indexOf(targetEntityId);
                  if (index !== -1) {
                      const newEntityIds = [...rel.entityIds];
                      newEntityIds.splice(index, 1);
                      const newCards = [...(rel.cardinalities || [])];
                      if (newCards.length > 0) {
                          newCards.splice(Math.max(0, index - 1), 1);
                      }
                      return { ...rel, entityIds: newEntityIds, paths: null, cardinalities: newCards };
                  } else {
                      const lastId = rel.entityIds.length > 0 ? rel.entityIds[rel.entityIds.length - 1] : undefined;
                      if (lastId !== targetEntityId) {
                          const newCards = rel.entityIds.length > 0 ? [...(rel.cardinalities || []), 'none|none'] : (rel.cardinalities || []);
                          return { ...rel, entityIds: [...rel.entityIds, targetEntityId], paths: null, cardinalities: newCards };
                      }
                  }
              }
              return rel;
          });
      });
  };

  const handleGridClick = (x: number, y: number) => {
      setEdgePopup(null);
      if (activeRelId === null) return;
      
      const existingEntity = entities.find(e => e.x === x && e.y === y);
      if (existingEntity) {
          toggleEntityInActiveRel(existingEntity.id);
      } else {
          const newEntityId = entities.length > 0 ? Math.max(...entities.map(e => e.id)) + 1 : 1;
          const newEntity: EREntity = {
              id: newEntityId,
              name: `Entity_${newEntityId}`,
              fields: [],
              x,
              y,
              colorIdx: activeRelId % SNAKE_COLORS.length
          };
          setEntities([...entities, newEntity]);
          toggleEntityInActiveRel(newEntityId);
      }
  };

  const updateEntity = (updated: EREntity) => {
      let newW = W;
      let newH = H;
      let offsetX = 0;
      let offsetY = 0;

      if (updated.x < 0) offsetX = Math.abs(updated.x) + 5;
      if (updated.y < 0) offsetY = Math.abs(updated.y) + 5;
      
      if (updated.x + offsetX >= newW - 2) newW = updated.x + offsetX + 10;
      if (updated.y + offsetY >= newH - 2) newH = updated.y + offsetY + 10;
      
      if (offsetX > 0 || offsetY > 0 || newW !== W || newH !== H) {
          updateGridDimensions(newW, newH);
      }

      setEntities(prev => {
          let updatedList;
          if (offsetX > 0 || offsetY > 0) {
              updatedList = prev.map(e => {
                  if (e.id === updated.id) {
                      return { ...updated, x: updated.x + offsetX, y: updated.y + offsetY };
                  }
                  return { ...e, x: e.x + offsetX, y: e.y + offsetY };
              });
          } else {
              updatedList = prev.map(e => e.id === updated.id ? updated : e);
          }
          
          const old = prev.find(e => e.id === updated.id);
          if (old && (old.x !== updated.x || old.y !== updated.y)) {
              if (recalcTimeoutRef.current) clearTimeout(recalcTimeoutRef.current);
              recalcTimeoutRef.current = setTimeout(() => {
                  let dimensionsChanged = offsetX > 0 || offsetY > 0 || newW !== W || newH !== H;
                  recalculateInstantly(updatedList, dimensionsChanged);
              }, 50);
          }
          return updatedList;
      });
  };
  
  const updateEntityOrder = (relId: number, entityId: number, newOrder: number) => {
      setRelationships(prevRels => {
          return prevRels.map(rel => {
              if (rel.id !== relId) return rel;
              
              let orders = rel.customOrders ? { ...rel.customOrders } : Object.fromEntries(rel.entityIds.map((eid, idx) => [eid, idx + 1]));
              orders[entityId] = newOrder;
              
              const allOrders = Object.values(orders);
              const hasDuplicates = new Set(allOrders).size !== allOrders.length;
              
              if (hasDuplicates) {
                  return { ...rel, customOrders: orders, paths: null };
              } else {
                  const newEntityIds = [...rel.entityIds].sort((a, b) => orders[a] - orders[b]);
                  return { ...rel, entityIds: newEntityIds, customOrders: undefined, paths: null };
              }
          });
      });
  };

  const deleteEntity = (id: number) => {
      setEntities(entities.filter(e => e.id !== id));
      // Remove entity from all relationships
      setRelationships(rels => rels.map(rel => ({
          ...rel,
          entityIds: rel.entityIds.filter(eid => eid !== id),
          paths: null
      })));
  };

  const addNewRelationship = () => {
      const newId = relationships.length > 0 ? Math.max(...relationships.map(r => r.id)) + 1 : 1;
      const colorIdx = newId % SNAKE_COLORS.length;
      setRelationships([...relationships, { id: newId, entityIds: [], paths: null, crossings: 0, colorIdx, cardinalities: [] }]);
      setActiveRelId(newId);
  };

  const removeRelationship = (id: number) => {
      const filtered = relationships.filter(r => r.id !== id);
      setRelationships(filtered);
      if (activeRelId === id) {
          setActiveRelId(filtered.length > 0 ? filtered[0].id : null);
      }
  };

  const startSolve = async (overrideEntities?: EREntity[] | React.MouseEvent, overrideRels?: ERRelationship[]) => {
    setIsSolving(true);
    
    let currentEntities = Array.isArray(overrideEntities) ? overrideEntities : entities;
    let currentRels = overrideRels || relationships;
    let updatedRels = [...currentRels];
    let totalCrossings = 0;

    for (let i = 0; i < updatedRels.length; i++) {
        let rel = updatedRels[i];
        if (rel.entityIds.length < 2) continue; 
        
        await sleep(10); // Small sleep to let UI update but remain fast

        let nodes = rel.entityIds.map(eid => {
            const e = currentEntities.find(ent => ent.id === eid);
            return e ? e.y * W + e.x : -1;
        }).filter(n => n !== -1);

        let allBoxes = getAllBoxes(currentEntities);
        let offsets = getEntityOffsets(updatedRels);
        
        let existingPaths: number[][] = [];
        for (let j = 0; j < updatedRels.length; j++) {
            const otherRel = updatedRels[j];
            if (i !== j && otherRel.paths) {
                otherRel.paths.forEach(p => existingPaths.push(p));
            }
        }

        let res = attemptSolve(nodes, rel.id, allBoxes, existingPaths, offsets);

        if (res) {
            updatedRels[i] = { ...rel, paths: res.paths, crossings: res.crossings };
            totalCrossings += res.crossings;
        } else {
            updatedRels[i] = { ...rel, paths: null, crossings: 0 }; // Failed
        }
    }

    setRelationships(updatedRels);
    setIsSolving(false);
  };

    const sidebarContent = (
        <div style={{ flexGrow: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {relationships.map(rel => {
                const isAct = rel.id === activeRelId;
                const colors = SNAKE_COLORS[rel.colorIdx];
                return (
                    <div 
                        key={rel.id} 
                        className={`${classes.relationshipCard} ${isAct ? classes.relationshipCardActive : ''}`}
                        style={{ borderColor: isAct ? colors.main : 'transparent' }}
                        onClick={() => {
                            if (!isSolving) {
                                setActiveRelId(rel.id);
                            }
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ width: '16px', height: '16px', borderRadius: '4px', backgroundColor: colors.main, boxShadow: `0 0 8px ${colors.glow}` }} />
                                <div>
                                    <Body1 style={{ fontWeight: 'bold' }}>
                                        {rel.entityIds.length === 0 ? "Ny kobling" : 
                                         rel.entityIds.map(eid => entities.find(e => e.id === eid)?.name).join(' - ')}
                                    </Body1>
                                    <div style={{ fontSize: '12px', color: tokens.colorNeutralForeground3 }}>
                                        Kobler {rel.entityIds.length} bokser
                                    </div>
                                </div>
                            </div>
                            {viewMode !== 'presentation' && (
                                <Button 
                                    icon={<Delete20Regular />} 
                                    appearance="transparent"
                                    onClick={(e) => { e.stopPropagation(); removeRelationship(rel.id); }}
                                    disabled={isSolving}
                                />
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );

  const renderDiagram = (isReadOnly: boolean, currentZoom: number) => {
      return (
          <div style={{ width: gridDim.w * 40 * currentZoom, height: gridDim.h * 40 * currentZoom, position: 'relative' }}>
              <div 
                  ref={isReadOnly ? undefined : containerRef}
                  style={{
                      width: gridDim.w * 40,
                      height: gridDim.h * 40,
                      transform: `scale(${currentZoom})`,
                      transformOrigin: 'top left',
                      position: 'absolute',
                      top: 0, left: 0
                  }}
              >
                  <CanvasGrid 
                      entities={entities} 
                      relationships={relationships} 
                      activeRelationshipId={activeRelId} 
                      isSolving={isSolving} 
                      gridW={gridDim.w}
                      gridH={gridDim.h}
                      onGridClick={isReadOnly ? () => {} : handleGridClick} 
                      onEdgeClick={isReadOnly ? () => {} : (relId, segmentIdx, x, y) => {
                          setEdgePopup({ relId, segmentIdx, x, y });
                          setActiveRelId(relId);
                      }}
                  />
                  
                  {/* Render ER Boxes as overlay */}
                  {entities.map(entity => {
                      const connectedRels = relationships.filter(r => r.entityIds.includes(entity.id));
                      const connectedColors = connectedRels.map(r => SNAKE_COLORS[(r.colorIdx || 0) % SNAKE_COLORS.length].main);

                      const entityOrders = connectedRels.map(r => {
                          let order: number;
                          let isConflict = false;
                          if (r.customOrders && r.customOrders[entity.id] !== undefined) {
                              order = r.customOrders[entity.id];
                              isConflict = Object.values(r.customOrders).filter(o => o === order).length > 1;
                          } else {
                              order = r.entityIds.indexOf(entity.id) + 1;
                          }
                          return {
                              relId: r.id,
                              color: SNAKE_COLORS[(r.colorIdx || 0) % SNAKE_COLORS.length].main,
                              order,
                              isConflict
                          };
                      });

                      return (
                          <ERBox 
                              key={entity.id} 
                              entity={entity} 
                              connectedColors={connectedColors}
                              containerRef={isReadOnly ? { current: null } as any : containerRef} 
                              entityOrders={entityOrders}
                              isReadOnly={isReadOnly}
                              onUpdateOrder={isReadOnly ? () => {} : (relId, newOrder) => updateEntityOrder(relId, entity.id, newOrder)}
                              onUpdateEntity={isReadOnly ? () => {} : updateEntity} 
                              onDeleteEntity={isReadOnly ? () => {} : deleteEntity} 
                              onToggleEntity={isReadOnly ? () => {} : () => toggleEntityInActiveRel(entity.id)}
                          />
                      );
                  })}
              </div>
          </div>
      );
  };

  return (
    <div className={classes.container}>
        {/* Workspace (Left Panel) */}
        <div className={classes.workspace}>
            <div className={classes.header} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Subtitle1 style={{ color: tokens.colorPaletteTealForeground2, fontWeight: 'bold' }}>
                    ER Diagram Router
                </Subtitle1>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <input 
                        type="file" 
                        accept=".json" 
                        ref={fileInputRef} 
                        style={{ display: 'none' }} 
                        onChange={handleLoad} 
                    />
                    <Button icon={<FolderOpen20Regular />} onClick={() => fileInputRef.current?.click()}>
                        Last inn
                    </Button>
                    <Button icon={<Save20Regular />} onClick={handleSave}>
                        Lagre
                    </Button>
                    <Button 
                        appearance={viewMode === 'presentation' ? 'primary' : 'outline'}
                        onClick={() => {
                            if (viewMode === 'edit') {
                                setPresentationGroupIdx(0);
                                setPresentationItemIdx(0);
                                setPresEdgePopup(null);
                                setViewMode('presentation');
                            } else {
                                setViewMode('edit');
                            }
                        }}
                    >
                        {viewMode === 'edit' ? 'Start Phone Mode' : 'Tilbake til Redigering'}
                    </Button>
                </div>
            </div>



            <div className={classes.canvasContainer} style={{ overflow: 'auto', position: 'relative' }} id="scroll-container">
                {renderDiagram(false, zoom)}

                {/* Edge Popup */}
                {edgePopup && (() => {
                    const rel = relationships.find(r => r.id === edgePopup.relId);
                    if (!rel) return null;
                    const e1 = entities.find(e => e.id === rel.entityIds[edgePopup.segmentIdx])?.name || `Boks 1`;
                    const e2 = entities.find(e => e.id === rel.entityIds[edgePopup.segmentIdx + 1])?.name || `Boks 2`;
                    
                    const card = (rel.cardinalities || [])[edgePopup.segmentIdx] || 'none|none';
                    const [leftCard, rightCard] = card.includes('|') ? card.split('|') : [card, 'none'];

                    const updateCard = (left: string, right: string) => {
                        setRelationships(rels => rels.map(r => {
                            if (r.id === rel.id) {
                                const newCards = [...(r.cardinalities || [])];
                                newCards[edgePopup.segmentIdx] = `${left}|${right}`;
                                return { ...r, cardinalities: newCards };
                            }
                            return r;
                        }));
                    };

                    return (
                        <div style={{
                            position: 'absolute',
                            left: (edgePopup.x * 40 + 20) * zoom,
                            top: (edgePopup.y * 40) * zoom,
                            transform: 'translate(-50%, -100%)',
                            marginTop: -10,
                            backgroundColor: tokens.colorNeutralBackground1,
                            boxShadow: tokens.shadow16,
                            borderRadius: '8px',
                            padding: '12px',
                            zIndex: 2000,
                            border: `2px solid ${SNAKE_COLORS[(rel.colorIdx || 0) % SNAKE_COLORS.length].main}`
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <Body1 style={{ fontWeight: 'bold', fontSize: '13px' }}>Kardinalitet</Body1>
                                <Button icon={<Dismiss16Regular />} appearance="transparent" onClick={() => setEdgePopup(null)} size="small" style={{ minWidth: 24, padding: 0 }} />
                            </div>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <label style={{ fontSize: '11px', marginBottom: '4px' }}>Mot {e1}</label>
                                    <Select size="small" value={leftCard} onChange={(_e, d) => updateCard(d.value || 'none', rightCard)}>
                                        <option value="none">Ingen</option>
                                        <option value="1..1">1..1 (En)</option>
                                        <option value="0..1">0..1 (Null/En)</option>
                                        <option value="1..N">1..N (Mange)</option>
                                        <option value="0..N">0..N (Null/Mange)</option>
                                    </Select>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <label style={{ fontSize: '11px', marginBottom: '4px' }}>Mot {e2}</label>
                                    <Select size="small" value={rightCard} onChange={(_e, d) => updateCard(leftCard, d.value || 'none')}>
                                        <option value="none">Ingen</option>
                                        <option value="1..1">1..1 (En)</option>
                                        <option value="0..1">0..1 (Null/En)</option>
                                        <option value="1..N">1..N (Mange)</option>
                                        <option value="0..N">0..N (Null/Mange)</option>
                                    </Select>
                                </div>
                            </div>
                        </div>
                    );
                })()}

                {/* Zoom Controls */}
                <div style={{ position: 'sticky', left: '100%', top: '100%', transform: 'translate(-20px, -20px)', width: 'fit-content', display: 'flex', gap: 8, background: 'rgba(255,255,255,0.8)', padding: 8, borderRadius: 8, zIndex: 1000, boxShadow: '0 0 10px rgba(0,0,0,0.1)' }}>
                    <Button icon={<ZoomOut20Regular />} onClick={() => setZoom(z => Math.max(0.1, z - 0.1))} />
                    <span style={{ alignSelf: 'center', fontWeight: 'bold' }}>{Math.round(zoom * 100)}%</span>
                    <Button icon={<ZoomIn20Regular />} onClick={() => setZoom(z => Math.min(1.5, z + 0.1))} />
                </div>

                {/* Presentation Overlay */}
                {viewMode === 'presentation' && (
                    <div style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: 'rgba(0,0,0,0.8)',
                        backdropFilter: 'blur(4px)',
                        display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center',
                        zIndex: 3000,
                        color: 'white',
                        overflow: 'hidden'
                    }}>
                        {/* Rotation & Close Controls */}
                        <div style={{ position: 'absolute', top: 20, right: 20, zIndex: 4001, display: 'flex', gap: '16px' }}>
                            <Button appearance="primary" onClick={() => setPhoneOrientation(o => o === 'portrait' ? 'landscape' : 'portrait')}>
                                {phoneOrientation === 'portrait' ? 'Roter til Liggende' : 'Roter til Stående'}
                            </Button>
                            <Button onClick={() => setViewMode('edit')}>
                                Lukk Phone Mode
                            </Button>
                        </div>
                        
                        {/* Device Frame */}
                        <div style={{
                            width: phoneOrientation === 'portrait' ? '412px' : '915px',
                            height: phoneOrientation === 'portrait' ? '915px' : '412px',
                            border: '14px solid #111',
                            borderRadius: '40px',
                            backgroundColor: tokens.colorNeutralBackground1,
                            position: 'relative',
                            boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
                            display: 'flex',
                            flexDirection: phoneOrientation === 'portrait' ? 'column' : 'row',
                            transform: `scale(${Math.min(1, (window.innerHeight - 80) / (phoneOrientation === 'portrait' ? 915 : 412))})`,
                            transformOrigin: 'center center',
                            color: tokens.colorNeutralForeground1,
                            overflow: 'hidden'
                        }}>
                            {/* Camera Pill */}
                            <div style={{
                                position: 'absolute',
                                top: phoneOrientation === 'portrait' ? '12px' : '50%',
                                left: phoneOrientation === 'portrait' ? '50%' : '12px',
                                transform: phoneOrientation === 'portrait' ? 'translateX(-50%)' : 'translateY(-50%)',
                                width: phoneOrientation === 'portrait' ? '120px' : '24px',
                                height: phoneOrientation === 'portrait' ? '24px' : '120px',
                                backgroundColor: '#000',
                                borderRadius: '12px',
                                zIndex: 1000
                            }} />

                        {relationships.length > 0 ? (() => {
                            try {
                                const gIdx = Math.min(presentationGroupIdx, relationships.length - 1);
                                const rel = relationships[gIdx];
                                const color = SNAKE_COLORS[(rel.colorIdx || 0) % SNAKE_COLORS.length] || SNAKE_COLORS[0];
                                
                                if (!rel || !rel.entityIds) {
                                    return <div style={{ margin: 'auto' }}>Ugyldig kobling.</div>;
                                }

                                const itemCount = rel.entityIds.length;
                                const maxIIdx = Math.max(0, itemCount - 2);
                                const iIdx = Math.min(presentationItemIdx, maxIIdx);
                                
                                // Determine which items to show (max 2)
                                let displayIndices: number[] = [];
                                if (itemCount > 0) {
                                    displayIndices = [iIdx];
                                    if (itemCount > 1) {
                                        displayIndices.push(iIdx + 1); // Show current and next
                                    }
                                }

                                    const isCardsVertical = phoneOrientation === 'portrait';
                                    const isOuterVertical = !isCardsVertical; // Navigation is perpendicular to cards

                                    if (phoneViewType === 'overview') {
                                        return (
                                            <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column' }}>
                                                <div style={{ flex: 1, overflow: 'auto' }}>
                                                    {renderDiagram(true, phoneZoom)}
                                                </div>
                                                
                                                <div style={{ 
                                                    position: 'absolute', 
                                                    bottom: 10, 
                                                    right: 10, 
                                                    display: 'flex', 
                                                    justifyContent: 'flex-end', 
                                                    alignItems: 'center',
                                                    zIndex: 1000,
                                                    pointerEvents: 'none'
                                                }}>
                                                    <div style={{ pointerEvents: 'auto', display: 'flex', gap: 4, background: 'rgba(255,255,255,0.8)', padding: 4, borderRadius: 8, boxShadow: '0 0 10px rgba(0,0,0,0.1)' }}>
                                                        <Button icon={<ZoomOut20Regular />} onClick={() => setPhoneZoom(z => Math.max(0.1, z - 0.1))} size="small" />
                                                        <span style={{ alignSelf: 'center', fontWeight: 'bold', fontSize: '12px' }}>{Math.round(phoneZoom * 100)}%</span>
                                                        <Button icon={<ZoomIn20Regular />} onClick={() => setPhoneZoom(z => Math.min(1.5, z + 0.1))} size="small" />
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    }

                                    return (
                                        <div 
                                            style={{ 
                                            flex: 1,
                                            display: 'flex', 
                                            flexDirection: isOuterVertical ? 'column' : 'row',
                                            alignItems: 'center', 
                                            justifyContent: 'center', 
                                            gap: '20px',
                                            padding: '20px',
                                            overflow: 'auto',
                                            position: 'relative',
                                            width: '100%',
                                            touchAction: 'none'
                                        }}>
                                            
                                            {/* Top/Left Button for Items */}
                                            <div 
                                                style={{ 
                                                    color: tokens.colorNeutralForeground1, 
                                                    fontSize: '40px', 
                                                    cursor: 'pointer',
                                                    userSelect: 'none',
                                                    padding: '10px',
                                                    visibility: iIdx > 0 ? 'visible' : 'hidden',
                                                    transform: isCardsVertical ? 'rotate(90deg)' : 'none',
                                                    transition: 'transform 0.1s'
                                                }}
                                                onClick={() => {
                                                    if (iIdx > 0) {
                                                        setPresentationItemIdx(Math.max(0, iIdx - 1));
                                                        setPresEdgePopup(null);
                                                    }
                                                }}
                                                onMouseEnter={(e) => { e.currentTarget.style.transform = isCardsVertical ? 'rotate(90deg) scale(1.2)' : 'scale(1.2)' }}
                                                onMouseLeave={(e) => { e.currentTarget.style.transform = isCardsVertical ? 'rotate(90deg)' : 'none' }}
                                            >
                                                ◀
                                            </div>

                                            {/* Cards Container */}
                                            <div style={{ 
                                                display: 'flex', 
                                                flexDirection: isCardsVertical ? 'column' : 'row',
                                                alignItems: 'center', 
                                                justifyContent: 'center',
                                                gap: '0'
                                            }}>
                                            {displayIndices.map((idx, mapIdx) => {
                                                const entId = rel.entityIds[idx];
                                                const entity = entities.find(e => e.id === entId);
                                                if (!entity) return null;

                                                const connectedRels = relationships.filter(r => r.entityIds.includes(entity.id));
                                                const connectedColors = connectedRels.map(r => SNAKE_COLORS[(r.colorIdx || 0) % SNAKE_COLORS.length].main);
                                                
                                                const entityOrders = connectedRels.map(r => {
                                                    let order: number;
                                                    let isConflict = false;
                                                    if (r.customOrders && r.customOrders[entity.id] !== undefined) {
                                                        order = r.customOrders[entity.id];
                                                        isConflict = Object.values(r.customOrders).filter(o => o === order).length > 1;
                                                    } else {
                                                        order = r.entityIds.indexOf(entity.id) + 1;
                                                    }
                                                    return {
                                                        relId: r.id,
                                                        color: SNAKE_COLORS[(r.colorIdx || 0) % SNAKE_COLORS.length].main,
                                                        order,
                                                        isConflict
                                                    };
                                                });

                                                const box = (
                                                    <div 
                                                        key={`${entId}-${mapIdx}-box`} 
                                                        style={{ position: 'relative', zIndex: 10, transform: isCardsVertical ? 'scale(0.85)' : 'scale(0.9)', transformOrigin: 'center center' }}
                                                        draggable={true}
                                                        onDragStart={(e) => {
                                                            e.dataTransfer.setData('text/plain', idx.toString());
                                                        }}
                                                        onDragOver={(e) => e.preventDefault()}
                                                        onDrop={(e) => {
                                                            e.preventDefault();
                                                            const dragIdxStr = e.dataTransfer.getData('text/plain');
                                                            if (!dragIdxStr) return;
                                                            const dragIdx = parseInt(dragIdxStr, 10);
                                                            if (dragIdx === idx) return;

                                                            setRelationships(rels => rels.map(r => {
                                                                if (r.id === rel.id) {
                                                                    const newIds = [...r.entityIds];
                                                                    const temp = newIds[dragIdx];
                                                                    newIds[dragIdx] = newIds[idx];
                                                                    newIds[idx] = temp;
                                                                    return { ...r, entityIds: newIds };
                                                                }
                                                                return r;
                                                            }));
                                                        }}
                                                    >
                                                        <ERBox 
                                                            entity={entity} 
                                                            connectedColors={connectedColors}
                                                            containerRef={containerRef} 
                                                            entityOrders={entityOrders}
                                                            onUpdateOrder={(relId, newOrder) => updateEntityOrder(relId, entity.id, newOrder)}
                                                            onUpdateEntity={updateEntity} 
                                                            onDeleteEntity={deleteEntity} 
                                                            onToggleEntity={() => {
                                                                if (activeRelId === rel.id && rel.entityIds.includes(entity.id)) return;
                                                                toggleEntityInActiveRel(entity.id);
                                                            }}
                                                            isPresentationMode={true}
                                                        />
                                                    </div>
                                                );

                                                if (mapIdx === 0 && displayIndices.length > 1) {
                                                    const edgeCard = (rel.cardinalities || [])[iIdx] || 'none|none';
                                                    const [lC, rC] = (typeof edgeCard === 'string' && edgeCard.includes('|')) ? edgeCard.split('|') : [edgeCard, 'none'];
                                                    
                                                    return (
                                                        <Fragment key={`${entId}-${mapIdx}-fragment`}>
                                                            {box}
                                                            <div 
                                                                style={{
                                                                    width: isCardsVertical ? '6px' : '60px',
                                                                    height: isCardsVertical ? '60px' : '6px',
                                                                    backgroundColor: color.main,
                                                                    cursor: 'pointer',
                                                                    boxShadow: `0 0 10px ${color.glow}`,
                                                                    position: 'relative',
                                                                    zIndex: 0,
                                                                    margin: isCardsVertical ? '-20px 0' : '0 -10px',
                                                                    display: 'flex',
                                                                    justifyContent: 'space-between',
                                                                    alignItems: 'center',
                                                                    flexDirection: isCardsVertical ? 'column' : 'row'
                                                                }}
                                                                onClick={() => setPresEdgePopup({ relId: rel.id, segmentIdx: iIdx })}
                                                            >
                                                                {/* Display current cardinalities on the line */}
                                                                <span style={{ position: 'absolute', [isCardsVertical ? 'right' : 'top']: -20, [isCardsVertical ? 'top' : 'left']: 0, fontSize: '12px', fontWeight: 'bold' }}>{lC !== 'none' ? lC : ''}</span>
                                                                <span style={{ position: 'absolute', [isCardsVertical ? 'right' : 'top']: -20, [isCardsVertical ? 'bottom' : 'right']: 0, fontSize: '12px', fontWeight: 'bold' }}>{rC !== 'none' ? rC : ''}</span>
                                                            </div>
                                                        </Fragment>
                                                    );
                                                }

                                                return box;
                                            })}
                                            {(itemCount === 0 || (displayIndices.length > 0 && displayIndices[displayIndices.length - 1] === itemCount - 1)) && (
                                                <div 
                                                    style={{ 
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center', 
                                                        cursor: 'pointer', fontSize: '40px',
                                                        margin: isCardsVertical ? '20px 0 0 0' : '0 0 0 20px',
                                                        userSelect: 'none',
                                                        transition: 'transform 0.1s'
                                                    }}
                                                    onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.2)'}
                                                    onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                                                    onClick={() => {
                                                        const newId = Date.now();
                                                        setEntities(ents => {
                                                            let newX = 0;
                                                            let newY = 0;
                                                            const lastEntityId = rel.entityIds.length > 0 ? rel.entityIds[rel.entityIds.length - 1] : undefined;
                                                            const lastEntity = ents.find(e => e.id === lastEntityId);
                                                            
                                                            if (lastEntity) {
                                                                newX = (lastEntity.x !== undefined ? lastEntity.x : 0) + 8;
                                                                newY = (lastEntity.y !== undefined ? lastEntity.y : 0);
                                                                // Find first empty spot to the right
                                                                while (ents.some(e => Math.abs(e.x - newX) < 4 && e.y === newY)) {
                                                                    newX += 8;
                                                                }
                                                            }
                                                            
                                                            const newEntity = {
                                                                id: newId,
                                                                name: `Boks ${ents.length + 1}`,
                                                                fields: [],
                                                                x: newX,
                                                                y: newY,
                                                                colorIdx: rel.colorIdx || 0
                                                            };
                                                            return [...ents, newEntity];
                                                        });
                                                        setRelationships(rels => rels.map(r => {
                                                            if (r.id === rel.id) {
                                                                const newCards = r.entityIds.length > 0 ? [...(r.cardinalities || []), 'none|none'] : (r.cardinalities || []);
                                                                return { ...r, entityIds: [...r.entityIds, newId], cardinalities: newCards };
                                                            }
                                                            return r;
                                                        }));
                                                        // Move view to the newly added entity
                                                        setPresentationItemIdx(Math.max(0, rel.entityIds.length - 1));
                                                    }}
                                                >+</div>
                                            )}
                                        </div>

                                        {/* Right Button */}
                                        <div 
                                            style={{ 
                                                color: tokens.colorNeutralForeground1, 
                                                fontSize: '40px', 
                                                cursor: 'pointer',
                                                userSelect: 'none',
                                                padding: '10px',
                                                visibility: iIdx < maxIIdx ? 'visible' : 'hidden',
                                                transform: isCardsVertical ? 'rotate(90deg)' : 'none',
                                                transition: 'transform 0.1s'
                                            }}
                                            onClick={() => {
                                                if (iIdx < maxIIdx) {
                                                    setPresentationItemIdx(Math.min(maxIIdx, iIdx + 1));
                                                    setPresEdgePopup(null);
                                                }
                                            }}
                                            onMouseEnter={(e) => { e.currentTarget.style.transform = isCardsVertical ? 'rotate(90deg) scale(1.2)' : 'scale(1.2)' }}
                                            onMouseLeave={(e) => { e.currentTarget.style.transform = isCardsVertical ? 'rotate(90deg)' : 'none' }}
                                        >
                                            ▶
                                        </div>


                                    </div>
                                );
                            } catch (e: any) {
                                return <div style={{ margin: 'auto', color: 'red' }}>Feil ved innlasting av presentasjon: {e?.message || 'Ukjent feil'}</div>;
                            }
                        })() : <div style={{ margin: 'auto' }}>Ingen koblinger å vise.</div>}

                        {/* Presentation Mode Sidebar List */}
                        <div style={{
                            width: phoneOrientation === 'portrait' ? '100%' : '300px',
                            height: phoneOrientation === 'portrait' ? '300px' : '100%',
                            borderTop: phoneOrientation === 'portrait' ? `1px solid ${tokens.colorNeutralStroke1}` : 'none',
                            borderLeft: phoneOrientation === 'portrait' ? 'none' : `1px solid ${tokens.colorNeutralStroke1}`,
                            backgroundColor: tokens.colorNeutralBackground2,
                            display: 'flex', flexDirection: 'column',
                            padding: '12px',
                            boxSizing: 'border-box'
                        }}>
                            <Subtitle1 style={{ marginBottom: '8px' }}>Dine Koblinger</Subtitle1>
                            {sidebarContent}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px' }}>
                                <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
                                    <Button 
                                        appearance="secondary"
                                        onClick={() => {
                                            const gIdx = Math.min(presentationGroupIdx, relationships.length - 1);
                                            if (gIdx > 0) {
                                                const newIdx = gIdx - 1;
                                                setPresentationGroupIdx(newIdx);
                                                setPresentationItemIdx(0);
                                                setPresEdgePopup(null);
                                            }
                                        }}
                                        disabled={presentationGroupIdx <= 0}
                                    >
                                        ▲ Forrige
                                    </Button>
                                    <Button 
                                        appearance="secondary"
                                        onClick={() => {
                                            const gIdx = Math.min(presentationGroupIdx, relationships.length - 1);
                                            if (gIdx < relationships.length - 1) {
                                                const newIdx = gIdx + 1;
                                                setPresentationGroupIdx(newIdx);
                                                setPresentationItemIdx(0);
                                                setPresEdgePopup(null);
                                            }
                                        }}
                                        disabled={presentationGroupIdx >= relationships.length - 1}
                                    >
                                        ▼ Neste
                                    </Button>
                                </div>
                                <Button 
                                    appearance="primary" 
                                    icon={<Add20Filled />}
                                    onClick={addNewRelationship}
                                    disabled={isSolving}
                                >
                                    Ny kobling
                                </Button>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                                    <Button 
                                        appearance="secondary"
                                        onClick={() => setPhoneViewType(t => t === 'pair' ? 'overview' : 'pair')}
                                        style={{ width: '100%' }}
                                    >
                                        {phoneViewType === 'pair' ? 'Vis Helhet' : 'Vis Par'}
                                    </Button>
                                    {phoneViewType === 'overview' && (
                                        <Button 
                                            appearance="primary" 
                                            onClick={() => startSolve()}
                                            disabled={isSolving}
                                            style={{ width: '100%' }}
                                        >
                                            {isSolving ? 'Beregner...' : 'Beregn alle ruter'}
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </div>

                        </div>

                        {/* Presentation Edge Popup */}
                        {presEdgePopup && (() => {
                            try {
                                const rel = relationships.find(r => r.id === presEdgePopup.relId);
                                if (!rel) return null;
                                const e1 = entities.find(e => e.id === rel.entityIds[presEdgePopup.segmentIdx])?.name || `Boks 1`;
                                const e2 = entities.find(e => e.id === rel.entityIds[presEdgePopup.segmentIdx + 1])?.name || `Boks 2`;
                                
                                const card = (rel.cardinalities || [])[presEdgePopup.segmentIdx] || 'none|none';
                                const [leftCard, rightCard] = (typeof card === 'string' && card.includes('|')) ? card.split('|') : [card, 'none'];

                            const updateCard = (left: string, right: string) => {
                                setRelationships(rels => rels.map(r => {
                                    if (r.id === rel.id) {
                                        const newCards = [...(r.cardinalities || [])];
                                        newCards[presEdgePopup.segmentIdx] = `${left}|${right}`;
                                        return { ...r, cardinalities: newCards };
                                    }
                                    return r;
                                }));
                            };

                            return (
                                <div style={{
                                    position: 'absolute',
                                    left: '50%',
                                    top: '50%',
                                    transform: 'translate(-50%, -100%)',
                                    marginTop: '-20px',
                                    backgroundColor: tokens.colorNeutralBackground1,
                                    boxShadow: tokens.shadow16,
                                    borderRadius: '8px',
                                    padding: '12px',
                                    zIndex: 4000,
                                    border: `2px solid ${SNAKE_COLORS[(rel.colorIdx || 0) % SNAKE_COLORS.length].main}`,
                                    color: 'black'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                        <Body1 style={{ fontWeight: 'bold', fontSize: '13px', color: tokens.colorNeutralForeground1 }}>Kardinalitet</Body1>
                                        <Button icon={<Dismiss16Regular />} appearance="transparent" onClick={() => setPresEdgePopup(null)} size="small" style={{ minWidth: 24, padding: 0 }} />
                                    </div>
                                    <div style={{ display: 'flex', gap: '12px' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                            <label style={{ fontSize: '11px', marginBottom: '4px', color: tokens.colorNeutralForeground1 }}>Mot {e1}</label>
                                            <Select size="small" value={leftCard} onChange={(_e, d) => updateCard(d.value || 'none', rightCard)}>
                                                <option value="none">Ingen</option>
                                                <option value="1..1">1..1 (En)</option>
                                                <option value="0..1">0..1 (Null/En)</option>
                                                <option value="1..N">1..N (Mange)</option>
                                                <option value="0..N">0..N (Null/Mange)</option>
                                            </Select>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                            <label style={{ fontSize: '11px', marginBottom: '4px', color: tokens.colorNeutralForeground1 }}>Mot {e2}</label>
                                            <Select size="small" value={rightCard} onChange={(_e, d) => updateCard(leftCard, d.value || 'none')}>
                                                <option value="none">Ingen</option>
                                                <option value="1..1">1..1 (En)</option>
                                                <option value="0..1">0..1 (Null/En)</option>
                                                <option value="1..N">1..N (Mange)</option>
                                                <option value="0..N">0..N (Null/Mange)</option>
                                            </Select>
                                        </div>
                                    </div>
                                </div>
                            );
                            } catch (e: any) {
                                return <div style={{ margin: 'auto', color: 'red' }}>Feil i popup: {e?.message}</div>;
                            }
                        })()}
                    </div>
                )}
            </div>
        </div>

        {/* Sidebar (Right Panel) */}
        <div className={classes.sidebar}>
            <Subtitle1>Dine Koblinger</Subtitle1>
            
            {sidebarContent}

            <Divider />

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px' }}>
                <Button 
                    icon={<Add20Filled />} 
                    onClick={addNewRelationship} 
                    disabled={isSolving}
                    size="large"
                >
                    Ny Kobling
                </Button>
                
                {(() => {
                    const hasConflicts = relationships.some(r => r.customOrders !== undefined && Object.values(r.customOrders).some((val, i, arr) => arr.indexOf(val) !== i));
                    return (
                        <Button 
                            id="beregn-ruter-btn"
                            appearance="primary" 
                            icon={<Play20Filled />} 
                            onClick={startSolve} 
                            disabled={isSolving || relationships.every(r => r.entityIds.length < 2) || hasConflicts}
                            size="large"
                        >
                            Beregn Alle Ruter
                        </Button>
                    );
                })()}
                
                <Button 
                    icon={<ArrowReset20Filled />}  
                    onClick={() => { setEntities([]); setRelationships([]); setActiveRelId(null); }} 
                    disabled={isSolving}
                    size="large"
                >
                    Nullstill Alt
                </Button>
            </div>
        </div>
    </div>
  );
}
