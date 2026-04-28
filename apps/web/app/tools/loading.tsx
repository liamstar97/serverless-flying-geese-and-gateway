import { PageLoading } from "@/components/PageLoading";

export default function Loading() {
  return (
    <PageLoading
      eyebrow="Live from gateway"
      title="Tools surface"
      description="Pulling tool list from the gateway."
      variant="grid"
      maxWidth="5xl"
      paddingY="py-12"
      headerMb="mb-8"
    />
  );
}
