import { PageLoading } from "@/components/PageLoading";

export default function Loading() {
  return (
    <PageLoading
      eyebrow="Live from gateway"
      title="Tools surface"
      description="Pulling tool list from the gateway. The first request after idle wakes the machine — cold-start can be a few seconds."
      variant="grid"
    />
  );
}
