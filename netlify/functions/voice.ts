import type { Handler } from "@netlify/functions";

// GET /api/voice — Premium TTS Voice Proxy Endpoint with intelligent auto-sweep & fallbacks.
// Logic is unchanged from the original Express route; only req/res was swapped
// for the Netlify Functions event/response shape, and the binary audio body is
// base64-encoded since Netlify Functions responses must be strings.
export const handler: Handler = async (event) => {
  try {
    const text = event.queryStringParameters?.text;
    const requestedMode = event.queryStringParameters?.mode;

    if (!text) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Text is required" }),
      };
    }

    // Smart language-aware model routing
    const isBengali = /[\u0980-\u09FF]/.test(text);

    // Build fallback queue
    let modesToTry: string[] = [];
    if (requestedMode) {
      modesToTry.push(requestedMode);
    }

    if (isBengali) {
      // Prioritize sweet Bengali voice for Bengali texts
      if (!requestedMode || !requestedMode.startsWith("bn")) {
        modesToTry.unshift("bn_f_sweet");
      }
      modesToTry.push("bn_f_sweet", "bn_m_normal", "en_uk_f_sonia", "en_us_f_jenny");
    } else {
      if (!requestedMode) {
        modesToTry.push("en_uk_f_sonia");
      }
      modesToTry.push("en_us_f_jenny", "en_us_f_aria", "en_in_f_neerja", "bn_f_sweet");
    }

    // Deduplicate
    modesToTry = Array.from(new Set(modesToTry));

    let audioResponse: Response | null = null;
    let successfulMode = "";

    for (const mode of modesToTry) {
      try {
        const targetUrl = `https://rafidmondal-raxzen-voice.hf.space/raxzen-voice?text=${encodeURIComponent(text)}&mode=${encodeURIComponent(mode)}`;

        const response = await fetch(targetUrl, {
          method: "GET",
          headers: {
            "x-api-key": "raxzen_voice_free_unlimited_api",
          },
        });

        if (response.ok) {
          audioResponse = response;
          successfulMode = mode;
          break;
        } else {
          console.warn(`Voice API failed for mode: ${mode}, status: ${response.status}. trying next...`);
        }
      } catch (err) {
        console.warn(`Error connecting to Voice API mode ${mode}:`, err);
      }
    }

    if (!audioResponse) {
      throw new Error("All voice models in the fallback sweep list failed.");
    }

    const arrayBuffer = await audioResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": audioResponse.headers.get("content-type") || "audio/mpeg",
        "X-Voice-Mode-Used": successfulMode,
      },
      body: buffer.toString("base64"),
      isBase64Encoded: true,
    };
  } catch (error: any) {
    console.error("Voice Proxy Route Error:", error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: error.message || "Failed to generate TTS audio" }),
    };
  }
};
