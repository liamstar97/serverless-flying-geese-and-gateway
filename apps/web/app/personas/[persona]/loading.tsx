import { PageLoading } from "@/components/PageLoading";

export default function Loading() {
  return (
    <PageLoading
      title="Persona"
      description="Loading recipe + tool surface…"
      variant="grid"
      maxWidth="5xl"
      paddingY="py-10"
      headerMb="mb-6"
    />
  );
}
