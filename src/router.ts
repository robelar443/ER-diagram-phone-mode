export let W = 80;
export let H = 60;
export let MAX_NODES = W * H;

let STATE_SIZE = MAX_NODES;
let dist = new Int32Array(STATE_SIZE);
let vis = new Int32Array(STATE_SIZE);
let parent_u = new Int32Array(STATE_SIZE);
let parent_cross = new Uint8Array(STATE_SIZE);
let search_id = 0;

export const updateGridDimensions = (newW: number, newH: number) => {
    if (newW === W && newH === H) return;
    W = newW;
    H = newH;
    MAX_NODES = W * H;
    STATE_SIZE = MAX_NODES;
    dist = new Int32Array(STATE_SIZE);
    vis = new Int32Array(STATE_SIZE);
    parent_u = new Int32Array(STATE_SIZE);
    parent_cross = new Uint8Array(STATE_SIZE);
};

export const get_idx = (u: number) => u; 
export const manhattan = (u: number, v: number) => Math.abs((u % W) - (v % W)) + Math.abs(Math.floor(u / W) - Math.floor(v / W));

const MAX_PQSZ = 500000;
export class MinHeap {
    dist: Int32Array;
    node: Int32Array;
    sz: number;
    pop_dist: number;
    pop_u: number;

    constructor() {
        this.dist = new Int32Array(MAX_PQSZ);
        this.node = new Int32Array(MAX_PQSZ);
        this.sz = 0;
        this.pop_dist = 0;
        this.pop_u = 0;
    }

    init() { this.sz = 0; }

    push(d: number, u: number) {
        let i = this.sz++;
        while (i > 0) {
            let p = (i - 1) >>> 2;
            let pd = this.dist[p];
            if (pd <= d) break;
            this.dist[i] = pd;
            this.node[i] = this.node[p];
            i = p;
        }
        this.dist[i] = d;
        this.node[i] = u;
    }

    pop() {
        let sz = this.sz;
        if (sz === 0) return false;

        this.pop_dist = this.dist[0];
        this.pop_u = this.node[0];

        sz--;
        this.sz = sz;
        if (sz === 0) return true;

        let last_d = this.dist[sz];
        let last_u = this.node[sz];
        let i = 0;

        while (true) {
            let c_idx = (i << 2) + 1;
            if (c_idx >= sz) break;

            let best = c_idx;
            let best_d = this.dist[c_idx];

            let t = c_idx + 1; if (t < sz && this.dist[t] < best_d) { best_d = this.dist[t]; best = t; }
            t = c_idx + 2; if (t < sz && this.dist[t] < best_d) { best_d = this.dist[t]; best = t; }
            t = c_idx + 3; if (t < sz && this.dist[t] < best_d) { best_d = this.dist[t]; best = t; }

            if (best_d >= last_d) break;

            this.dist[i] = best_d;
            this.node[i] = this.node[best];
            i = best;
        }

        this.dist[i] = last_d;
        this.node[i] = last_u;
        return true;
    }
}

export const heap = new MinHeap();

export const runAStar = (S: number, E: number, grid_state: Uint8Array): { path: number[], crossings: number } | null => {
    search_id++;
    heap.init();

    vis[S] = search_id;
    dist[S] = 0;
    heap.push(manhattan(S, E), S);

    const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    const CROSS_PENALTY = 100000;

    while (heap.sz > 0) {
        heap.pop();
        let u = heap.pop_u;
        let g = dist[u];

        if (u === E) {
            let path = [];
            let curr_u = E;
            let total_cross = 0;
            while (curr_u !== S) {
                path.unshift(curr_u);
                total_cross += parent_cross[curr_u];
                curr_u = parent_u[curr_u];
            }
            path.unshift(S);
            return { path, crossings: total_cross };
        }

        let ux = u % W;
        let uy = Math.floor(u / W);

        for (let i = 0; i < 4; i++) {
            let nx = ux + dirs[i][0];
            let ny = uy + dirs[i][1];
            
            if (nx >= 0 && nx < W && ny >= 0 && ny < H) {
                let v = ny * W + nx;
                
                if (grid_state[v] === 3) {
                    continue; // All entities are solid obstacles
                }
                
                let is_cross = (grid_state[v] === 1 || grid_state[v] === 2) && v !== S && v !== E ? 1 : 0;
                let cost = is_cross ? CROSS_PENALTY : 1;
                let ng = g + cost;

                if (vis[v] !== search_id || ng < dist[v]) {
                    vis[v] = search_id;
                    dist[v] = ng;
                    parent_u[v] = u;
                    parent_cross[v] = is_cross;
                    heap.push(ng + manhattan(v, E), v);
                }
            }
        }
    }
    return null;
};

