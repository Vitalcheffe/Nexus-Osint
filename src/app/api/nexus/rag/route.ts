import { NextResponse } from "next/server";
import { buildRAGContext } from "@/nexus/science-engine";

/**
 * NEXUS RAG Context API
 * POST /api/nexus/rag
 * 
 * Construit le contexte RAG pour un cluster d'alerte :
 * ACLED + GDELT + ReliefWeb → prompt enrichi → Claude API
 * 
 * Basé sur: ArXiv 2505.09852 (2025)
 * "Do LLMs Know Conflict? Parametric vs Non-Parametric Knowledge"
 * → RAG améliore la prédiction de +34% vs connaissance paramétrique seule
 */

export async function POST(req: Request) {
  try {
    const { zone, country, lat, lng, signals, correlationLevel } = await req.json();

    if (!zone || !country || lat === undefined || lng === undefined) {
      return NextResponse.json({ error: "Missing zone/country/lat/lng" }, { status: 400 });
    }

    // 1. Construire le contexte RAG
    const ragContext = await buildRAGContext(zone, country, lat, lng, 200, 30);

    // 2. Construire le prompt enrichi avec contexte RAG
    const systemPrompt = `Tu es un analyste de renseignement OSINT senior avec accès aux bases de données ACLED, GDELT et UN OCHA. 
Tu fournis des briefings concis, factuels et actionnables en français.
Format: 4-5 phrases maximum. Style: Intel brief classifié. Pas d'alarmisme. Conclusions fermes avec nuances.
NE PAS citer les limitations ou incertitudes — cela est implicite dans tout renseignement.`;

    const userPrompt = `BRIEFING DEMANDÉ — ${zone} (${country})
Niveau d'alerte NEXUS: ${correlationLevel}/10
Signaux corrélés: ${(signals || []).length}

=== CONTEXTE TERRAIN (ACLED — ${ragContext.timeWindowDays}j) ===
${ragContext.acledEvents.slice(0, 4).map(e => 
  `• [${e.event_type}] ${e.actor1} vs ${e.actor2} · ${e.admin1 || zone} · ${e.fatalities} fatalités`
).join("\n")}

=== CONTEXTE MÉDIAS (GDELT Goldstein) ===
${ragContext.gdeltEvents.slice(0, 3).map(e =>
  `• [CAMEO ${e.eventCode}] ${e.actor1}→${e.actor2} · Goldstein: ${e.goldsteinScale} · ${e.numArticles} articles`
).join("\n")}

=== ACTEURS IDENTIFIÉS ===
${ragContext.topActors.slice(0, 5).join(", ")}

=== FACTEURS STRUCTURELS ===
${ragContext.conflictDrivers.slice(0, 3).join("; ")}

=== TENDANCE ESCALADE ===
${(ragContext.escalationTrend * 100).toFixed(0)}% (ViEWS calibration)

=== SIGNAUX NEXUS ACTIFS ===
${(signals || []).slice(0, 6).map((s: any) => `• [${s.source}] ${s.text}`).join("\n")}

Produis un briefing exécutif de 4-5 phrases incluant:
1. Situation actuelle (faits)
2. Pattern historique identifié  
3. Acteurs clés et dynamiques
4. Vecteur d'escalade probable sur 48h
5. Recommandation d'action (surveillance/alerte/escalade)`;

    // 3. Appel Claude avec streaming
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY || "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 400,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!claudeRes.ok) {
      // Fallback: retourner le contexte sans LLM
      return NextResponse.json({
        summary: ragContext.contextSummary,
        ragContext,
        llmAvailable: false,
      });
    }

    const claudeData = await claudeRes.json();
    const summary = claudeData.content?.[0]?.text || ragContext.contextSummary;

    return NextResponse.json({
      summary,
      ragContext,
      llmAvailable: true,
      model: claudeData.model,
      inputTokens: claudeData.usage?.input_tokens,
      outputTokens: claudeData.usage?.output_tokens,
    });

  } catch (err) {
    return NextResponse.json(
      { error: "RAG context build failed", details: String(err) },
      { status: 500 }
    );
  }
}
