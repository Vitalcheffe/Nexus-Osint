import { NextResponse } from "next/server";

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const input = searchParams.get("input");

    if (!input || typeof input !== "string") {
        return NextResponse.json({ error: "Input is required" }, { status: 400 });
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
        console.error("GOOGLE_MAPS_API_KEY is not defined");
        return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    try {
        // Types parameter to restrict to cities and regions
        const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(
            input
        )}&types=(regions)&key=${apiKey}`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
            console.error("Google Places API Error:", data);
            return NextResponse.json({ error: "Failed to fetch predictions" }, { status: 500 });
        }

        const predictions = data.predictions.map((p: any) => ({
            description: p.description,
            placeId: p.place_id,
            mainText: p.structured_formatting?.main_text || p.description,
            secondaryText: p.structured_formatting?.secondary_text || "",
            types: p.types,
        }));

        return NextResponse.json({ predictions });
    } catch (error) {
        console.error("Error in Places Autocomplete route:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
