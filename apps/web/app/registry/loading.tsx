import { PageLoading } from "@/components/PageLoading";

export default function Loading() {
  return (
    <PageLoading
      eyebrow="Live config"
      title="Virtual-tool registry"
      description="Loading the merged registry…"
      variant="split"
      maxWidth="7xl"
      paddingY="py-10"
      headerMb="mb-6"
    />
  );
}
