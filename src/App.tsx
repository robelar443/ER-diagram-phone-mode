import { useState, useRef } from 'react';
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
  const [edgePopup, setEdgePopup] = useState<{ relId: number, segmentIdx: number, x: number, y: number } | null>(null);
  const recalcTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
                  // Prøv å klikke på knappen helt til den er aktivert (React har rendret ferdig)
                  let attempts = 0;
                  const interval = setInterval(() => {
                      const btn = document.getElementById('beregn-ruter-btn') as HTMLButtonElement;
                      if (btn && !btn.disabled) {
                          btn.click();
                          clearInterval(interval);
                      }
                      if (attempts++ > 20) clearInterval(interval); // Gi opp etter 2 sekunder
                  }, 100);
              }, 100);
          } catch (err) {
              alert('Feil ved lesing av fil');
          }
      };
      reader.readAsText(file);
      event.target.value = ''; // Reset input to allow reloading same file
  };

  const getAllBoxes = (ents: EREntity[]): ObstacleBox[] => {
      return ents.map(e => {
          const ew = 6;
          const eh = 4 + e.fields.length;
          let startX = Math.max(0, e.x - Math.floor(ew / 2));
          let endX = Math.min(W - 1, e.x + Math.ceil(ew / 2));
          let startY = Math.max(0, e.y - Math.floor(eh / 2));
          let endY = Math.min(H - 1, e.y + Math.ceil(eh / 2));

          let cells = [];
          for (let y = startY; y <= endY; y++) {
              for (let x = startX; x <= endX; x++) {
                  cells.push(y * W + x);
              }
          }
          return { id: e.id, center: e.y * W + e.x, cells };
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
                  return e ? e.y * W + e.x : -1;
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
                      const newCards = [...rel.cardinalities];
                      if (newCards.length > 0) {
                          newCards.splice(Math.max(0, index - 1), 1);
                      }
                      return { ...rel, entityIds: newEntityIds, paths: null, cardinalities: newCards };
                  } else {
                      const lastId = rel.entityIds.length > 0 ? rel.entityIds[rel.entityIds.length - 1] : undefined;
                      if (lastId !== targetEntityId) {
                          const newCards = rel.entityIds.length > 0 ? [...rel.cardinalities, 'none|none'] : rel.cardinalities;
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
                </div>
            </div>



            <div className={classes.canvasContainer} style={{ overflow: 'auto', position: 'relative' }} id="scroll-container">
                <div style={{ width: W * 40 * zoom, height: H * 40 * zoom, position: 'relative' }}>
                    <div 
                        ref={containerRef}
                        style={{
                            width: W * 40,
                            height: H * 40,
                            transform: `scale(${zoom})`,
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
                            onGridClick={handleGridClick} 
                            onEdgeClick={(relId, segmentIdx, x, y) => {
                                setEdgePopup({ relId, segmentIdx, x, y });
                                setActiveRelId(relId);
                            }}
                        />
                        
                        {/* Render ER Boxes as overlay */}
                        {entities.map(entity => {
                            const connectedRels = relationships.filter(r => r.entityIds.includes(entity.id));
                            const connectedColors = connectedRels.map(r => SNAKE_COLORS[r.colorIdx].main);

                            const entityOrders = connectedRels.map(rel => {
                                let order: number;
                                let isConflict = false;
                                if (rel.customOrders && rel.customOrders[entity.id] !== undefined) {
                                    order = rel.customOrders[entity.id];
                                    isConflict = Object.values(rel.customOrders).filter(o => o === order).length > 1;
                                } else {
                                    order = rel.entityIds.indexOf(entity.id) + 1;
                                }
                                return {
                                    relId: rel.id,
                                    color: SNAKE_COLORS[rel.colorIdx].main,
                                    order,
                                    isConflict
                                };
                            });

                            return (
                                <ERBox 
                                    key={entity.id} 
                                    entity={entity} 
                                    connectedColors={connectedColors}
                                    containerRef={containerRef} 
                                    entityOrders={entityOrders}
                                    onUpdateOrder={(relId, newOrder) => updateEntityOrder(relId, entity.id, newOrder)}
                                    onUpdateEntity={updateEntity} 
                                    onDeleteEntity={deleteEntity} 
                                    onToggleEntity={() => toggleEntityInActiveRel(entity.id)}
                                />
                            );
                        })}
                    </div>

                    {/* Edge Popup */}
                    {edgePopup && (() => {
                        const rel = relationships.find(r => r.id === edgePopup.relId);
                        if (!rel) return null;
                        const e1 = entities.find(e => e.id === rel.entityIds[edgePopup.segmentIdx])?.name || `Boks 1`;
                        const e2 = entities.find(e => e.id === rel.entityIds[edgePopup.segmentIdx + 1])?.name || `Boks 2`;
                        
                        const card = rel.cardinalities[edgePopup.segmentIdx] || 'none|none';
                        const [leftCard, rightCard] = card.includes('|') ? card.split('|') : [card, 'none'];

                        const updateCard = (left: string, right: string) => {
                            setRelationships(rels => rels.map(r => {
                                if (r.id === rel.id) {
                                    const newCards = [...r.cardinalities];
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
                                border: `2px solid ${SNAKE_COLORS[rel.colorIdx].main}`
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
                </div>

                {/* Zoom Controls */}
                <div style={{ position: 'sticky', left: '100%', top: '100%', transform: 'translate(-20px, -20px)', width: 'fit-content', display: 'flex', gap: 8, background: 'rgba(255,255,255,0.8)', padding: 8, borderRadius: 8, zIndex: 1000, boxShadow: '0 0 10px rgba(0,0,0,0.1)' }}>
                    <Button icon={<ZoomOut20Regular />} onClick={() => setZoom(z => Math.max(0.1, z - 0.1))} />
                    <span style={{ alignSelf: 'center', fontWeight: 'bold' }}>{Math.round(zoom * 100)}%</span>
                    <Button icon={<ZoomIn20Regular />} onClick={() => setZoom(z => Math.min(1.5, z + 0.1))} />
                </div>
            </div>
        </div>

        {/* Sidebar (Right Panel) */}
        <div className={classes.sidebar}>
            <Subtitle1>Dine Koblinger</Subtitle1>
            
            <div style={{ flexGrow: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {relationships.map(rel => {
                    const isAct = rel.id === activeRelId;
                    const colors = SNAKE_COLORS[rel.colorIdx];
                    return (
                        <div 
                            key={rel.id} 
                            className={`${classes.relationshipCard} ${isAct ? classes.relationshipCardActive : ''}`}
                            style={{ 
                                borderColor: isAct ? colors.main : 'transparent',
                            }}
                            onClick={() => !isSolving && setActiveRelId(rel.id)}
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
                                <Button 
                                    icon={<Delete20Regular />} 
                                    appearance="transparent"
                                    onClick={(e) => { e.stopPropagation(); removeRelationship(rel.id); }}
                                    disabled={isSolving}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>

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
