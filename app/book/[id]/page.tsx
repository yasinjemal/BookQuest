import ReadingEditionReader from "@/components/ReadingEditionReader";

export default async function BookPage({ params }: { params: Promise<{ id: string }> }) {
  return <ReadingEditionReader bookId={Number((await params).id)} />;
}
