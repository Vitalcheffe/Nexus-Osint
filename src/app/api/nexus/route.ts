import { NextRequest, NextResponse } from "next/server";
import { federatedSearch } from "@/nexus/federated-search";
import { graphEngine } from "@/nexus/graph-engine";
import { stixMapper, convertEventToStix } from "@/nexus/stix-integration";
import { nexusEngine } from "@/nexus/engine";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const action = searchParams.get("action");

  try {
    switch (action) {
      case "status":
        return NextResponse.json({
          status: "operational",
          engines: {
            federatedSearch: federatedSearch.getAvailableSources(),
            graphEngine: graphEngine.stats(),
            stix: "ready",
          },
          timestamp: new Date().toISOString(),
        });

      case "sources":
        return NextResponse.json({
          sources: federatedSearch.getAvailableSources(),
          status: federatedSearch.getSourceStatus(),
        });

      case "graph-stats":
        return NextResponse.json({ stats: graphEngine.stats() });

      default:
        return NextResponse.json({
          message: "NEXUS Intelligence API v2.0",
          endpoints: {
            "GET ?action=status": "System status",
            "GET ?action=sources": "Available data sources",
            "GET ?action=graph-stats": "Graph engine statistics",
            "POST ?action=search": "Federated search",
            "POST ?action=graph-add": "Add nodes/edges",
            "POST ?action=graph-path": "Find path",
            "POST ?action=stix-export": "Export STIX 2.1",
          },
        });
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const action = searchParams.get("action");

  try {
    const body = await request.json();

    switch (action) {
      case "search": {
        const response = await federatedSearch.search({
          text: body.query ?? "",
          filters: {
            dateStart: body.dateStart ? new Date(body.dateStart) : undefined,
            dateEnd: body.dateEnd ? new Date(body.dateEnd) : undefined,
            location: body.location,
            countries: body.countries,
            sources: body.sources,
          },
          options: {
            maxResults: body.maxResults ?? 50,
            timeout: body.timeout ?? 30000,
          },
        });
        return NextResponse.json(response);
      }

      case "graph-add": {
        if (body.nodes) {
          for (const node of body.nodes) {
            graphEngine.addNode(node);
          }
        }
        if (body.edges) {
          for (const edge of body.edges) {
            graphEngine.addEdge(edge);
          }
        }
        return NextResponse.json({ success: true, stats: graphEngine.stats() });
      }

      case "graph-path": {
        const { source, target } = body;
        if (!source || !target) {
          return NextResponse.json({ error: "source and target required" }, { status: 400 });
        }
        const path = graphEngine.shortestPath(source, target);
        return NextResponse.json({ path, found: path !== null });
      }

      case "graph-paths": {
        const { source, target, maxDepth } = body;
        if (!source || !target) {
          return NextResponse.json({ error: "source and target required" }, { status: 400 });
        }
        const paths = graphEngine.findAllPaths(source, target, maxDepth ?? 4);
        return NextResponse.json({ paths, count: paths.length });
      }

      case "graph-communities": {
        const communities = graphEngine.getCommunities();
        return NextResponse.json({ communities });
      }

      case "graph-pagerank": {
        const ranks = graphEngine.computePageRank();
        return NextResponse.json({
          ranks: Array.from(ranks.entries())
            .map(([id, rank]) => ({ id, rank }))
            .sort((a, b) => b.rank - a.rank)
            .slice(0, 50),
        });
      }

      case "graph-similar": {
        const { query, threshold } = body;
        if (!query) {
          return NextResponse.json({ error: "query required" }, { status: 400 });
        }
        const matches = graphEngine.findSimilarEntities(query, threshold ?? 0.7);
        return NextResponse.json({ matches });
      }

      case "stix-export": {
        const { eventId } = body;
        if (eventId) {
          const events = nexusEngine.getEvents();
          const event = events.find(e => e.id === eventId);
          if (!event) {
            return NextResponse.json({ error: "Event not found" }, { status: 404 });
          }
          const bundle = convertEventToStix(event);
          return NextResponse.json(bundle);
        }
        const events = nexusEngine.getEvents();
        const bundles = events.slice(0, 10).map(convertEventToStix);
        return NextResponse.json({
          type: "bundle",
          id: `bundle--${crypto.randomUUID()}`,
          bundles: bundles.length,
          objects: bundles.flatMap(b => b.objects),
        });
      }

      case "stix-create": {
        const { type, data } = body;
        let result;
        switch (type) {
          case "identity":
            result = stixMapper.createIdentity(data);
            break;
          case "location":
            result = stixMapper.createLocation(data);
            break;
          case "indicator":
            result = stixMapper.createIndicator(data);
            break;
          case "threat-actor":
            result = stixMapper.createThreatActor(data);
            break;
          case "relationship":
            result = stixMapper.createRelationship(data);
            break;
          case "report":
            result = stixMapper.createReport(data);
            break;
          default:
            return NextResponse.json({ error: "Unknown STIX type" }, { status: 400 });
        }
        return NextResponse.json(result);
      }

      case "stix-bundle": {
        const bundle = stixMapper.createBundle();
        return NextResponse.json(bundle);
      }

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error) {
    console.error("NEXUS API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
