import { NextResponse } from "next/server";

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const placeId = searchParams.get("place_id");

    if (!placeId || typeof placeId !== "string") {
        return NextResponse.json({ error: "place_id is required" }, { status: 400 });
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
        console.error("GOOGLE_MAPS_API_KEY is not defined");
        return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    try {
        const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(
            placeId
        )}&fields=geometry,name,type&key=${apiKey}`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.status !== "OK") {
            console.error("Google Places Details API Error:", data);
            return NextResponse.json({ error: "Failed to fetch place details" }, { status: 500 });
        }

        const location = data.result.geometry?.location;
        if (!location) {
            return NextResponse.json({ error: "No geometry found for place" }, { status: 404 });
        }

        return NextResponse.json({
            lat: location.lat,
            lon: location.lng,
            name: data.result.name,
            types: data.result.types || [],
        });
    } catch (error) {
        console.error("Error in Places Details route:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
