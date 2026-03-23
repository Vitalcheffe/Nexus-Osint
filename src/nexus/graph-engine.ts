import type { NexusEvent, NexusSignal } from "./types";

export type EntityType = 
  | "PERSON" | "ORGANIZATION" | "LOCATION" | "EVENT" 
  | "VESSEL" | "AIRCRAFT" | "WEBSITE" | "CHANNEL"
  | "PHONE" | "EMAIL" | "IP_ADDRESS" | "DOMAIN"
  | "CRYPTO_WALLET" | "DOCUMENT" | "WEAPON" | "VEHICLE";

export type RelationType = 
  | "KNOWS" | "AFFILIATED_WITH" | "LOCATED_AT" | "PARTICIPATED_IN"
  | "OWNS" | "OPERATES" | "COMMUNICATES_WITH" | "TRANSFERRED_TO"
  | "POSTED_ON" | "MENTIONED" | "SHARED" | "VERIFIED"
  | "DISPUTED" | "CONFLICTED_WITH" | "ALLIED_WITH"
  | "FUNDED" | "SUPPLIED" | "TRAVELED_TO" | "OBSERVED";

export interface GraphNode {
  id: string;
  type: EntityType;
  label: string;
  aliases: string[];
  properties: Record<string, unknown>;
  sources: string[];
  confidence: number;
  firstSeen: Date;
  lastSeen: Date;
  pageRank?: number;
  community?: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: RelationType;
  weight: number;
  properties: Record<string, unknown>;
  sources: string[];
  confidence: number;
  timestamp: Date;
}

export interface GraphPath {
  nodes: string[];
  edges: string[];
  weight: number;
  length: number;
}

export interface Community {
  id: number;
  nodes: string[];
  modularity: number;
  label?: string;
}

export interface EntityMatch {
  node: GraphNode;
  similarity: number;
  matchType: "EXACT" | "FUZZY" | "SEMANTIC" | "ALIAS";
}

export class GraphKnowledgeEngine {
  private nodes = new Map<string, GraphNode>();
  private edges = new Map<string, GraphEdge>();
  private adjacency = new Map<string, Set<string>>();
  private reverseAdjacency = new Map<string, Set<string>>();
  private typeIndex = new Map<EntityType, Set<string>>();
  private aliasIndex = new Map<string, string>();
  private pageRankCache: Map<string, number> | null = null;
  private communityCache: Map<string, number> | null = null;

  addNode(node: Omit<GraphNode, "firstSeen" | "lastSeen">): GraphNode {
    const now = new Date();
    const fullNode: GraphNode = {
      ...node,
      firstSeen: now,
      lastSeen: now,
    };

    const existing = this.nodes.get(node.id);
    if (existing) {
      fullNode.firstSeen = existing.firstSeen;
      fullNode.aliases = [...new Set([...existing.aliases, ...node.aliases])];
      fullNode.sources = [...new Set([...existing.sources, ...node.sources])];
      fullNode.confidence = Math.max(existing.confidence, node.confidence);
    }

    this.nodes.set(node.id, fullNode);
    this.invalidateCaches();

    if (!this.typeIndex.has(node.type)) {
      this.typeIndex.set(node.type, new Set());
    }
    this.typeIndex.get(node.type)!.add(node.id);

    for (const alias of node.aliases) {
      this.aliasIndex.set(alias.toLowerCase(), node.id);
    }

    return fullNode;
  }

  getNode(id: string): GraphNode | undefined {
    return this.nodes.get(id);
  }

  findNodeByAlias(alias: string): GraphNode | undefined {
    const id = this.aliasIndex.get(alias.toLowerCase());
    return id ? this.nodes.get(id) : undefined;
  }

  getNodesByType(type: EntityType): GraphNode[] {
    const ids = this.typeIndex.get(type);
    if (!ids) return [];
    return Array.from(ids).map(id => this.nodes.get(id)!).filter(Boolean);
  }

