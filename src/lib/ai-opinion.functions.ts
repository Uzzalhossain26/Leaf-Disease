import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  imageDataUrl: z.string().startsWith("data:image/").max(2_000_000),
  cropName: z.string().max(200),
  classNames: z.array(z.string().max(200)).max(50),
  knnResult: z.string().max(300),
  knnConfidence: z.number(),
});

export type AiOpinion = { agree: boolean; suggested_class: string; explanation_bn: string; advice_bn: string };

export const getAiOpinion = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }): Promise<{ ok: true; opinion: AiOpinion } | { ok: false; error: string }> => {
    // Respect the admin on/off switch server-side.
    const { createClient } = await import("@supabase/supabase-js");
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const sb = createClient(process.env["SUPABASE_URL"]!, key, {
      auth: { persistSession: false },
      global: {
        fetch: (input, init) => {
          const h = new Headers(init?.headers);
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h });
        },
      },
    });
    const { data: setting } = await sb.from("app_settings").select("value").eq("key", "ai_opinion_enabled").maybeSingle();
    if (setting?.value !== true) return { ok: false, error: "AI মতামত বন্ধ আছে।" };

    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) return { ok: false, error: "AI কনফিগার করা নেই।" };

    const { streamText } = await import("ai");
    const { createLovableAiGatewayProvider } = await import("./ai/gateway.server");
    const provider = createLovableAiGatewayProvider(apiKey, undefined, { baseURL: "https://ai.gateway.lovable.dev/v1" });

    const prompt = `তুমি একজন উদ্ভিদ রোগ বিশেষজ্ঞ। ছবিতে একটি "${data.cropName}" এর পাতা আছে।
সম্ভাব্য শ্রেণিগুলো: ${data.classNames.join(", ")}
আমাদের মডেলের ফলাফল: ${data.knnResult} (নিশ্চয়তা ${data.knnConfidence}%)।
ছবি দেখে বলো তুমি একমত কিনা। শুধু নিচের JSON আকারে উত্তর দাও, অন্য কিছু নয়:
{"agree": boolean, "suggested_class": "উপরের তালিকা থেকে একটি শ্রেণির নাম হুবহু", "explanation_bn": "২-৩ বাক্যে বাংলায় ব্যাখ্যা", "advice_bn": "২-৩ বাক্যে কৃষকের জন্য বাংলায় পরামর্শ"}`;

    try {
      const result = streamText({
        model: provider("google/gemini-3-flash-preview"),
        providerOptions: { lovable: { response_format: { type: "json_object" } } },
        messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image", image: data.imageDataUrl }] }],
      });
      const text = await result.text;
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) return { ok: false, error: "AI উত্তর বোঝা যায়নি।" };
      const j = JSON.parse(m[0]);
      return {
        ok: true,
        opinion: {
          agree: !!j.agree,
          suggested_class: String(j.suggested_class ?? ""),
          explanation_bn: String(j.explanation_bn ?? ""),
          advice_bn: String(j.advice_bn ?? ""),
        },
      };
    } catch (e: unknown) {
      const status = (e as { statusCode?: number })?.statusCode;
      console.error("ai opinion", status, e);
      if (status === 429) return { ok: false, error: "অনেক অনুরোধ এসেছে, একটু পরে চেষ্টা করুন।" };
      if (status === 402 || status === 403) return { ok: false, error: "AI সেবা এখন পাওয়া যাচ্ছে না।" };
      return { ok: false, error: "AI মতামত পাওয়া যায়নি।" };
    }
  });
