import test from "node:test";
import assert from "node:assert/strict";

import { buildPlacesTextSearchRequest, searchPlacesText } from "../src/placesClient.js";
import { buildCeoPartnerFunctionDeclarations, createCeoPartnerTools } from "../src/aiTools.js";

test("Places text search request includes optional location bias", () => {
  const body = buildPlacesTextSearchRequest({
    query: "ร้านติดฟิล์มรถยนต์ บางแค",
    latitude: "13.7",
    longitude: "100.4",
    radiusMeters: "5000",
    maxResultCount: 25
  });

  assert.equal(body.textQuery, "ร้านติดฟิล์มรถยนต์ บางแค");
  assert.equal(body.maxResultCount, 20);
  assert.equal(body.locationBias.circle.center.latitude, 13.7);
  assert.equal(body.locationBias.circle.radius, 5000);
});

test("Places text search returns compact competitor results", async () => {
  const calls = [];
  const result = await searchPlacesText({
    apiKey: "places-key",
    query: "car film shop",
    maxResultCount: 2,
    fetchImpl: async (url, options) => {
      calls.push({ url, headers: options.headers, body: JSON.parse(options.body) });
      return Response.json({
        places: [
          {
            id: "place-1",
            displayName: { text: "Competitor Film" },
            formattedAddress: "Bang Khae",
            rating: 4.8,
            userRatingCount: 120,
            googleMapsUri: "https://maps.google.com/?cid=1",
            location: { latitude: 13.7, longitude: 100.4 }
          }
        ]
      });
    }
  });

  assert.equal(calls[0].url, "https://places.googleapis.com/v1/places:searchText");
  assert.equal(calls[0].headers["X-Goog-Api-Key"], "places-key");
  assert.match(calls[0].headers["X-Goog-FieldMask"], /places.rating/);
  assert.equal(calls[0].body.textQuery, "car film shop");
  assert.equal(result.totalPlaces, 1);
  assert.equal(result.places[0].name, "Competitor Film");
  assert.equal(result.places[0].rating, 4.8);
});

test("CEO Partner tools expose nearby competitor search", async () => {
  assert.ok(buildCeoPartnerFunctionDeclarations().some((declaration) => declaration.name === "search_nearby_competitors"));

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({
      places: [{ id: "place-1", displayName: { text: "Nearby Competitor" }, rating: 4.5 }]
    });
  try {
    const tools = createCeoPartnerTools({
      config: {
        google: {
          places: {
            apiKey: "places-key",
            defaultQuery: "ร้านติดฟิล์มรถยนต์ใกล้บางแค",
            radiusMeters: 5000
          }
        }
      },
      storage: {}
    });

    const result = await tools.handlers.search_nearby_competitors({ maxResultCount: 3 });
    assert.equal(result.query, "ร้านติดฟิล์มรถยนต์ใกล้บางแค");
    assert.equal(result.places[0].name, "Nearby Competitor");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
