// src/app/certification/page.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function CertificationPage() {
  return (
    <div className="container mx-auto py-10 space-y-6">
      <h1 className="text-3xl font-bold">Certification</h1>
      <p className="text-zinc-400">
        دریافت گواهینامه رسمی پس از تکمیل دوره‌ها.
      </p>

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle>Fundamental Analysis</CardTitle>
          </CardHeader>
          <CardContent>
            <p>گواهینامه تحلیل فاندامنتال بعد از اتمام دوره و آزمون نهایی.</p>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle>NFT & Metaverse</CardTitle>
          </CardHeader>
          <CardContent>
            <p>گواهینامه معتبر در حوزه NFT و متاورس.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
