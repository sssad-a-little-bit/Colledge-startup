import { PublicNews } from "@/components/public";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PublicNews id={id} />;
}
