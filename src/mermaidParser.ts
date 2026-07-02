import type { EREntity, ERField, ERRelationship } from './types';

export function parseMermaidERDiagram(
    mermaidText: string, 
    startEntityId: number, 
    startRelId: number, 
    startColorIdx: number
): { newEntities: EREntity[], newRelationships: ERRelationship[] } {
    const newEntities: EREntity[] = [];
    const newRelationships: ERRelationship[] = [];
    
    // Fjern kommentarer og overflødig whitespace
    let cleanText = mermaidText.replace(/%%.*/g, '');
    
    // Parse Entities: ENTITY_NAME { ... } (Krever at navnet står først på linjen)
    const entityRegex = /(?:^|\n)\s*([A-Za-z0-9_]+)\s*\{([^}]*)\}/g;
    let match;
    let entityIdCounter = startEntityId;
    
    // For å kunne knytte relasjoner til riktig ID senere
    const entityNameToId: Record<string, number> = {};

    let currentX = 5;
    let currentY = 5;

    while ((match = entityRegex.exec(cleanText)) !== null) {
        const entityName = match[1].trim();
        const body = match[2].trim();
        
        const fields: ERField[] = [];
        const lines = body.split('\n');
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            // F.eks: string OrgNr PK, eller string Navn "Noe tekst"
            // Vi splitter på whitespace, og tar hensyn til quotes
            // Men en enkel split holder for de første delene
            const parts = line.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
            
            if (parts.length >= 2) {
                const type = parts[0];
                let name = parts[1];
                let rest = parts.slice(2);
                
                if (rest.includes('PK')) {
                    name += ' (PK)';
                    rest = rest.filter(p => p !== 'PK');
                }
                
                if (type) {
                    name += `: ${type}`;
                }
                
                fields.push({
                    id: `field-${entityIdCounter}-${i}`,
                    name: name,
                    type: type + (rest.length > 0 ? ` ${rest.join(' ')}` : '')
                });
            } else if (parts.length === 1) {
                fields.push({
                    id: `field-${entityIdCounter}-${i}`,
                    name: parts[0],
                    type: ''
                });
            }
        }
        
        const newEntity: EREntity = {
            id: entityIdCounter,
            name: entityName,
            fields,
            x: currentX,
            y: currentY,
            colorIdx: entityIdCounter % 10
        };
        
        newEntities.push(newEntity);
        entityNameToId[entityName] = entityIdCounter;
        entityIdCounter++;
        
        // Simpel layout strategi
        currentX += 15;
        if (currentX > 60) {
            currentX = 5;
            currentY += 15;
        }
    }
    
    // Parse Relationships (Veldig forenklet)
    // F.eks: KOMMUNE ||--o{ ORGAN : "har"
    const relRegex = /([A-Za-z0-9_]+)\s+([|o\-{}]+)\s+([A-Za-z0-9_]+)\s*:\s*([^\n]+)/g;
    let relMatch;
    let relIdCounter = startRelId;
    let colorCounter = startColorIdx;
    
    while ((relMatch = relRegex.exec(cleanText)) !== null) {
        const leftEntity = relMatch[1];
        const rightEntity = relMatch[3];
        
        const leftId = entityNameToId[leftEntity];
        const rightId = entityNameToId[rightEntity];
        
        if (leftId !== undefined && rightId !== undefined) {
            const relSymbol = relMatch[2];
            let leftCard = 'none';
            let rightCard = 'none';
            
            if (relSymbol.startsWith('||')) leftCard = '1..1';
            else if (relSymbol.startsWith('|o')) leftCard = '0..1';
            else if (relSymbol.startsWith('}o')) leftCard = '0..N';
            else if (relSymbol.startsWith('}|')) leftCard = '1..N';
            
            if (relSymbol.endsWith('||')) rightCard = '1..1';
            else if (relSymbol.endsWith('o|')) rightCard = '0..1';
            else if (relSymbol.endsWith('o{')) rightCard = '0..N';
            else if (relSymbol.endsWith('|{')) rightCard = '1..N';

            newRelationships.push({
                id: relIdCounter++,
                entityIds: [leftId, rightId],
                paths: null,
                crossings: 0,
                colorIdx: colorCounter++ % 6,
                cardinalities: [`${leftCard}|${rightCard}`]
            });
        }
    }
    
    return { newEntities, newRelationships };
}
