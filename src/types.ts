export interface ERField {
    id: string;
    name: string;
    type: string;
}

export interface EREntity {
    id: number;
    name: string;
    fields: ERField[];
    x: number; // Grid coordinate X (can represent the top-left corner)
    y: number; // Grid coordinate Y
    colorIdx: number;
}

// Representing an independent snake connecting a series of points (ER Boxes)
export interface ERRelationship {
    id: number;
    entityIds: number[]; // Sequence of entities this relationship connects
    paths: number[][] | null; // Calculated paths for each segment on the grid
    crossings: number;
    colorIdx: number;
    cardinalities: string[]; // one for each edge segment
    customOrders?: Record<number, number>; // Transient state for manual order editing conflicts
}
