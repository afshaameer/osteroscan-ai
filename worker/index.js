const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request, env) {
    const headers = {
      ...corsHeaders,
      "Content-Type": "application/json",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    if (request.method === "GET") {
      return Response.json(
        { status: "OsteoScan AI API is running" },
        { headers }
      );
    }

    if (request.method !== "POST") {
      return Response.json(
        { error: "Method not allowed" },
        { status: 405, headers }
      );
    }

    try {
      if (!env.GEMINI_API_KEY) {
        throw new Error("API key is not configured.");
      }

      const { imageBase64, mimeType } = await request.json();

      if (!imageBase64 || !mimeType) {
        return Response.json(
          { error: "Image data and MIME type are required." },
          { status: 400, headers }
        );
      }

      const allowedTypes = [
        "image/jpeg",
        "image/png",
        "image/webp",
      ];

      if (!allowedTypes.includes(mimeType)) {
        return Response.json(
          { error: "Unsupported image format." },
          { status: 400, headers }
        );
      }

      if (imageBase64.length > 10_000_000) {
        return Response.json(
          { error: "Image is too large. Please upload a smaller image." },
          { status: 413, headers }
        );
      }

      const prompt = `
You are assisting with an educational bone X-ray image analysis demonstration.

Examine the uploaded image cautiously. Do not claim to provide a medical diagnosis.
If the image is not clearly a bone X-ray or is too unclear, state that analysis is inconclusive.

Return ONLY valid JSON with these fields:
{
  "fractured": false,
  "confidence": 0,
  "bone_region": "Unknown",
  "bone_sub": "Not determined",
  "fracture_type": "Not determined",
  "fracture_sub": "Not determined",
  "severity": "None",
  "severity_scores": {
    "mild": 0,
    "moderate": 0,
    "severe": 0
  },
  "findings": "Educational image observations",
  "recommendations": [
    "Consult a qualified medical professional."
  ]
}

Use confidence as a number between 0 and 1.
Use severity values Mild, Moderate, Severe, or None.
Do not invent findings. If uncertain, clearly say so.
This is an educational demonstration, not a clinical diagnostic tool.
`;

      const geminiResponse = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": env.GEMINI_API_KEY,
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    inlineData: {
                      mimeType,
                      data: imageBase64,
                    },
                  },
                  { text: prompt },
                ],
              },
            ],
            generationConfig: {
              responseMimeType: "application/json",
            },
          }),
        }
      );

      const result = await geminiResponse.json();

      if (!geminiResponse.ok) {
        return Response.json(
          { error: "Gemini API request failed.", details: result.error?.message },
          { status: 502, headers }
        );
      }

      const text = result.candidates?.[0]?.content?.parts
        ?.map((part) => part.text || "")
        .join("");

      if (!text) {
        throw new Error("The AI returned an empty response.");
      }

      const analysis = JSON.parse(text);

      return Response.json(analysis, { headers });

    } catch (error) {
      return Response.json(
        { error: error.message || "Something went wrong." },
        { status: 500, headers }
      );
    }
  },
};