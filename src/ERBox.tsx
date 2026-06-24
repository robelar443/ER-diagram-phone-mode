import React, { useState, useEffect, useRef } from 'react';
import {
  Card,

  Button,
  Input,
  makeStyles,
  tokens,
  typographyStyles,
  Divider,
} from '@fluentui/react-components';
import { Add16Regular, Dismiss16Regular, Edit16Regular } from '@fluentui/react-icons';
import type { EREntity, ERField } from './types';

const useStyles = makeStyles({
  card: {
    position: 'absolute',
    width: '240px',
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow8,
    border: `2px solid ${tokens.colorBrandBackground}`,
    zIndex: 10,
    // Add transition for smoother movement if we implemented dragging
    transition: 'top 0.2s, left 0.2s',
  },
  header: {
    padding: '8px',
    backgroundColor: tokens.colorBrandBackground,
    color: tokens.colorNeutralForegroundOnBrand,
    cursor: 'move',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    ...typographyStyles.subtitle2,
    fontWeight: 'bold',
    margin: 0,
    color: tokens.colorNeutralForegroundOnBrand,
  },
  content: {
    padding: '8px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  fieldRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  fieldInput: {
    flexGrow: 1,
  },
  deleteButton: {
    minWidth: '24px',
    padding: '0 4px',
  },
  footer: {
    padding: '8px',
    display: 'flex',
    justifyContent: 'center',
  }
});

interface ERBoxProps {
    entity: EREntity;
    connectedColors: string[];
    containerRef: React.RefObject<HTMLDivElement | null>;
    entityOrders: { relId: number, color: string, order: number, isConflict: boolean }[];
    onUpdateOrder: (relId: number, order: number) => void;
    onUpdateEntity: (entity: EREntity) => void;
    onDeleteEntity: (id: number) => void;
    onToggleEntity: () => void;
    isPresentationMode?: boolean;
    isReadOnly?: boolean;
    onClick?: () => void;
    isTeleportSelected?: boolean;
}

