import { guard, failure } from "@/lib/server";
import { drive } from "@/lib/drive";
export async function GET(req: Request) {
  try {
    const s = await guard(req);
    const { bytes } = await drive(
      s,
      new URL(req.url).searchParams.get("id") || "",
      true,
    );
    return new Response(new Uint8Array(bytes!), {
      headers: {
        "Content-Type": "application/pdf",
        "Cache-Control": "no-store",
        "Content-Disposition": 'inline; filename="document.pdf"',
      },
    });
  } catch (e) {
    return failure(e);
  }
}