  updateNode(id: string, updates: Partial<GraphNode>): boolean {
    const node = this.nodes.get(id);
    if (!node) return false;
    Object.assign(node, updates, { lastSeen: new Date() });
    this.invalidateCaches();
    return true;
  }

  addEdge(edge: Omit<GraphEdge, "id" | "timestamp">): GraphEdge {
    const id = `${edge.source}:${edge.type}:${edge.target}`;
    const fullEdge: GraphEdge = {
      ...edge,
      id,
      timestamp: new Date(),
    };

    const existing = this.edges.get(id);
    if (existing) {
      fullEdge.timestamp = existing.timestamp;
      fullEdge.weight = Math.max(existing.weight, edge.weight);
      fullEdge.sources = [...new Set([...existing.sources, ...edge.sources])];
    }

    this.edges.set(id, fullEdge);

    if (!this.adjacency.has(edge.source)) {
      this.adjacency.set(edge.source, new Set());
    }
    this.adjacency.get(edge.source)!.add(edge.target);

    if (!this.reverseAdjacency.has(edge.target)) {
      this.reverseAdjacency.set(edge.target, new Set());
    }
    this.reverseAdjacency.get(edge.target)!.add(edge.source);

    this.invalidateCaches();
    return fullEdge;
  }

  getEdge(source: string, target: string, type?: RelationType): GraphEdge | undefined {
    if (type) {
      return this.edges.get(`${source}:${type}:${target}`);
    }
    for (const [id, edge] of this.edges) {
      if (edge.source === source && edge.target === target) {
        return edge;
      }
    }
    return undefined;
  }

  getEdgesFrom(nodeId: string): GraphEdge[] {
    const neighbors = this.adjacency.get(nodeId);
    if (!neighbors) return [];
    return Array.from(neighbors)
      .map(target => this.getEdge(nodeId, target))
      .filter((e): e is GraphEdge => e !== undefined);
  }

  getEdgesTo(nodeId: string): GraphEdge[] {
    const neighbors = this.reverseAdjacency.get(nodeId);
    if (!neighbors) return [];
    return Array.from(neighbors)
      .map(source => this.getEdge(source, nodeId))
      .filter((e): e is GraphEdge => e !== undefined);
  }

  computePageRank(iterations = 20, damping = 0.85): Map<string, number> {
    if (this.pageRankCache) return this.pageRankCache;

    const n = this.nodes.size;
    if (n === 0) return new Map();

    const ranks = new Map<string, number>();
    const outDegree = new Map<string, number>();

    for (const [id] of this.nodes) {
      ranks.set(id, 1 / n);
      outDegree.set(id, this.adjacency.get(id)?.size ?? 0);
    }

    for (let i = 0; i < iterations; i++) {
      const newRanks = new Map<string, number>();
      let sinkSum = 0;

      for (const [id, degree] of outDegree) {
        if (degree === 0) {
          sinkSum += ranks.get(id) ?? 0;
        }
      }

      for (const [id] of this.nodes) {
        let sum = sinkSum / n;
        const incoming = this.reverseAdjacency.get(id) ?? new Set();

        for (const source of incoming) {
          const sourceRank = ranks.get(source) ?? 0;
          const sourceDegree = outDegree.get(source) ?? 1;
          sum += sourceRank / sourceDegree;
        }

        newRanks.set(id, (1 - damping) / n + damping * sum);
      }

      for (const [id, rank] of newRanks) {
        ranks.set(id, rank);
      }
    }

    const maxRank = Math.max(...ranks.values());
    for (const [id, rank] of ranks) {
      ranks.set(id, rank / maxRank);
      const node = this.nodes.get(id);
      if (node) node.pageRank = rank / maxRank;
    }

    this.pageRankCache = ranks;
    return ranks;
  }