export const ERBox: React.FC<ERBoxProps> = ({ entity, connectedColors, containerRef, entityOrders, onUpdateOrder, onUpdateEntity, onDeleteEntity, onToggleEntity, isPresentationMode, isReadOnly, onClick, isTeleportSelected }) => {
    const classes = useStyles();
    const [isEditingName, setIsEditingName] = useState(false);
    const [editingOrderRelId, setEditingOrderRelId] = useState<number | null>(null);
    const [orderDraft, setOrderDraft] = useState('');
    const [isFollowing, setIsFollowing] = useState(false);
    const entityRef = useRef(entity);

    useEffect(() => {
        entityRef.current = entity;
    }, [entity]);

    useEffect(() => {
        if (!isFollowing) return;

        const container = containerRef.current;
        if (!container) return;

        const currentMouse = { x: 0, y: 0 };
        let hasMoved = false;
        let animationFrameId: number;

        const updatePosition = (clientX: number, clientY: number) => {
            const rect = container.getBoundingClientRect();
            const scaleX = container.clientWidth / rect.width;
            const scaleY = container.clientHeight / rect.height;
            
            let newX = Math.floor(((clientX - rect.left) * scaleX) / 40);
            let newY = Math.floor(((clientY - rect.top) * scaleY) / 40);
            
            const currentEntity = entityRef.current;
            if (newX !== currentEntity.x || newY !== currentEntity.y) {
                onUpdateEntity({ ...currentEntity, x: newX, y: newY });
            }
        };

        const handlePointerMove = (moveEvent: PointerEvent) => {
            currentMouse.x = moveEvent.clientX;
            currentMouse.y = moveEvent.clientY;
            hasMoved = true;
            updatePosition(moveEvent.clientX, moveEvent.clientY);
        };

        const autoScroll = () => {
            const scrollContainer = document.getElementById('scroll-container');
            if (scrollContainer && hasMoved) {
                const rect = scrollContainer.getBoundingClientRect();
                const margin = 50;
                const speed = 15;
                let dx = 0; let dy = 0;
                
                if (currentMouse.x < rect.left + margin) dx = -speed;
                else if (currentMouse.x > rect.right - margin) dx = speed;
                
                if (currentMouse.y < rect.top + margin) dy = -speed;
                else if (currentMouse.y > rect.bottom - margin) dy = speed;
                
                if (dx !== 0 || dy !== 0) {
                    scrollContainer.scrollBy(dx, dy);
                    updatePosition(currentMouse.x, currentMouse.y);
                }
            }
            animationFrameId = requestAnimationFrame(autoScroll);
        };
        
        const handlePointerDownAnywhere = (_e: PointerEvent) => {
            setIsFollowing(false);
        };
        
        const timeoutId = setTimeout(() => {
            window.addEventListener('pointermove', handlePointerMove);
            window.addEventListener('pointerdown', handlePointerDownAnywhere, { capture: true });
            animationFrameId = requestAnimationFrame(autoScroll);
        }, 10);

        return () => {
            clearTimeout(timeoutId);
            cancelAnimationFrame(animationFrameId);
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerdown', handlePointerDownAnywhere, { capture: true });
        };
    }, [isFollowing, containerRef, onUpdateEntity]);

    // Calculate position based on grid
    const leftPx = entity.x * 40;
    const topPx = entity.y * 40;

    const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        onUpdateEntity({ ...entity, name: e.target.value });
    };

    const addField = () => {
        const newField: ERField = {
            id: Math.random().toString(36).substr(2, 9),
            name: 'new_field',
            type: 'string'
        };
        onUpdateEntity({ ...entity, fields: [...entity.fields, newField] });
    };

    const updateField = (fieldId: string, newName: string) => {
        const updatedFields = entity.fields.map(f => f.id === fieldId ? { ...f, name: newName } : f);
        onUpdateEntity({ ...entity, fields: updatedFields });
    };

    const removeField = (fieldId: string) => {
        const updatedFields = entity.fields.filter(f => f.id !== fieldId);
        onUpdateEntity({ ...entity, fields: updatedFields });
    };

    const handleHeaderClick = (e: React.MouseEvent) => {
        if (isPresentationMode || isReadOnly || isEditingName) return;
        e.stopPropagation(); // Prevent triggering toggle
        setIsFollowing(f => !f);
    };

    let headerBg = tokens.colorBrandBackground;
    let borderCol = tokens.colorBrandBackground;

    if (connectedColors.length === 1) {
        headerBg = connectedColors[0];
        borderCol = connectedColors[0];
    } else if (connectedColors.length > 1) {
        const stops = connectedColors.map((color, i) => {
            const start = (i / connectedColors.length) * 100;
            const end = ((i + 1) / connectedColors.length) * 100;
            return `${color} ${start}%, ${color} ${end}%`;
        });
        headerBg = `linear-gradient(to right, ${stops.join(', ')})`;
        borderCol = connectedColors[0];
    }
    const handleCardClick = (e: React.MouseEvent) => {
        if (onClick) {
            e.stopPropagation();
            onClick();
            return;
        }
        if (isReadOnly) return;
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'BUTTON' || target.closest('button')) {
            return;
        }
        if (target.closest(`.${classes.header}`)) {
            return;
        }
        onToggleEntity();
    };



    return (
        <Card 
            className={classes.card} 
            onClick={handleCardClick}
            style={{ 
                left: isPresentationMode ? 'auto' : `${leftPx}px`, 
                top: isPresentationMode ? 'auto' : `${topPx}px`,
                position: isPresentationMode ? 'relative' : 'absolute',
                transform: isPresentationMode ? 'none' : (isTeleportSelected ? 'translate(-50%, -50%) scale(1.05)' : 'translate(-50%, -50%)'),
                pointerEvents: isFollowing ? 'none' : 'auto', 
                opacity: isFollowing ? 0.8 : 1,
                zIndex: isFollowing ? 100 : (isTeleportSelected ? 50 : 10),
                borderColor: borderCol,
                margin: isPresentationMode ? '0' : undefined,
                boxShadow: isTeleportSelected ? '0 0 0 4px #0078d4, 0 8px 16px rgba(0,0,0,0.3)' : undefined,
                transition: 'transform 0.2s, box-shadow 0.2s',
                cursor: onClick ? 'pointer' : undefined
            }}
        >
            <div 
                className={classes.header} 
                onClick={handleHeaderClick} 
                style={{ 
                    pointerEvents: 'auto', 
                    cursor: (isPresentationMode || isReadOnly) ? 'default' : (isFollowing ? 'grabbing' : 'move'),
                    background: headerBg 
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {entityOrders.length === 1 && (
                        <div 
                            onClick={(e) => {
                                e.stopPropagation();
                                setEditingOrderRelId(entityOrders[0].relId);
                                setOrderDraft(entityOrders[0].order.toString());
                            }}
                            style={{
                                width: '24px',
                                height: '24px',
                                backgroundColor: entityOrders[0].isConflict ? tokens.colorPaletteRedBackground3 : 'rgba(0,0,0,0.3)',
                                color: tokens.colorNeutralForegroundOnBrand,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 'bold',
                                fontSize: '14px',
                                cursor: 'pointer',
                                borderRadius: '4px'
                            }}
                        >
                            {editingOrderRelId === entityOrders[0].relId ? (
                                <input 
                                    autoFocus
                                    value={orderDraft}
                                    onChange={e => setOrderDraft(e.target.value)}
                                    onBlur={() => {
                                        setEditingOrderRelId(null);
                                        const val = parseInt(orderDraft);
                                        if (!isNaN(val) && val > 0 && val !== entityOrders[0].order) onUpdateOrder(entityOrders[0].relId, val);
                                    }}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') {
                                            setEditingOrderRelId(null);
                                            const val = parseInt(orderDraft);
                                            if (!isNaN(val) && val > 0 && val !== entityOrders[0].order) onUpdateOrder(entityOrders[0].relId, val);
                                        }
                                    }}
                                    style={{
                                        width: '18px',
                                        textAlign: 'center',
                                        background: 'transparent',
                                        border: 'none',
                                        color: 'inherit',
                                        outline: 'none',
                                        fontWeight: 'bold',
                                        padding: 0
                                    }}
                                />
                            ) : (
                                entityOrders[0].order
                            )}
                        </div>
                    )}
                    {isEditingName && !isReadOnly ? (
                        <Input 
                            value={entity.name} 
                            onChange={handleNameChange} 
                            onBlur={() => setIsEditingName(false)}
                            autoFocus
                            onKeyDown={e => {
                                if (e.key === 'Enter') setIsEditingName(false);
                            }}
                            style={{ minWidth: '80px' }}
                        />
                    ) : (
                        <h3 className={classes.headerTitle} onDoubleClick={() => !isReadOnly && setIsEditingName(true)}>{entity.name}</h3>
                    )}
                </div>
                {!isReadOnly && (
                    <div style={{display: 'flex', gap: '4px'}}>
                        {!isEditingName && <Button icon={<Edit16Regular />} appearance="transparent" onClick={() => setIsEditingName(true)} style={{color: 'white', minWidth: '24px', padding: '0 4px'}} />}
                        <Button icon={<Dismiss16Regular />} appearance="transparent" onClick={() => onDeleteEntity(entity.id)} style={{color: 'white', minWidth: '24px', padding: '0 4px'}} />
                    </div>
                )}
            </div>
            
            <div className={classes.content}>
                {entity.fields.length === 0 && (
                    <div style={{textAlign: 'center', color: tokens.colorNeutralForeground3, fontSize: '12px'}}>
                        Ingen felt
                    </div>
                )}
                {entity.fields.map((field) => (
                    <div key={field.id} className={classes.fieldRow}>
                        <div style={{width: '8px', height: '8px', borderRadius: '50%', backgroundColor: tokens.colorPaletteBlueBorderActive}} />
                        {isReadOnly ? (
                            <span style={{ fontSize: '12px', flex: 1 }}>{field.name}</span>
                        ) : (
                            <>
                                <Input 
                                    className={classes.fieldInput}
                                    value={field.name}
                                    onChange={(e) => updateField(field.id, e.target.value)}
                                    size="small"
                                    appearance="underline"
                                />
                                <Button 
                                    icon={<Dismiss16Regular />} 
                                    appearance="transparent" 
                                    className={classes.deleteButton}
                                    onClick={() => removeField(field.id)}
                                />
                            </>
                        )}
                    </div>
                ))}
            </div>

            {!isReadOnly && (
                <>
                    <Divider />
                    <div className={classes.footer}>
                        <Button appearance="transparent" icon={<Add16Regular />} onClick={addField}>
                            Legg til felt
                        </Button>
                    </div>
                </>
            )}
                {entityOrders.length > 1 && (
                    <div style={{ padding: '8px', borderTop: `1px solid ${tokens.colorNeutralStroke1}`, display: 'flex', gap: '8px', flexWrap: 'wrap', backgroundColor: tokens.colorNeutralBackground2 }}>
                        {entityOrders.map(eo => (
                            <div 
                                key={eo.relId}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingOrderRelId(eo.relId);
                                    setOrderDraft(eo.order.toString());
                                }}
                                style={{
                                    width: '24px',
                                    height: '24px',
                                    backgroundColor: eo.isConflict ? tokens.colorPaletteRedBackground3 : eo.color,
                                    color: 'white',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontWeight: 'bold',
                                    fontSize: '14px',
                                    cursor: 'pointer',
                                    borderRadius: '4px',
                                    textShadow: '0px 0px 2px rgba(0,0,0,0.8)'
                                }}
                            >
                                {editingOrderRelId === eo.relId ? (
                                    <input 
                                        autoFocus
                                        value={orderDraft}
                                        onChange={e => setOrderDraft(e.target.value)}
                                        onBlur={() => {
                                            setEditingOrderRelId(null);
                                            const val = parseInt(orderDraft);
                                            if (!isNaN(val) && val > 0 && val !== eo.order) onUpdateOrder(eo.relId, val);
                                        }}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') {
                                                setEditingOrderRelId(null);
                                                const val = parseInt(orderDraft);
                                                if (!isNaN(val) && val > 0 && val !== eo.order) onUpdateOrder(eo.relId, val);
                                            }
                                        }}
                                        style={{
                                            width: '18px',
                                            textAlign: 'center',
                                            background: 'transparent',
                                            border: 'none',
                                            color: 'inherit',
                                            outline: 'none',
                                            fontWeight: 'bold',
                                            padding: 0
                                        }}
                                    />
                                ) : (
                                    eo.order
                                )}
                            </div>
                        ))}
                    </div>
                )}
        </Card>
    );
};
