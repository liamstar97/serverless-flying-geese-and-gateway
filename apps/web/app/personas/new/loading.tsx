import { PageLoading } from "@/components/PageLoading";

export default function Loading() {
  return (
    <PageLoading
      eyebrow="Persona builder"
      title="New persona"
      description="Loading the live tool surface…"
      variant="form"
      maxWidth="3xl"
      paddingY="py-10"
      headerMb="mb-8"
    />
  );
}