  detectCommunities(): Map<string, number> {
    if (this.communityCache) return this.communityCache;

    const communities = new Map<string, number>();
    const nodeArray = Array.from(this.nodes.keys());

    for (let i = 0; i < nodeArray.length; i++) {
      communities.set(nodeArray[i], i);
    }

    let improved = true;
    const maxIterations = 100;
    let iteration = 0;

    while (improved && iteration < maxIterations) {
      improved = false;
      iteration++;

      for (const nodeId of nodeArray) {
        const currentCommunity = communities.get(nodeId) ?? 0;
        const neighbors = this.getNeighbors(nodeId);

        if (neighbors.length === 0) continue;

        const communityScores = new Map<number, number>();
        for (const neighbor of neighbors) {
          const neighborCommunity = communities.get(neighbor) ?? 0;
          communityScores.set(
            neighborCommunity,
            (communityScores.get(neighborCommunity) ?? 0) + 1
          );
        }

        let bestCommunity = currentCommunity;
        let bestScore = communityScores.get(currentCommunity) ?? 0;

        for (const [community, score] of communityScores) {
          if (score > bestScore) {
            bestScore = score;
            bestCommunity = community;
          }
        }

        if (bestCommunity !== currentCommunity) {
          communities.set(nodeId, bestCommunity);
          improved = true;
        }
      }
    }

    const uniqueCommunities = new Set(communities.values());
    const mapping = new Map<number, number>();
    let idx = 0;
    for (const c of uniqueCommunities) {
      mapping.set(c, idx++);
    }

    for (const [nodeId, community] of communities) {
      const newCommunity = mapping.get(community) ?? 0;
      communities.set(nodeId, newCommunity);
      const node = this.nodes.get(nodeId);
      if (node) node.community = newCommunity;
    }

    this.communityCache = communities;
    return communities;
  }

  shortestPath(source: string, target: string): GraphPath | null {
    if (!this.nodes.has(source) || !this.nodes.has(target)) return null;

    const distances = new Map<string, number>();
    const previous = new Map<string, string>();
    const visited = new Set<string>();
    const queue = new Set<string>([source]);

    distances.set(source, 0);

    while (queue.size > 0) {
      let current: string | null = null;
      let minDist = Infinity;

      for (const nodeId of queue) {
        const dist = distances.get(nodeId) ?? Infinity;
        if (dist < minDist) {
          minDist = dist;
          current = nodeId;
        }
      }

      if (!current) break;
      queue.delete(current);

      if (current === target) break;

      visited.add(current);
      const neighbors = this.adjacency.get(current) ?? new Set();

      for (const neighbor of neighbors) {
        if (visited.has(neighbor)) continue;

        const edge = this.getEdge(current, neighbor);
        const weight = edge ? 1 / edge.weight : 1;
        const newDist = (distances.get(current) ?? 0) + weight;

        if (newDist < (distances.get(neighbor) ?? Infinity)) {
          distances.set(neighbor, newDist);
          previous.set(neighbor, current);
          queue.add(neighbor);
        }
      }
    }

    if (!distances.has(target)) return null;

    const path: string[] = [target];
    let current: string | undefined = target;
    while ((current = previous.get(current!)) !== undefined) {
      path.unshift(current);
    }

    return {
      nodes: path,
      edges: this.getPathEdges(path),
      weight: distances.get(target) ?? 0,
      length: path.length - 1,
    };
  }

  findAllPaths(source: string, target: string, maxDepth = 4): GraphPath[] {
    const paths: GraphPath[] = [];
    const visited = new Set<string>();

    const dfs = (current: string, path: string[], depth: number) => {
      if (depth > maxDepth) return;
      if (current === target && path.length > 1) {
        paths.push({
          nodes: [...path],
          edges: this.getPathEdges(path),
          weight: path.length,
          length: path.length - 1,
        });
        return;
      }

      visited.add(current);
      const neighbors = this.getNeighbors(current);

      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          path.push(neighbor);
          dfs(neighbor, path, depth + 1);
          path.pop();
        }
      }