export interface ObstacleBox {
    id: number;
    center: number;
    cells: number[];
}

export const attemptSolve = (targets: number[], relId: number, allBoxes: ObstacleBox[], existingPaths: number[][], offsets: Map<number, Map<number, number>>): { paths: number[][], crossings: number } | null => {
    let grid_state = new Uint8Array(W * H);
    let box_state = new Int32Array(W * H);
    box_state.fill(-1);
    
    for (let path of existingPaths) {
        for (let u of path) {
            if (u >= 0 && u < W * H) grid_state[u] = 1;
        }
    }
    
    for (let box of allBoxes) {
        for (let c of box.cells) {
            if (c >= 0 && c < W * H) {
                grid_state[c] = 3;
                box_state[c] = box.id;
            }
        }
    }

    for (let t of targets) {
        if (t >= 0 && t < W * H) grid_state[t] = 2; 
    }

    let global_paths: number[][] = [];
    let global_c = 0;

    for (let i = 0; i < targets.length - 1; i++) {
        let S_center = targets[i];
        let E_center = targets[i + 1];
        
        let S_x = S_center % W;
        let E_x = E_center % W;

        let sBox = allBoxes.find(b => b.center === S_center);
        let eBox = allBoxes.find(b => b.center === E_center);

        let S_offset = (sBox && offsets.has(sBox.id)) ? (offsets.get(sBox.id)!.get(relId) || 0) : 0;
        let E_offset = (eBox && offsets.has(eBox.id)) ? (offsets.get(eBox.id)!.get(relId) || 0) : 0;

        let S_y = Math.floor(S_center / W) + S_offset;
        let E_y = Math.floor(E_center / W) + E_offset;

        let s_opts = [
            { v: Math.max(0, S_x - 3), r: Math.max(0, S_x - 4) }, // Left
            { v: Math.min(W - 1, S_x + 3), r: Math.min(W - 1, S_x + 4) }  // Right
        ];
        let e_opts = [
            { v: Math.max(0, E_x - 3), r: Math.max(0, E_x - 4) }, // Left
            { v: Math.min(W - 1, E_x + 3), r: Math.min(W - 1, E_x + 4) }  // Right
        ];
        
        let best_dist = Infinity;
        let S_opt = s_opts[1]; // Default to right
        let E_opt = e_opts[0]; // Default to left
        
        let valid_s = s_opts.filter(so => grid_state[S_y * W + so.r] !== 3);
        let valid_e = e_opts.filter(eo => grid_state[E_y * W + eo.r] !== 3);
        if (valid_s.length === 0) valid_s = s_opts; // Fallback
        if (valid_e.length === 0) valid_e = e_opts; // Fallback

        for (let so of valid_s) {
            for (let eo of valid_e) {
                let d = Math.abs(so.r - eo.r) + Math.abs(S_y - E_y);
                if (d < best_dist) {
                    best_dist = d;
                    S_opt = so;
                    E_opt = eo;
                }
            }
        }

        let visual_S_x = S_opt.v;
        let route_S_x = S_opt.r;
        let S = S_y * W + route_S_x;

        let visual_E_x = E_opt.v;
        let route_E_x = E_opt.r;
        let E = E_y * W + route_E_x;

        grid_state[S] = 1; 
        grid_state[E] = 0; 

        let res = runAStar(S, E, grid_state);

        if (res) {
            let visual_S = S_y * W + visual_S_x;
            let visual_E = E_y * W + visual_E_x;
            
            res.path.unshift(visual_S);
            res.path.push(visual_E);
            
            global_paths.push(res.path);
            global_c += res.crossings;

            for (let u of res.path) grid_state[u] = 1; 
        } else {
            return null;
        }
    }
    return { paths: global_paths, crossings: global_c };
};
