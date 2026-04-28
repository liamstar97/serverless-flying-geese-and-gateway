import { PageLoading } from "@/components/PageLoading";

export default function Loading() {
  return (
    <PageLoading
      eyebrow="Admin"
      title="Users"
      variant="list"
      maxWidth="5xl"
      paddingY="py-10"
      headerMb="mb-6"
    />
  );
}