      visited.delete(current);
    };

    dfs(source, [source], 0);
    return paths.sort((a, b) => a.length - b.length);
  }

  simulateInfluence(seeds: string[], steps = 10): Map<string, number> {
    const active = new Set<string>(seeds);
    const influenced = new Map<string, number>();

    for (const seed of seeds) {
      influenced.set(seed, 1);
    }

    let currentActive = new Set<string>(seeds);

    for (let step = 0; step < steps; step++) {
      const newActive = new Set<string>();

      for (const nodeId of currentActive) {
        const neighbors = this.adjacency.get(nodeId) ?? new Set();

        for (const neighbor of neighbors) {
          if (active.has(neighbor)) continue;

          const edge = this.getEdge(nodeId, neighbor);
          const probability = edge ? edge.weight * edge.confidence : 0.1;

          if (Math.random() < probability) {
            newActive.add(neighbor);
            active.add(neighbor);
            influenced.set(
              neighbor,
              (influenced.get(neighbor) ?? 0) + probability
            );
          }
        }
      }

      if (newActive.size === 0) break;
      currentActive = newActive;
    }

    return influenced;
  }

  findSimilarEntities(query: string | GraphNode, threshold = 0.7): EntityMatch[] {
    const matches: EntityMatch[] = [];

    let queryNode: Partial<GraphNode>;
    if (typeof query === "string") {
      queryNode = { label: query, aliases: [], type: "PERSON" };
    } else {
      queryNode = query;
    }

    for (const node of this.nodes.values()) {
      if (typeof query === "string" && node.id === (query as any).id) continue;

      const similarity = this.computeEntitySimilarity(queryNode, node);

      if (similarity >= threshold) {
        let matchType: EntityMatch["matchType"] = "FUZZY";
        if (similarity >= 0.99) matchType = "EXACT";
        else if (node.aliases.some(a => a.toLowerCase() === queryNode.label?.toLowerCase())) {
          matchType = "ALIAS";
        }

        matches.push({ node, similarity, matchType });
      }
    }

    return matches.sort((a, b) => b.similarity - a.similarity);
  }

  getNeighbors(nodeId: string): string[] {
    const outgoing = this.adjacency.get(nodeId) ?? new Set();
    const incoming = this.reverseAdjacency.get(nodeId) ?? new Set();
    return [...new Set([...outgoing, ...incoming])];
  }

  getSubgraph(nodeIds: string[]): { nodes: GraphNode[]; edges: GraphEdge[] } {
    const nodeSet = new Set(nodeIds);
    const nodes = nodeIds.map(id => this.nodes.get(id)!).filter(Boolean);
    const edges: GraphEdge[] = [];

    for (const edge of this.edges.values()) {
      if (nodeSet.has(edge.source) && nodeSet.has(edge.target)) {
        edges.push(edge);
      }
    }

    return { nodes, edges };
  }

  getCommunities(): Community[] {
    const communitiesMap = this.detectCommunities();
    const groups = new Map<number, string[]>();

    for (const [nodeId, communityId] of communitiesMap) {
      if (!groups.has(communityId)) {
        groups.set(communityId, []);
      }
      groups.get(communityId)!.push(nodeId);
    }

    return Array.from(groups.entries()).map(([id, nodes]) => ({
      id,
      nodes,
      modularity: this.computeModularity(nodes),
    }));
  }

  exportToJSON(): { nodes: GraphNode[]; edges: GraphEdge[] } {
    return {
      nodes: Array.from(this.nodes.values()),
      edges: Array.from(this.edges.values()),
    };
  }

  importFromJSON(data: { nodes: GraphNode[]; edges: GraphEdge[] }): void {
    this.clear();

    for (const node of data.nodes) {
      this.nodes.set(node.id, node);

      if (!this.typeIndex.has(node.type)) {
        this.typeIndex.set(node.type, new Set());
      }
      this.typeIndex.get(node.type)!.add(node.id);

      for (const alias of node.aliases) {
        this.aliasIndex.set(alias.toLowerCase(), node.id);
      }
    }

    for (const edge of data.edges) {
      this.edges.set(edge.id, edge);

      if (!this.adjacency.has(edge.source)) {
        this.adjacency.set(edge.source, new Set());
      }
      this.adjacency.get(edge.source)!.add(edge.target);

      if (!this.reverseAdjacency.has(edge.target)) {
        this.reverseAdjacency.set(edge.target, new Set());
      }
      this.reverseAdjacency.get(edge.target)!.add(edge.source);
    }
  }

  clear(): void {
    this.nodes.clear();
    this.edges.clear();
    this.adjacency.clear();
    this.reverseAdjacency.clear();
    this.typeIndex.clear();
    this.aliasIndex.clear();
    this.invalidateCaches();
  }

  stats(): { nodes: number; edges: number; types: number; communities: number } {
    const communities = this.detectCommunities();
    return {
      nodes: this.nodes.size,
      edges: this.edges.size,
      types: this.typeIndex.size,
      communities: new Set(communities.values()).size,
    };
  }

  private invalidateCaches(): void {
    this.pageRankCache = null;
    this.communityCache = null;
  }

  private getPathEdges(nodes: string[]): string[] {
    const edges: string[] = [];
    for (let i = 0; i < nodes.length - 1; i++) {
      const edge = this.getEdge(nodes[i], nodes[i + 1]);
      if (edge) edges.push(edge.id);
    }
    return edges;
  }

  private computeEntitySimilarity(a: Partial<GraphNode>, b: GraphNode): number {
    let score = 0;
    let factors = 0;

    if (a.label && b.label) {
      const labelSim = this.stringSimilarity(a.label, b.label);
      score += labelSim;
      factors++;
    }

    if (a.type && b.type) {
      score += a.type === b.type ? 1 : 0;
      factors++;
    }

    if (a.aliases?.length && b.aliases.length) {
      const aliasSim = this.setOverlap(
        new Set(a.aliases.map(x => x.toLowerCase())),
        new Set(b.aliases.map(x => x.toLowerCase()))
      );
      score += aliasSim;
      factors++;
    }

    if (a.properties && b.properties) {
      const propSim = this.propertySimilarity(a.properties as Record<string, unknown>, b.properties);
      score += propSim;
      factors++;
    }

    return factors > 0 ? score / factors : 0;
  }

  private stringSimilarity(a: string, b: string): number {
    const s1 = a.toLowerCase();
    const s2 = b.toLowerCase();
    if (s1 === s2) return 1;
    const tokens1 = new Set(s1.split(/\s+/));
    const tokens2 = new Set(s2.split(/\s+/));
    return this.setOverlap(tokens1, tokens2);
  }

  private setOverlap(a: Set<string>, b: Set<string>): number {
    const intersection = new Set([...a].filter(x => b.has(x)));
    const union = new Set([...a, ...b]);
    return union.size > 0 ? intersection.size / union.size : 0;
  }

  private propertySimilarity(a: Record<string, unknown>, b: Record<string, unknown>): number {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    if (keys.size === 0) return 0;
    let matches = 0;
    for (const key of keys) {
      if (a[key] === b[key]) matches++;
    }
    return matches / keys.size;
  }

  private computeModularity(nodes: string[]): number {
    const nodeSet = new Set(nodes);
    let internal = 0;
    let total = 0;

    for (const nodeId of nodes) {
      const edges = this.getEdgesFrom(nodeId);
      for (const edge of edges) {
        total += edge.weight;
        if (nodeSet.has(edge.target)) {
          internal += edge.weight;
        }
      }
    }

    return total > 0 ? internal / total : 0;
  }
}

export const graphEngine = new GraphKnowledgeEngine();
