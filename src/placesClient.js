const DEFAULT_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.rating",
  "places.userRatingCount",
  "places.googleMapsUri",
  "places.websiteUri",
  "places.businessStatus",
  "places.primaryTypeDisplayName"
].join(",");

function numberOrUndefined(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function compactPlace(place = {}) {
  return {
    id: place.id,
    name: place.displayName?.text,
    address: place.formattedAddress,
    rating: place.rating,
    userRatingCount: place.userRatingCount,
    googleMapsUri: place.googleMapsUri,
    websiteUri: place.websiteUri,
    businessStatus: place.businessStatus,
    category: place.primaryTypeDisplayName?.text,
    location: place.location
  };
}

export function buildPlacesTextSearchRequest({
  query,
  latitude,
  longitude,
  radiusMeters,
  maxResultCount = 10,
  languageCode = "th",
  regionCode = "TH"
}) {
  const body = {
    textQuery: query,
    languageCode,
    regionCode,
    maxResultCount: Math.min(Math.max(Number(maxResultCount) || 10, 1), 20)
  };

  const lat = numberOrUndefined(latitude);
  const lng = numberOrUndefined(longitude);
  const radius = numberOrUndefined(radiusMeters);
  if (lat !== undefined && lng !== undefined && radius !== undefined) {
    body.locationBias = {
      circle: {
        center: { latitude: lat, longitude: lng },
        radius
      }
    };
  }

  return body;
}

export async function searchPlacesText({
  apiKey,
  query,
  latitude,
  longitude,
  radiusMeters,
  maxResultCount,
  fieldMask = DEFAULT_FIELD_MASK,
  fetchImpl = fetch
}) {
  if (!apiKey) {
    throw new Error("Google Places API key is not configured. Set GOOGLE_PLACES_API_KEY and enable Places API.");
  }
  if (!query) {
    throw new Error("Google Places search query is required.");
  }

  const response = await fetchImpl("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": fieldMask
    },
    body: JSON.stringify(
      buildPlacesTextSearchRequest({
        query,
        latitude,
        longitude,
        radiusMeters,
        maxResultCount
      })
    )
  });
  const body = await response.json();

  if (!response.ok) {
    throw new Error(`Google Places API failed: ${response.status} ${JSON.stringify(body)}`);
  }

  const places = (body.places || []).map(compactPlace);
  return {
    query,
    totalPlaces: places.length,
    places
  };
}
